import { RouteHandler } from "fastify";
import { CreateLectureUploadSchema } from "schema/zod_types";
import { buildFileUploadsForLLM } from "../helpers/file";
import { ASSET_CACHE } from "../lib/file_cache";
import * as z from "zod";
import {
  create_lecture_stub,
  userDoc,
  lectureDoc,
  admin,
} from "../lib/firebase_admin";
import {
  CreateLectureInitialResponse,
  CreateLectureMainRequest,
  CreateLectureStatusUpdate,
  Lecture,
  LectureSlide,
} from "schema";
import { generate_clarifying_questions } from "../helpers/claude/clarifying_questions";
import { llm } from "../lib/mouse";
import { WebsocketHandler } from "@fastify/websocket";
import { generate_transcript } from "../helpers/claude/transcript";
import { generateMermaidDiagrams } from "../helpers/claude/mermaid";
import { getImageForKeyword } from "../helpers/image";
import { generateAvatarSpeech } from "../helpers/livekit/tts";

export const create_lecture_initial: RouteHandler = async (req, res) => {
  let lectureConfigRaw: unknown = undefined;
  let lecturePrefsRaw: unknown = undefined;

  const fileParts: Array<{
    filename: string;
    mimetype: string;
    file: NodeJS.ReadableStream;
  }> = [];

  // req.parts() is AsyncIterable<Multipart | MultipartFile>, where
  // - MultipartFile has: file, filename, mimetype, fieldname, etc.
  // - MultipartValue<T> has: value, fieldname, etc.
  //
  // We have to narrow manually.

  for await (const part of req.parts()) {
    // FILE BRANCH
    // Heuristic: file parts have .file (Readable stream) and .filename (string).
    if ("file" in part && typeof part.file !== "undefined") {
      // This is a file upload field

      if (part.fieldname === "files") {
        fileParts.push({
          filename: part.filename, // string
          mimetype: part.mimetype, // string
          file: part.file, // Readable stream
        });
      } else {
        return res.code(400).send({
          success: false,
          error: `Unexpected file field '${part.fieldname}'`,
        });
      }

      continue;
    }

    // TEXT BRANCH
    // MultipartValue<T> has .value which is the string body of the field
    if ("value" in part) {
      if (part.fieldname === "lecture_config") {
        try {
          lectureConfigRaw = JSON.parse(part.value as string);
        } catch {
          return res
            .code(400)
            .send({ error: "lecture_config is not valid JSON" });
        }
      } else if (part.fieldname === "lecture_preferences") {
        try {
          lecturePrefsRaw = JSON.parse(part.value as string);
        } catch {
          return res
            .code(400)
            .send({ error: "lecture_preferences is not valid JSON" });
        }
      } else if (part.fieldname === "files") {
        // If the client *accidentally* sends a text field also named "files"
        // instead of a binary part, reject to keep the API strict.
        return res.code(400).send({
          success: false,
          error:
            "Expected 'files' to be file upload(s), not text. Got text field.",
        });
      } else {
        return res.code(400).send({
          success: false,
          error: `Unexpected field '${part.fieldname}'`,
        });
      }

      continue;
    }

    // If we hit here, Fastify gave us something we didn't expect
    return res.code(400).send({
      success: false,
      error: "Received multipart part of unknown type",
    });
  }

  // Build the candidate object for Zod validation
  const candidate = {
    lecture_config: lectureConfigRaw,
    lecture_preferences: lecturePrefsRaw,
    files: fileParts.length > 0 ? fileParts : undefined,
  };

  // Validate with Zod
  const parsed = CreateLectureUploadSchema.safeParse(candidate);

  if (!parsed.success) {
    return res.code(400).send({
      success: false,
      error: "Validation failed: " + z.treeifyError(parsed.error),
    });
  }

  const data = parsed.data;

  // You can now trust `data`
  // data.lecture_config.lecture_topic (string)
  // data.lecture_preferences?.tone (enum or undefined)
  // data.files?.[i].file (Readable stream)

  const { uid } = req.user!;
  const user_preferences = await userDoc(uid)
    .get()
    .then((mouse) => mouse.data()?.user_preferences);
  if (!user_preferences) {
    return res.code(400).send({
      success: false,
      error: "Invalid user",
    });
  }

  const llmFiles = await buildFileUploadsForLLM(data.files);
  const stub = await create_lecture_stub(uid, data.lecture_preferences);

  const questions = await generate_clarifying_questions(llm, {
    topic: data.lecture_config.lecture_topic,
    user_preferences,
    custom_preferences: data.lecture_preferences,
  });
  ASSET_CACHE.set(stub, {
    uid,
    file_uploads: llmFiles,
    custom_preferences: data.lecture_preferences,
    questions,
    user_preferences,
    lecture_topic: data.lecture_config.lecture_topic,
  });

  return res.code(200).send({
    lecture_id: stub,
    questions,
    success: true,
  } satisfies CreateLectureInitialResponse);
};

