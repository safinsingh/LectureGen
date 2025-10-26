import * as z from "zod";
import { LLM, StringAccumulator } from "./llm.js";
import {
  CreateLectureAnswer,
  CreateLectureQuestion,
  FileUpload,
  LecturePreferences,
} from "schema";
import {
  VISUAL_SELECTION_GUIDE,
  MERMAID_TYPE_REFERENCE,
  TRANSCRIPT_LENGTH_GUIDE,
  getToneInstruction,
  formatSlideCountGuidance,
  getExpectedSlideCount,
  JSON_OUTPUT_REQUIREMENTS,
  VALIDATION_CHECKLIST,
} from "./prompt_constants.js";

export type GenerateTranscriptRequest = {
  lecture_topic: string;
  file_uploads: FileUpload[]; // must be pdf2text'd
  questions: CreateLectureQuestion[];
  answers: CreateLectureAnswer[];
  user_preferences: LecturePreferences;
  custom_preferences?: LecturePreferences;
};

// validates AI's response structure (Anthropic tool schemas must be objects)
export const ZGenerateTranscriptResponse = z.object({
  topic: z.string(),
  slides: z.array(
    z.object({
      transcript: z.string(),
      slide: z.object({
        title: z.string(),
        markdown_body: z.string(),
      }),
      image: z.optional(
        z.object({
          search_term: z.string(),
          extended_description: z.string(),
        })
      ),
      diagram: z.optional(
        z.object({
          type: z.union([
            z.literal("flowchart-LR"),
            z.literal("flowchart-RL"),
            z.literal("flowchart-TB"),
            z.literal("flowchart-BT"),
            z.literal("sequenceDiagram"),
            z.literal("classDiagram"),
            z.literal("stateDiagram-v2"),
            z.literal("erDiagram"),
            z.literal("pie"),
          ]),
          extended_description: z.string(),
        })
      ),
    })
  ),
});

if (!(ZGenerateTranscriptResponse instanceof z.ZodObject)) {
  console.warn(
    "[LectureGen] Transcript schema should be a ZodObject for tool usage."
  );
}

// converts Q&A pairs into readable text format
const question_answer_to_text = (
  question: CreateLectureQuestion,
  answer: CreateLectureAnswer
) => {
  let qn_type: string;
  switch (question.question_type) {
    case "checkbox":
      qn_type = "Multiple Choice";
      break;
    case "radio":
      qn_type = "Single Select";
      break;
    case "text_input":
      qn_type = "Open Ended";
      break;
    default:
      qn_type = "Unknown";
  }
  let acc = new StringAccumulator(`${qn_type} Q: ${question.question}`);
  if (question.question_type !== "text_input") {
    acc.add("Possible options:");
    for (const opt of question.options) {
      acc.add(`  - ${opt.text}`);
    }
  }
  acc.add(`A: ${answer.answer}`); // backend should validate earlier that id matches (oneof) qn opt ids
  return acc.collect();
};

export async function generate_transcript(
  llm: LLM,
  generate_transcript_request: GenerateTranscriptRequest,
  augment_slides_instructions?: string
) {
  const {
    lecture_topic,
    file_uploads,
    questions,
    answers,
    user_preferences,
    custom_preferences,
  } = generate_transcript_request;

  const effective_preferences = {
    ...user_preferences,
    ...custom_preferences, // custom takes precedence
  };

  // Determine if we have substantial reference material
  const totalContentLength = file_uploads.reduce((sum, f) => sum + f.content.length, 0);
  const hasSubstantialContent = totalContentLength > 100;

  const PROMPT = `You are an expert lecturer creating a structured, slide-by-slide lecture.

${augment_slides_instructions
  ? `## Adjustment Context:\n${augment_slides_instructions}\n`
  : `## Lecture Topic:\n"${lecture_topic}"\n`}

## Student Preferences (from clarifying questions):

