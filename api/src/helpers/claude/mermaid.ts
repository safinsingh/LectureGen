import * as z from "zod";
import { LLM } from "./llm.js";
import {
  MERMAID_TYPE_REFERENCE,
  JSON_OUTPUT_REQUIREMENTS,
  VALIDATION_CHECKLIST,
} from "./prompt_constants.js";

// input needed to generate mermaid diagram
export type GenerateMermaidRequest = {
  type:
    | "flowchart-LR"
    | "flowchart-RL"
    | "flowchart-TB"
    | "flowchart-BT"
    | "sequenceDiagram"
    | "classDiagram"
    | "stateDiagram-v2"
    | "erDiagram"
    | "pie";
  extended_description: string;
};

// output
export const ZGenerateMermaidResponse = z.object({
  mermaid_code: z.string(),
});

/**
 * Generate Mermaid diagram code from description
 *
 * @param llm - LLM instance
 * @param request - Diagram type and description
 * @returns Mermaid code string, or empty string if generation fails after retry
 *
 * @remarks
 * - Attempts generation once, retries once on failure, then returns empty string
 * - Token usage: ~300-400 tokens per attempt
 * - Common failure: Invalid syntax for chosen diagram type
 *
 * @example
 * ```ts
 * const code = await generateMermaidDiagrams(llm, {
 *   type: "flowchart-LR",
 *   extended_description: "Show the steps in user authentication"
 * });
 * ```
 */
export async function generateMermaidDiagrams(
  llm: LLM,
  request: GenerateMermaidRequest
): Promise<string> {
  const { type, extended_description } = request;

  const PROMPT = `You are a Mermaid diagram expert. Generate valid Mermaid syntax for the following:

DIAGRAM TYPE: ${type}

DESCRIPTION:
${extended_description}

${MERMAID_TYPE_REFERENCE}

Critical Requirements:
- Output must be valid ${type} syntax that renders without errors
- Aim for 6-8 nodes/elements (hard maximum: 10)
- Each label: 2-5 words maximum
- Start directly with diagram type declaration (e.g., "${type.replace(/-.*/, " ")}")
- Do NOT wrap in markdown code fences (\`\`\`mermaid)
- Do NOT include explanations or commentary

Common Syntax Errors to Avoid:
- Including \`\`\`mermaid code fences (your output will be used directly)
- Missing diagram type declaration as first line
- Invalid node syntax for chosen type
- Unescaped special characters in labels

Simplification Strategy (if description is complex):
1. Show only the most critical elements
2. Use higher abstraction level
3. Group related concepts

${JSON_OUTPUT_REQUIREMENTS}

Return format: { "mermaid_code": "your diagram code here as a string" }

${VALIDATION_CHECKLIST}
☐ No code fences present
☐ Starts with diagram type declaration
☐ Valid syntax for ${type}
☐ 6-8 nodes (max 10)
☐ Each label is 2-5 words
`;

  try {
    const result = await llm.sendMessageWithRetry(
      PROMPT,
      ZGenerateMermaidResponse,
      1, // max 1 retry
      `The Mermaid syntax was invalid. Ensure you follow the exact syntax requirements for ${type}. Do not include code fences.`
    );
    return result.mermaid_code.trim();
  } catch (error) {
    // After retry fails, return empty string (no diagram)
    console.error("Mermaid generation failed after retry:", error);
    return "";
  }
}
