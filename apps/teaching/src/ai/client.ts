import { getApiBaseUrl } from '@/api/config';
import type { AiProposal } from '@/ai/proposals';
import type { AgentSlug } from '@/ai/agents';
import type { AiScope } from '@/ai/proposals';

export type ArchiveCitation = {
  pageId: string;
  title: string;
  excerpt: string;
  stance: string;
};

export type AiStreamEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; text: string }
  | { type: 'proposal'; proposal: AiProposal }
  | { type: 'research'; findings: ArchiveCitation[]; archiveFailed?: boolean }
  | { type: 'tool_error'; name: string; error: string }
  | { type: 'error'; code: string; message: string; retryable?: boolean }
  | { type: 'done' };

export interface AiChatPayload {
  lesson_id: string;
  agent: AgentSlug;
  scope?: AiScope;
  selected_block_id?: string;
  message: string;
  action?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export const AI_STREAM_STALL_MS = 20_000;

const STALL_MESSAGE =
  'The AI connection stalled before a reply. Try again in a moment.';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export async function streamAiChat(
  payload: AiChatPayload,
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  let terminal = false;
  const emit = (event: AiStreamEvent): void => {
    if (event.type === 'done' || event.type === 'error' || event.type === 'proposal') {
      terminal = true;
    }
    onEvent(event);
  };
  const stallError = (): void => {
    if (terminal) return;
    emit({
      type: 'error',
      code: 'ai_stalled',
      message: STALL_MESSAGE,
      retryable: true
    });
  };

  const fetchAbort = new AbortController();
  const onUserAbort = (): void => fetchAbort.abort();
  signal?.addEventListener('abort', onUserAbort, { once: true });
  let headerTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => fetchAbort.abort(),
    AI_STREAM_STALL_MS
  );

  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal: fetchAbort.signal
    });
    if (headerTimer) clearTimeout(headerTimer);
    headerTimer = undefined;

    if (!response.ok || !response.body) {
      let message = `AI request failed (${response.status})`;
      let code = 'http_error';
      try {
        const body = (await response.json()) as { error?: { code?: string; message?: string } };
        if (body.error?.message) message = body.error.message;
        if (body.error?.code) code = body.error.code;
      } catch {
        /* ignore */
      }
      emit({ type: 'error', code, message, retryable: response.status >= 500 });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const stalled = new Promise<'stall'>((resolve) => {
        timeoutId = setTimeout(() => resolve('stall'), AI_STREAM_STALL_MS);
      });
      const outcome = await Promise.race([
        reader.read().then((result) => ({ kind: 'read' as const, ...result })),
        stalled.then(() => ({ kind: 'stall' as const }))
      ]);
      if (timeoutId) clearTimeout(timeoutId);

      if (outcome.kind === 'stall') {
        stallError();
        await reader.cancel().catch(() => undefined);
        return;
      }
      if (outcome.done) break;

      buffer += decoder.decode(outcome.value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk
          .split('\n')
          .map((entry) => entry.trim())
          .find((entry) => entry.startsWith('data:'));
        if (!line) continue;
        try {
          emit(JSON.parse(line.slice(5).trim()) as AiStreamEvent);
        } catch {
          /* ignore malformed */
        }
      }
    }

    if (!terminal) stallError();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (isAbortError(error)) {
      stallError();
      return;
    }
    throw error;
  } finally {
    if (headerTimer) clearTimeout(headerTimer);
    signal?.removeEventListener('abort', onUserAbort);
  }
}
