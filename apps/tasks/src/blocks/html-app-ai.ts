import type { Block } from '@/schemas/block';

export const HTML_APP_AI_MAX_MESSAGES = 20;
export const HTML_APP_AI_MAX_CONTENT_CHARS = 16_000;
export const HTML_APP_AI_MAX_TOKENS_CAP = 2000;

export type HtmlAppAiMessage = { role: 'user' | 'assistant'; content: string };

export type HtmlAppAiLane = {
  provider: 'openai' | 'anthropic';
  model: string;
  system: string;
  max_tokens: number;
};

export function resolveHtmlAppAiLane(block: Block): HtmlAppAiLane | null {
  if (block.block_type !== 'html_app' || !block.content.ai) return null;
  const ai = block.content.ai;
  return {
    provider: ai.provider,
    model: ai.model.trim(),
    system: ai.system,
    max_tokens: Math.min(ai.max_tokens, HTML_APP_AI_MAX_TOKENS_CAP)
  };
}

export function clampHtmlAppAiRequest(messages: HtmlAppAiMessage[]): HtmlAppAiMessage[] {
  const sliced = messages.slice(-HTML_APP_AI_MAX_MESSAGES).map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : ''
  }));
  let total = 0;
  const out: HtmlAppAiMessage[] = [];
  for (const m of sliced) {
    const room = HTML_APP_AI_MAX_CONTENT_CHARS - total;
    if (room <= 0) break;
    const content = m.content.length > room ? m.content.slice(0, room) : m.content;
    total += content.length;
    out.push({ role: m.role, content });
  }
  return out;
}
