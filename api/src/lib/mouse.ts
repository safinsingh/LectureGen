import { LLM } from "../helpers/claude/llm.js";

// Lazy initialization to ensure environment variables are loaded first
let _llm: LLM | null = null;
let _haikuLlm: LLM | null = null;

export function getLLM(): LLM {
  if (!_llm) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
    _llm = new LLM(anthropicKey);
  }
  return _llm;
}

export function getHaikuLLM(): LLM {
  if (!_haikuLlm) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
    _haikuLlm = new LLM(anthropicKey, "claude-haiku-4-5");
  }
  return _haikuLlm;
}

// For backward compatibility
export const llm = new Proxy({} as LLM, {
  get(_target, prop) {
    return getLLM()[prop as keyof LLM];
  },
});

export const haikuLlm = new Proxy({} as LLM, {
  get(_target, prop) {
    return getHaikuLLM()[prop as keyof LLM];
  },
});
