/**
 * Shared prompt components and utilities for Claude LLM interactions
 *
 * This module centralizes reusable prompt sections to:
 * - Reduce token waste from duplicated instructions
 * - Ensure consistency across all prompts
 * - Make prompt maintenance easier
 */

// ============================================================================
// TONE DEFINITIONS
// ============================================================================

export const TONE_INSTRUCTIONS = {
  direct: "Write in a concise, factual, and instructional manner, minimizing filler.",
  warm: "Use a friendly, supportive, and encouraging tone, as if guiding a student patiently.",
  playful: "Add light humor or playful analogies where appropriate, keeping the content accurate and engaging."
} as const;

export function getToneInstruction(tone: string): string {
  return TONE_INSTRUCTIONS[tone as keyof typeof TONE_INSTRUCTIONS] || TONE_INSTRUCTIONS.direct;
}

// ============================================================================
// SLIDE COUNT HELPERS
// ============================================================================

export function getExpectedSlideCount(length: string, alreadyDelivered: number = 0): number {
  const totalSlides = {
    short: 5,
    medium: 10,
    long: 15
  }[length] || 10;

  return Math.max(1, totalSlides - alreadyDelivered);
}

export function formatSlideCountGuidance(length: string, alreadyDelivered: number = 0): string {
  const remaining = getExpectedSlideCount(length, alreadyDelivered);
  const range = length === "short" ? "3-5" : length === "medium" ? "8-10" : "12-15";

  if (alreadyDelivered === 0) {
    return `Generate approximately ${range} slides total. Prefer being closer to the middle of this range.`;
  } else {
    return `The lecture was planned for ${range} slides total. Since ${alreadyDelivered} have been delivered, generate approximately ${remaining} more slides (±1 acceptable).`;
  }
}

// ============================================================================
// VISUAL SELECTION GUIDE (for transcript.ts & regenerate_slides.ts)
// ============================================================================

export const VISUAL_SELECTION_GUIDE = `
Visual Selection Criteria:

Include an \`image\` when:
- Explaining physical objects, real-world examples, or concrete illustrations
- Historical context, people, or places would benefit from visualization
- Abstract concepts can be made concrete through visual metaphor

Include a \`diagram\` when:
- Showing processes, workflows, or sequential steps (→ flowchart-*)
- Depicting interactions between entities over time (→ sequenceDiagram)
- Illustrating hierarchies, relationships, or structures (→ classDiagram, erDiagram)
- Modeling state transitions or lifecycles (→ stateDiagram-v2)
- Showing proportions or distributions (→ pie)

Include neither when:
- Content is primarily conceptual without visual benefit
- Text alone communicates the concept clearly
- Adding a visual would be redundant or distracting

Rules:
- NEVER include both image and diagram on the same slide
- Visuals are optional and may be sparse - only include when they add clear educational value
- When in doubt, omit the visual
`;

// ============================================================================
// MERMAID DIAGRAM TYPE REFERENCE (condensed)
// ============================================================================

export const MERMAID_TYPE_REFERENCE = `
Diagram Type Quick Reference:
- flowchart-LR/RL/TB/BT: Processes, decision trees, workflows (LR=left-right, TB=top-bottom, etc.)
- sequenceDiagram: Time-based interactions, API calls, message passing between actors
- classDiagram: Object-oriented structures, inheritance, type hierarchies
- stateDiagram-v2: State machines, lifecycle transitions, mode changes
- erDiagram: Database schemas, entity relationships, data models
- pie: Proportions, percentages, categorical distributions
`;

// ============================================================================
// STANDARD OUTPUT REQUIREMENTS
// ============================================================================

export const JSON_OUTPUT_REQUIREMENTS = `
Output Requirements:
- Return ONLY valid JSON matching the exact schema specified
- Do NOT include markdown code fences, explanations, or commentary
- All REQUIRED fields must be present
- Do NOT include extra fields not in the schema
- Ensure proper JSON formatting (no trailing commas, proper escaping)
`;

// ============================================================================
// SELF-VALIDATION CHECKLIST
// ============================================================================

export const VALIDATION_CHECKLIST = `
Before submitting, verify:
☐ Output is valid JSON (no trailing commas, proper escaping)
☐ All REQUIRED fields are present
☐ No extra/undefined fields included
☐ All constraints satisfied (length, count, format)
☐ Response directly addresses the task
`;

// ============================================================================
// TRANSCRIPT LENGTH GUIDELINES
// ============================================================================

export const TRANSCRIPT_LENGTH_GUIDE = `
Transcript Length Guidelines:
- Simple concept introduction: 100-200 words (30-60 seconds when read aloud)
- Standard explanation with examples: 200-350 words (60-90 seconds)
- Complex topic with multiple components: 350-500 words (90-120 seconds)
- Never exceed 600 words per slide - split complex topics across multiple slides instead

Each slide should cover ONE main concept or idea. If you find a transcript exceeding 500 words, you're likely trying to cover too much in one slide.
`;

// ============================================================================
// TOPIC DIFFICULTY ASSESSMENT (for clarifying questions)
// ============================================================================

export function getTopicDifficultyPrompt(topic: string): string {
  return `
Topic Complexity Assessment for: "${topic}"

Consider the topic's inherent complexity when crafting questions:

IF topic appears highly technical/specialized (e.g., "Quantum Computing", "Advanced Category Theory", "CRISPR Gene Editing"):
  → Ask about prerequisites knowledge (specific technologies, math background, prior experience)
  → Ask about desired depth (high-level overview vs. deep technical dive)
  → Include text_input for specific technical aspects they want covered

IF topic appears broad/general (e.g., "Introduction to Programming", "World History", "Marketing Basics"):
  → Ask about specific subtopics or areas of interest (which aspects matter most?)
  → Ask about breadth vs. depth preference (survey many topics vs. focus on few)
  → Include checkbox for multiple interest areas they can select

IF topic appears narrow/specific (e.g., "Python List Comprehensions", "The Battle of Waterloo"):
  → Focus questions on application context (what will they use this for?)
  → Ask about prior knowledge of the narrow topic itself
  → Ask about related concepts they want connected

Adapt your questions to match the topic's natural complexity and scope.
`;
}
