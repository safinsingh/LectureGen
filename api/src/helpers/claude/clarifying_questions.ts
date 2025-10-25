import { CreateLectureQuestion } from "schema";
import { LLM } from "./llm";

type GenerateClarifyingQuestionsRequest = {
  topic: string;
};

// zod type for the LLM

export async function generate_clarifying_questions(
  llm: LLM,
  req: GenerateClarifyingQuestionsRequest
): Promise<CreateLectureQuestion[]> {}
