const { z } = require("zod");

const ZLectureSlide = z.object({
  transcript: z.string(),
  audio_transcription_link: z.string(),
  title: z.string(),
  content: z.string().optional(),
  diagram: z.string().optional(),
  image: z.string().optional(),
  question: z.string().optional(),
});

const ZLecture = z.object({
  version: z.number(),
  topic: z.string(),
  permitted_users: z.array(z.string()),
  slides: z.array(ZLectureSlide),
});

// Export all zod_types schemas
const ZGetLectureRequest = z.object({
  type: z.literal("get_lecture_request"),
  lecture_id: z.string(),
});

const ZGetLectureResponse = z.object({
  type: z.literal("get_lecture_response"),
  lecture: ZLecture,
});

const ZUserQuestionRequest = z.object({
  type: z.literal("user_question_request"),
  lecture_id: z.string(),
  current_slide: z.number(),
  question: z.string(),
});

const ZUserAnalyzeQuery = z.discriminatedUnion("answer_category", [
  z.object({
    answer_category: z.literal("simple"),
    response: z.string(),
  }),
  z.object({
    answer_category: z.literal("regenerate_slides"),
    response: z.string(),
    instructions: z.string(),
  }),
]);

const ZUserQuestionResponse = z.object({
  type: z.literal("user_question_response"),
  response: ZUserAnalyzeQuery,
});

const ZBackendQuestionRequest = z.object({
  type: z.literal("backend_question_request"),
  lecture_id: z.string(),
  current_slide: z.number(),
  question: z.string(),
  answer: z.string(),
});

const ZBackendQuestionResponse = z.object({
  type: z.literal("backend_question_response"),
  feedback: z.string(),
});

const ZInboundMessage = z.union([
  ZGetLectureRequest,
  ZUserQuestionRequest,
  ZBackendQuestionRequest,
]);

const ZOutboundMessage = z.union([
  ZGetLectureResponse,
  ZUserQuestionResponse,
  ZBackendQuestionResponse,
]);

module.exports = {
  ZLecture,
  ZLectureSlide,
  ZGetLectureRequest,
  ZGetLectureResponse,
  ZUserQuestionRequest,
  ZUserAnalyzeQuery,
  ZUserQuestionResponse,
  ZBackendQuestionRequest,
  ZBackendQuestionResponse,
  ZInboundMessage,
  ZOutboundMessage,
};
