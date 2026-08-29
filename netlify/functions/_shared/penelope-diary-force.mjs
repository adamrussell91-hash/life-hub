import {
  PENELOPE_FORCE_DIARY_NUDGE,
  shouldForcePenelopeDiaryProposal
} from '../../../js/core/diary-log-detect.js';

export { PENELOPE_FORCE_DIARY_NUDGE, shouldForcePenelopeDiaryProposal };

/**
 * After Penelope's normal stream, if Adam asked to log / she claimed the vault
 * but never called log_entry, run one forced Anthropic round that must propose.
 * Complements the thin finalize path in chat.mjs (skip mind blobs + no web_search).
 */
export async function* streamWithPenelopeDiaryForce(anthropic, {
  slug,
  userMessage,
  ...streamOpts
} = {}) {
  let assistantText = '';
  let sawLogEntry = false;

  for await (const event of anthropic.streamMessage(streamOpts)) {
    if (event.type === 'text' && typeof event.delta === 'string') {
      assistantText += event.delta;
    }
    if (event.type === 'tool_call' && event.name === 'log_entry') {
      sawLogEntry = true;
    }
    yield event;
  }

  if (slug !== 'penelope') return;
  if (!shouldForcePenelopeDiaryProposal({ userMessage, assistantText, sawLogEntry })) return;

  yield { type: 'status', text: 'Filing the diary onto Mind…' };

  const forceMessages = [
    ...(streamOpts.messages ?? []),
    {
      role: 'assistant',
      content: assistantText || '(claimed the diary was headed to the vault without calling log_entry)'
    },
    { role: 'user', content: PENELOPE_FORCE_DIARY_NUDGE }
  ];

  for await (const event of anthropic.streamMessage({
    ...streamOpts,
    messages: forceMessages
  })) {
    yield event;
  }
}
