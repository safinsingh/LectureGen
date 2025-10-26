import type { WebsocketHandler } from "@fastify/websocket";
import { lectureDoc } from "../lib/firebase_admin.js";
import type { Lecture } from "schema";

/**
 * WebSocket #2 fetches a complete lecture from Firebase
 // firebase contains 
 * and sends it to the client immediately for the S7: Display Lecture page 
 *
 * The lecture object contains:
 * - version: number
 * - permitted_users: string[]
 * - slides: LectureSlide[] where each slide has:
 *   - transcript: string
 *   - voiceover: string (audio URL)
 *   - title: string
 *   - content?: string (markdown text)
 *   - diagram?: string (mermaid diagram code)
 *   - image?: string (image URL)
 *   - question?: string
 *
 * Query params:
 * - lecture_id: string (required)
 *
 * Response format:
 * { success: true, lecture: Lecture } OR { success: false, error: string }
 */
export const get_lecture_ws: WebsocketHandler = async (ws, req) => {
  const { lecture_id } = req.query as { lecture_id?: string };

  req.log.info({
    route: '/api/lecture',
    query: req.query,
    headers: req.headers
  }, '[WS2] WebSocket connection established');

  // validate lecture_id
  if (!lecture_id) {
    req.log.warn('[WS2] Missing lecture_id parameter in request');
    ws.send(
      JSON.stringify({
        success: false,
        error: "Missing lecture_id query parameter",
      })
    );
    ws.close();
    return;
  }

  try {
    req.log.info({ lecture_id }, '[WS2] Fetching lecture from Firebase');

    // fetch lecture from Firebase
    const lectureRef = lectureDoc(lecture_id);
    const lectureSnapshot = await lectureRef.get();

    if (!lectureSnapshot.exists) {
      req.log.warn({ lecture_id }, '[WS2] Lecture not found in Firebase');
      ws.send(
        JSON.stringify({
          success: false,
          error: `Lecture with id '${lecture_id}' not found`,
        })
      );
      ws.close();
      return;
    }

    const lecture = lectureSnapshot.data() as Lecture;
    req.log.info({
      lecture_id,
      slideCount: lecture.slides?.length || 0,
      version: lecture.version,
      permittedUsers: lecture.permitted_users
    }, '[WS2] Lecture retrieved from Firebase');

    // Log slide details
    if (lecture.slides) {
      lecture.slides.forEach((slide, idx) => {
        req.log.debug({
          lecture_id,
          slideIndex: idx,
          title: slide.title,
          hasContent: !!slide.content,
          hasDiagram: !!slide.diagram,
          hasImage: !!slide.image,
          hasVoiceover: !!slide.voiceover,
          hasQuestion: !!slide.question,
          contentLength: slide.content?.length || 0,
          transcriptLength: slide.transcript?.length || 0
        }, `[WS2] Slide ${idx + 1} details`);
      });
    }

    // checks if user has permission to review the lecture
    // 1) check if authenticated in firebase & in permitted_users array
    // const user = req.user;
    // if (user && !lecture.permitted_users.includes(user.uid)) {
    //   req.log.warn(`User ${user.uid} not permitted to access lecture ${lecture_id}`);
    //   ws.send(JSON.stringify({ success: false, error: "Forbidden: You don't have permission to view this lecture" }));
    //   ws.close();
    //   return;
    // }

    const payload = {
      success: true,
      lecture,
    };

    const payloadSize = JSON.stringify(payload).length;
    req.log.info({
      lecture_id,
      payloadSize,
      slideCount: lecture.slides?.length || 0
    }, '[WS2] Sending lecture to client');

    // send the complete lecture to the client
    // react-markdown to render slide.content as HTML
    // and mermaid to render slide.diagram
    ws.send(JSON.stringify(payload));

    req.log.info({ lecture_id }, '[WS2] Lecture sent successfully, closing connection in 100ms');

    // Keep connection open briefly to ensure message is received
    setTimeout(() => {
      req.log.debug({ lecture_id }, '[WS2] Closing WebSocket connection');
      ws.close();
    }, 100);
  } catch (error) {
    req.log.error({
      error,
      lecture_id,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined
    }, '[WS2] Error fetching lecture');
    ws.send(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch lecture",
      })
    );
    ws.close();
  }
};
