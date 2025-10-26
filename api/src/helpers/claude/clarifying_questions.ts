import * as z from "zod";

import { CreateLectureQuestion, LecturePreferences } from "schema";
import { LecturePreferencesSchema } from "../../schemas/create-lecture.js";
import { LLM } from "./llm";
import {
  getToneInstruction,
  getTopicDifficultyPrompt,
  JSON_OUTPUT_REQUIREMENTS,
  VALIDATION_CHECKLIST,
} from "./prompt_constants.js";

export const ZGenerateClarifyingQuestionsRequest = z.object({
  topic: z.string().min(1),
  user_preferences: LecturePreferencesSchema,
  custom_preferences: LecturePreferencesSchema.optional(),
});

export type GenerateClarifyingQuestionsRequest = z.infer<
  typeof ZGenerateClarifyingQuestionsRequest
>;

// zod type for the LLM (makes it return it in a specific format)
// Note: Anthropic tool calling requires the root schema to be an object, not an array
// So we wrap the questions array in an object
export const ZGenerateClarifyingQuestionsResponse = z.object({
  questions: z.array(
    z.discriminatedUnion("question_type", [
      z.object({
        question_type: z.literal("radio"),
        question: z.string(),
        options: z.array(
          z.object({
            text: z.string(),
          })
        ),
      }),
      z.object({
        question_type: z.literal("checkbox"),
        question: z.string(),
        options: z.array(
          z.object({
            text: z.string(),
          })
        ),
      }),
      z.object({
        question_type: z.literal("text_input"),
        question: z.string(),
      }),
    ])
  ),
});

export async function generate_clarifying_questions(
  llm: LLM,
  req: GenerateClarifyingQuestionsRequest
): Promise<CreateLectureQuestion[]> {
  const parsedReq = ZGenerateClarifyingQuestionsRequest.parse(req);

  const { topic, user_preferences, custom_preferences } = parsedReq;

  const effective_preferences = {
    ...user_preferences,
    ...custom_preferences,
  };

  const PROMPT = `You are an expert lecturer preparing a lecture on: "${topic}"

Before creating the lecture, ask the student clarifying questions to personalize the content.

${getTopicDifficultyPrompt(topic)}

## Your Task:
Generate exactly 4 clarifying questions that help you understand:
1. Their current knowledge level
2. Specific aspects or subtopics they want emphasized
3. Their learning goals and intended application

## Question Type Requirements:

You must generate EXACTLY 4 questions with this distribution:
- 1 radio question (single-choice)
- 1 checkbox question (multiple-choice)
- 1 text_input question (open-ended)
- 1 additional question of any type (choose the most valuable type)

Question Type Selection Guide:
- **radio**: Mutually exclusive options (experience level, primary goal, preference ranking)
  Example: "What is your current experience with ${topic}?"
  Options: Beginner, Intermediate, Advanced, Expert

- **checkbox**: Multiple selections allowed (topics of interest, learning goals, areas to emphasize)
  Example: "Which aspects interest you most? (Select all that apply)"
  Options: Theory, Practical Applications, Historical Context, Advanced Topics

- **text_input**: Unique/personal answer needed (specific use case, custom requirements, open-ended goals)
  Example: "What specific real-world problem or project would you like to apply this knowledge to?"

## Question Quality Guidelines:

DO ask about:
✓ Depth vs. breadth preferences for ${topic}
✓ Specific subtopics or applications within ${topic}
✓ Real-world context for learning ${topic}
✓ Prerequisites they may/may not have
✓ Practical examples or domains they care about

DO NOT ask about:
✗ Information already set: tone (${effective_preferences.tone}), length (${effective_preferences.lecture_length})
✗ Yes/no questions (convert to radio with Yes/No options)
✗ Topics completely unrelated to ${topic}
✗ Overly broad questions that don't help personalize the lecture

## Output Format:

Return a JSON object with a "questions" array:

{
  "questions": [
    {
      "question_type": "radio",
      "question": "Your question text here?",
      "options": [
        { "text": "Option 1" },
        { "text": "Option 2" },
        { "text": "Option 3" }
      ]
    },
    {
      "question_type": "checkbox",
      "question": "Your question text here? (Select all that apply)",
      "options": [
        { "text": "Option 1" },
        { "text": "Option 2" },
        { "text": "Option 3" }
      ]
    },
    {
      "question_type": "text_input",
      "question": "Your question text here?"
    },
    {
      "question_type": "radio|checkbox|text_input",
      "question": "...",
      "options": [...] // only if radio or checkbox
    }
  ]
}

Requirements:
- Each radio/checkbox question must have 3-5 options
- Each question must be clear and specific
- Questions should help create a more personalized lecture
- DO NOT include question_id or option_id fields (system will generate these)

## Tone Adaptation:
Your questions should match the "${effective_preferences.tone}" tone:
${getToneInstruction(effective_preferences.tone)}

${JSON_OUTPUT_REQUIREMENTS}

${VALIDATION_CHECKLIST}
☐ Exactly 4 questions
☐ At least one radio, one checkbox, one text_input
☐ No question_id or option_id fields
☐ Each radio/checkbox has 3-5 options
`;

  // is there some way we should store the definitions of different tones so that we're not copy-pasting it each time?
  const result = (await llm.sendMessage(
    PROMPT,
    ZGenerateClarifyingQuestionsResponse
  ))! as { questions: Partial<CreateLectureQuestion>[] };
  result.questions.forEach((q) => {
    q.question_id = crypto.randomUUID();
    if (q.question_type === "checkbox" || q.question_type === "radio") {
      q.options!.forEach((opt) => (opt.option_id = crypto.randomUUID()));
    }
  });
  return result.questions as CreateLectureQuestion[];
}