${questions.map((qn, qidx) => question_answer_to_text(qn, answers[qidx])).join("\n\n")}

## Reference Materials:
${hasSubstantialContent
  ? `You have been provided with the following reference materials. Use these to ground your lecture content. Quote directly where relevant, using quotation marks for direct quotes. Integrate this material naturally into your lecture presentation.

${file_uploads.map((u) => `**Source: ${u.name}**\n${u.content}`).join("\n\n---\n\n")}`
  : `Limited or no reference materials provided. Rely on your own expertise to create high-quality lecture content on "${lecture_topic}".`}

---

## Your Task:

Create a complete lecture as a series of slides. Each slide represents one segment of your lecture presentation.

## Output Structure:

Return a JSON object with:
- \`topic\`: A short, engaging title for the entire lecture (5-10 words)
- \`slides\`: Array of slide objects

{
  "topic": "Your Lecture Title Here",
  "slides": [
    {
      "transcript": string, // REQUIRED: The spoken narration for this slide
      "slide": { // REQUIRED
        "title": string, // REQUIRED: This slide's title
        "markdown_body": string // REQUIRED: 4-6 bullet points OR 2-3 short paragraphs
      },
      "image": { // OPTIONAL
        "search_term": string, // 3-5 words for image search
        "extended_description": string // 1-2 sentence description
      },
      "diagram": { // OPTIONAL
        "type": "flowchart-LR" | "flowchart-RL" | "flowchart-TB" | "flowchart-BT" | "sequenceDiagram" | "classDiagram" | "stateDiagram-v2" | "erDiagram" | "pie",
        "extended_description": string // What to illustrate
      }
    }
  ]
}

### Field Requirements:

**REQUIRED fields:**
- \`topic\` (top-level): Short lecture title
- \`transcript\`: Spoken narration (100-600 words per slide - see guide below)
- \`slide.title\`: Clear slide title
- \`slide.markdown_body\`: 4-6 bullet points OR 2-3 short paragraphs

**OPTIONAL fields:**
- \`image\`: If included, must have both \`search_term\` and \`extended_description\`
- \`diagram\`: If included, must have both \`type\` and \`extended_description\`

**Rules:**
- NEVER include both image and diagram on the same slide (choose one or neither)
- Visuals are optional and may be sparse - only include when they add clear educational value

${VISUAL_SELECTION_GUIDE}

${MERMAID_TYPE_REFERENCE}

${TRANSCRIPT_LENGTH_GUIDE}

## Slide Content Quality:

Good slides:
✓ Cover ONE main concept per slide
✓ Include concrete examples where applicable
✓ Build progressively (each slide builds on previous)
✓ Use consistent terminology throughout
✓ Balance theory with application
✓ End with summary or conclusion

Poor slides:
✗ Try to cover multiple unrelated concepts
✗ Only abstract theory without examples
✗ Redundant with previous slides
✗ Inconsistent terminology
✗ Walls of text (keep markdown_body concise)

## Lecture Preferences:

${formatSlideCountGuidance(effective_preferences.lecture_length)}

**Tone:** ${effective_preferences.tone}
${getToneInstruction(effective_preferences.tone)}

${JSON_OUTPUT_REQUIREMENTS}

${VALIDATION_CHECKLIST}
☐ "topic" field present at top level
☐ "slides" array present with ${getExpectedSlideCount(effective_preferences.lecture_length)} slides (±1 okay)
☐ Each slide has transcript and slide object with title and markdown_body
☐ No slide has both image and diagram
☐ Transcripts are 100-600 words each
☐ Lecture builds progressively from intro to conclusion
`;

  const response = await llm.sendMessage(PROMPT, ZGenerateTranscriptResponse);

  if (!response || !response.slides || response.slides.length === 0) {
    throw new Error(
      "LLM returned invalid transcript response: " +
        (response ? `missing or empty slides array` : "undefined response")
    );
  }

  return response.slides;
}