export const create_lecture_main: WebsocketHandler = async (ws, req) => {
  const { lecture_id, answers } = req.query as CreateLectureMainRequest;
  const user = req.user!;

  const cached = ASSET_CACHE.get(lecture_id);
  if (!cached || cached.uid !== user.uid) {
    ws.send(
      JSON.stringify({
        success: false,
        error: "Lecture not found or forbidden",
      })
    );
    ws.close();
    return;
  }

  const ts = await generate_transcript(llm, {
    ...cached,
    answers,
  });
  ws.send(
    JSON.stringify({
      type: "completedOne",
      completed: "transcript",
    } satisfies CreateLectureStatusUpdate)
  );
  ws.send(
    JSON.stringify({
      type: "enumerated",
      thing: "images",
      total: ts.filter((s) => s.image !== undefined).length,
    } satisfies CreateLectureStatusUpdate)
  );
  ws.send(
    JSON.stringify({
      type: "enumerated",
      thing: "diagrams",
      total: ts.filter((s) => s.diagram !== undefined).length,
    } satisfies CreateLectureStatusUpdate)
  );
  ws.send(
    JSON.stringify({
      type: "enumerated",
      thing: "tts",
      total: ts.length,
    } satisfies CreateLectureStatusUpdate)
  );

  type RecursivePartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
      ? RecursivePartial<U>[]
      : T[P] extends object | undefined
        ? RecursivePartial<T[P]>
        : T[P];
  };

  const lec: RecursivePartial<Lecture> = {
    permitted_users: [user.uid],
    version: 1,
    slides: ts.map(
      (t) =>
        ({
          transcript: t.transcript,
          title: t.slide.title,
          content: t.slide.markdown_body,
          // diagram
          // image
          // voiceover
        }) satisfies Partial<LectureSlide>
    ),
  };

  let imageCount = 0;
  let audioCount = 0;
  let diagramCount = 0;
  await Promise.all([
    // ALL DA MERMAID DIAGS
    //
    // Old code. This is really sad. I am really sad.
    //
    // generateMermaidDiagrams(
    //   llm,
    //   ts
    //     .map((s, sidx) => ({ s, sidx }))
    //     .filter(({ s }) => s.diagram != undefined)
    //     .map(({ s, sidx }) => ({
    //       type: s.diagram!.type,
    //       extended_description: s.diagram!.extended_description,
    //       slide_num: sidx,
    //     }))
    // ).then((mmds) => {
    //   for (const mmd of mmds) {
    //     lec.slides![Number.parseInt(mmd.slide_number)].diagram = mmd.mermaid;
    //   }
    //   ws.send(
    //     JSON.stringify({
    //       type: "completedOne",
    //       completed: "diagrams",
    //     } satisfies CreateLectureStatusUpdate)
    //   );
    // }),

    ...ts
      .map((s, sidx) => ({ s, sidx }))
      .filter(({ s }) => s.diagram !== undefined)
      .map(({ s, sidx }) =>
        generateMermaidDiagrams(llm, s.diagram!).then((dg) => {
          lec.slides![sidx].diagram = dg;
          ws.send(
            JSON.stringify({
              type: "completedOne",
              completed: "diagrams",
              counter: ++imageCount,
            } satisfies CreateLectureStatusUpdate)
          );
        })
      ),

    // ALL DA IMAGES
    ...ts
      .map((s, sidx) => ({ s, sidx }))
      .filter(({ s }) => s.image !== undefined)
      .map(({ s, sidx }) =>
        getImageForKeyword(
          s.image!.search_term,
          s.image!.extended_description
        ).then((img) => {
          lec.slides![sidx].image = img;
          ws.send(
            JSON.stringify({
              type: "completedOne",
              completed: "images",
              counter: ++diagramCount,
            } satisfies CreateLectureStatusUpdate)
          );
        })
      ),
    // ALL DA VOICEOVERS
    ...ts.map((s, sidx) =>
      generateAvatarSpeech(s.transcript).then((speech) => {
        lec.slides![sidx].voiceover = speech.audioUrl;
        ws.send(
          JSON.stringify({
            type: "completedOne",
            completed: "tts",
            counter: ++audioCount,
          } satisfies CreateLectureStatusUpdate)
        );
      })
    ),
  ]);

  const ld = lectureDoc(lecture_id);
  await ld.set(lec as Lecture);
  const ud = userDoc(user.uid);
  await ud.update({
    lectures: admin.firestore.FieldValue.arrayUnion(lecture_id),
  });

  ws.send(
    JSON.stringify({
      type: "completedAll",
    } satisfies CreateLectureStatusUpdate)
  );
  ws.close();
};
