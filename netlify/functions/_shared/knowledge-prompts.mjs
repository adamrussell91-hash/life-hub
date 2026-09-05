import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROMPT_DIR = 'config/knowledge';

export function loadKnowledgePrompt(name, cwd = process.cwd()) {
  try {
    const text = readFileSync(join(cwd, PROMPT_DIR, name), 'utf8');
    if (!text.trim()) throw new Error(`Prompt file missing: ${name}`);
    return text;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Prompt file missing:')) throw error;
    throw new Error(`Prompt file missing: ${name}`);
  }
}

export function assembleClementinePrompt({ voice, job, surface, payload, quality }) {
  if (!String(voice ?? '').trim()) throw new Error('Prompt file missing: clementine-voice.md');
  if (!String(job ?? '').trim()) throw new Error('Prompt file missing: job');
  return [voice, job, surface, payload, quality]
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}
