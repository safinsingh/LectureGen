import * as z from "zod";
import { ZLecture, ZLectureSlide } from "./index.js";

export const LectureConfigSchema = z.object({
  lecture_topic: z.string().min(1, "lecture_topic cannot be empty"),
});

export const LecturePreferencesSchema = z.object({
  lecture_length: z.enum(["short", "medium", "long"]),
  tone: z.enum(["direct", "warm", "funny"]),
  enable_questions: z.boolean(),
});

export const UploadedFileSchema = z.object({
  filename: z.string(),
  mimetype: z.string(),
  file: z.any(),
});

export const CreateLectureUploadSchema = z.object({
  lecture_config: LectureConfigSchema,
  lecture_preferences: LecturePreferencesSchema.optional(),
  files: z.array(UploadedFileSchema).optional(),
});

// create a zod type out of
// // REQUEST HELPERS //
// type QOption = { text: string; option_id: Uuid };
// // diff types of questions
// type QStub<T> = T & { question: string; question_id: Uuid };
// export type CreateLectureQuestion = QStub<
//   | { question_type: "radio"; options: QOption[] }
//   | { question_type: "checkbox"; options: QOption[] }
//   | { question_type: "text_input" }
// >;
// export ZCreateLectureQuestion

// WEBSOCKET 2 MESSAGE TYPES

export const ZGetLectureRequest = z.object({
  type: z.literal("get_lecture_request"),
  lecture_id: z.string(),
});

export const ZGetLectureResponse = z.object({
  type: z.literal("get_lecture_response"),
  lecture: ZLecture,
});

export const ZUserQuestionRequest = z.object({
  type: z.literal("user_question_request"),
  lecture_id: z.string(),
  slide: z.number(),
  question: z.string(),
});

export const ZUserQuestionResponse = z.object({
  type: z.literal("user_question_response"),
  answer: z.string(),
  partial_lecture: z.optional(
    z.object({
      slides: z.array(ZLectureSlide),
      from_slide: z.number(),
    })
  ),
});

export const ZBackendQuestionRequest = z.object({
  type: z.literal("backend_question"),
  lecture_id: z.string(),
  current_slide: z.number(),
  question: z.string(),
  answer: z.string(),
});

export const ZBackendQuestionResponse = z.object({
  type: z.literal("backend_question"),
  feedback: z.string(),
});

export const ZInboundMessage = z.union([
  ZGetLectureRequest,
  ZUserQuestionRequest,
  ZBackendQuestionRequest,
]);

export const ZOutboundMessage = z.union([
  ZGetLectureResponse,
  ZUserQuestionResponse,
  ZBackendQuestionResponse,
]);

export type GetLectureRequest = z.infer<typeof ZGetLectureRequest>;
export type GetLectureResponse = z.infer<typeof ZGetLectureResponse>;
export type UserQuestionRequest = z.infer<typeof ZUserQuestionRequest>;
export type UserQuestionResponse = z.infer<typeof ZUserQuestionResponse>;
export type BackendQuestionRequest = z.infer<typeof ZBackendQuestionRequest>;

export type InboundMessage = z.infer<typeof ZInboundMessage>;
export type OutboundMessage = z.infer<typeof ZOutboundMessage>;
