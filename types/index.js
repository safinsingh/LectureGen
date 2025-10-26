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
  permitted_users: z.array(z.string()),
  slides: z.array(ZLectureSlide),
});

module.exports = {
  ZLecture,
  ZLectureSlide,
};
