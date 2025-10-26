import * as z from "zod";
import { LLM } from "./llm.js";
import { LecturePreferences, LectureSlide } from "schema";
import {
  VISUAL_SELECTION_GUIDE,
  TRANSCRIPT_LENGTH_GUIDE,
  getToneInstruction,
  formatSlideCountGuidance,
  JSON_OUTPUT_REQUIREMENTS,
  VALIDATION_CHECKLIST,
} from "./prompt_constants.js";

// Schema specifically for regenerated slides (topic not required since we already have it)
const ZRegeneratedSlidesResponse = z.object({
  slides: z.array(
    z.object({
      transcript: z.string(),
      slide: z.object({
        title: z.string(),
        markdown_body: z.string(),
      }),
      question: z.optional(
        z.object({
          question_text: z.string(),
          suggested_answer: z.string(),
        })
      ),
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

export type RegenerateSlidesRequest = {
  lecture_topic: string;
  previous_slides: LectureSlide[];
  current_slide_index: number;
  user_question: string;
  regeneration_instructions: string;
  user_preferences: LecturePreferences;
};

export async function regenerate_slides_from_question(
  llm: LLM,
  request: RegenerateSlidesRequest
) {
  const {
    lecture_topic,
    previous_slides,
    current_slide_index,
    user_question,
    regeneration_instructions,
    user_preferences,
  } = request;

  // Extract transcripts from previous slides to give context
  const previous_transcripts = previous_slides
    .slice(0, current_slide_index + 1)
    .map((slide, idx) => `## Slide ${idx + 1}: ${slide.title}\n${slide.transcript}`)
    .join("\n\n");

  const PROMPT = `You are an expert lecturer delivering a structured lecture on: "${lecture_topic}"

## Current Situation:

You have delivered slides 1-${current_slide_index + 1}. A student asked a question at slide ${current_slide_index + 1} that requires adjusting your lecture direction.

Student's question: "${user_question}"

## Analysis Result:
${regeneration_instructions}

## Slides Delivered So Far:
${previous_transcripts}

---

## Your Task:

Generate NEW slides starting from slide ${current_slide_index + 2} onward that:

1. **Address the student's need** as described in the analysis above
2. **Build on established foundation** - reference and extend concepts from slides 1-${current_slide_index + 1}
3. **Maintain continuity** - don't re-explain material already covered
4. **Provide proper closure** - end with a summary or conclusion slide

## Continuity Requirements:

✓ Reference concepts from previous slides naturally
✓ Use consistent terminology and notation from slides 1-${current_slide_index + 1}
✓ Build logically on the established foundation
✗ Don't re-teach material already covered
✗ Don't contradict or ignore previous content
✗ Don't restart the topic from scratch

## Output Structure:

Return a JSON object with a "slides" array. Each slide contains:

{
  "slides": [
    {
      "transcript": string, // REQUIRED: 100-600 words (see length guide below)
      "slide": {
        "title": string, // REQUIRED: Clear, concise slide title
        "markdown_body": string // REQUIRED: 4-6 bullet points or 2-3 short paragraphs
      },
      "question": { // OPTIONAL: Only if this segment naturally invites checking understanding
        "question_text": string,
        "suggested_answer": string
      },
      "image": { // OPTIONAL: See visual selection guide
        "search_term": string, // 3-5 words for image search
        "extended_description": string // 1-2 sentences describing ideal image
      },
      "diagram": { // OPTIONAL: See visual selection guide
        "type": "flowchart-LR" | "flowchart-RL" | "flowchart-TB" | "flowchart-BT" | "sequenceDiagram" | "classDiagram" | "stateDiagram-v2" | "erDiagram" | "pie",
        "extended_description": string // What the diagram should illustrate
      }
    }
  ]
}

${VISUAL_SELECTION_GUIDE}

${TRANSCRIPT_LENGTH_GUIDE}

## Lecture Preferences:

${formatSlideCountGuidance(user_preferences.lecture_length, current_slide_index + 1)}

**Tone:** ${user_preferences.tone}
${getToneInstruction(user_preferences.tone)}

## Important Notes:

- DO NOT include slide numbers in your output - the system assigns them automatically
- DO NOT include a "topic" field - only return the "slides" array
- NEVER include both image and diagram on the same slide
- Visuals (image/diagram) are optional and may be sparse - only include when they add clear educational value
- The question field is optional - only include for natural comprehension checkpoints

${JSON_OUTPUT_REQUIREMENTS}

${VALIDATION_CHECKLIST}
☐ "slides" array present (no "topic" field)
☐ Each slide has transcript and slide object
☐ Transcripts build on slides 1-${current_slide_index + 1}
☐ First 1-2 slides address the student's question
☐ No slide has both image and diagram
☐ Final slide provides closure/summary
`;

  const response = await llm.sendMessage(PROMPT, ZRegeneratedSlidesResponse);

  if (!response || !response.slides || response.slides.length === 0) {
    throw new Error(
      "LLM returned invalid regenerated slides response: " +
      (response ? `missing or empty slides array` : "undefined response")
    );
  }

  return response.slides;
}
