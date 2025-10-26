import { lectureDoc } from "../../lib/firebase_admin.js";
import { LLM } from "./llm.js";
import { UserQuestionRequest, ZUserAnalyzeQuery } from "../../../../types/index.js";
import { z } from "zod";
import { ZGenerateTranscriptResponse } from "./transcript.js";
import { ASSET_CACHE } from "../../lib/file_cache.js";
import {
  JSON_OUTPUT_REQUIREMENTS,
  VALIDATION_CHECKLIST,
} from "./prompt_constants.js";

// Wrap the discriminated union in an object so it converts to valid JSON schema
const ZUserAnalyzeQueryWrapper = z.object({
  result: ZUserAnalyzeQuery,
});

export async function generate_user_question_response(
  llm: LLM,
  req: UserQuestionRequest
) {
  const doc = await lectureDoc(req.lecture_id).get();
  const ld = doc.data();
  const slidesSoFar = ld?.slides?.slice(0, req.current_slide + 1)!;

  const REGEN_FIRST_QUERY = `You are an expert lecturer delivering a structured lecture on: "${ld?.topic}"

## Current Situation:
You have delivered ${slidesSoFar.length} slide(s) so far. A student has paused to ask a question.

## Student's Question:
"${req.question}"

## Lecture Context (slides delivered):
${slidesSoFar.map((s, idx) => `--- Slide ${idx + 1}: ${s.title} ---\n${s.transcript}`).join("\n\n")}

---

## Your Decision Task:

Determine whether to:
1. Answer briefly in inline chat (2-4 sentences, no regeneration) → Use answer_category: "simple"
2. Regenerate remaining slides to better address the question → Use answer_category: "regenerate_slides"

## Decision Framework:

Use this EXACT 3-step process:

### Step 1: Scope Check
- Does question relate to material already covered in the ${slidesSoFar.length} slides above?
  - YES → Continue to Step 2
  - NO (new/uncovered topic) → Use "regenerate_slides"

### Step 2: Complexity Check
- Can you answer this in ≤4 sentences using only information from the existing slides?
  - YES → Continue to Step 3
  - NO (requires >4 sentences or new concepts) → Use "regenerate_slides"

### Step 3: Direction Check
- Does answering change the planned lecture direction, depth, or approach?
  - NO (stays on current path) → Use "simple"
  - YES (suggests different focus/depth) → Use "regenerate_slides"

## Classification Examples:

**Examples that should use answer_category: "simple":**
✓ "Can you clarify what [term from slide X] means?"
  → Answer: "In slide ${Math.max(1, slidesSoFar.length - 1)}, [term] refers to..."

✓ "What was that formula/example again?"
  → Answer: "From slide X: [brief recap]..."

✓ "How does [concept from slide X] relate to [concept from slide Y]?"
  → Answer: "[Connection explanation in 2-3 sentences]"

✓ "I missed that, can you repeat?"
  → Answer: "[Brief summary of relevant point]"

**Examples that should use answer_category: "regenerate_slides":**
✓ "Can we go deeper into [topic]?"
  → Requires scope expansion

✓ "What about [alternative approach/perspective] instead?"
  → Suggests direction change

✓ "I'm still confused about [fundamental concept]"
  → Needs depth adjustment or rebuilding foundation

✓ "How does this apply to [new domain/application]?"
  → Requires new application examples

✓ "Can you add more examples of [concept]?"
  → Needs content enrichment

## Edge Cases:

**If question is off-topic/unrelated to "${ld?.topic}":**
→ Use answer_category: "simple"
→ response: "That's outside the scope of this lecture on ${ld?.topic}. Let's stay focused on [current topic]."

**If question is vague/unclear:**
→ Use answer_category: "simple"
→ response: "Could you clarify what specifically you'd like to know more about?"

**If question repeats something already covered:**
→ Use answer_category: "simple"
→ response: "We covered this in slide X: [brief recap]. Does that answer your question?"

**If question is hostile/inappropriate:**
→ Use answer_category: "simple"
→ response: "Let's keep our focus on learning about ${ld?.topic}."

## Output Format:

CRITICAL: The answer_category field MUST be EXACTLY one of these two string values (all lowercase):
- "simple" (for a simple answer without regeneration)
- "regenerate_slides" (for regenerating slides)

Do NOT use any other values like "SIMPLE", "REGENERATE", "regenerate", "Simple", etc.

### If you decide to provide a simple answer (no slide regeneration):
You MUST use this exact JSON structure:
{
  "answer_category": "simple",
  "response": "[2-4 sentence answer using information from the slides above. If referring to a previous slide, mention it: 'In slide X, we discussed...']"
}

### If you decide to regenerate slides:
You MUST use this exact JSON structure:
{
  "answer_category": "regenerate_slides",
  "response": "[1 sentence reassurance to student, e.g., 'Great question! I'll adjust the remaining slides to explore that in more detail.']",
  "instructions": "[Compact regeneration instructions: 50-100 words]"
}

### Instructions Field Format (only for regenerate_slides):

Structure: **[Student Context] → [Regeneration Strategy] → [Continuity Note]**

Example:
"Student asked for deeper coverage of error handling, indicating current treatment is too superficial. Regenerate remaining slides to: (1) add dedicated slide on error types and patterns, (2) include error handling in all code examples, (3) add practice question on debugging. Maintain continuity: builds on exception basics introduced in slide ${slidesSoFar.length}, references try-catch syntax from slide ${Math.max(1, slidesSoFar.length - 1)}."

Include:
- What student wants (and why it requires regeneration)
- Specific changes to make in remaining slides
- How to maintain continuity with slides 1-${slidesSoFar.length}
- Length: 50-100 words

${JSON_OUTPUT_REQUIREMENTS}

${VALIDATION_CHECKLIST}
☐ answer_category is exactly "simple" or "regenerate_slides"
☐ response is 1-4 sentences
☐ instructions field present ONLY if regenerate_slides
☐ If simple: directly answers using slide context
☐ If regenerate: instructions explain what to change and why
`;

  console.log("[generate_user_question_response] Sending question to LLM:", {
    lecture_id: req.lecture_id,
    current_slide: req.current_slide,
    question: req.question,
    slides_so_far: slidesSoFar.length,
  });

  const response = await llm.sendMessage(REGEN_FIRST_QUERY, ZUserAnalyzeQueryWrapper);

  console.log("[generate_user_question_response] LLM response received:", {
    answer_category: response.result.answer_category,
    has_instructions: 'instructions' in response.result,
  });

  return response.result;
}
