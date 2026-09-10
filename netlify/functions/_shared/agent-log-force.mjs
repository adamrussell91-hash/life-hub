import {
  forceLogNudgeFor,
  forceStatusFor,
  shouldForceAgentLog
} from '../../../apps/life/js/core/log-finalize-detect.js';
import { streamWithChadwickPlanForce } from './chadwick-plan-force.mjs';

export {
  forceLogNudgeFor,
  forceStatusFor,
  shouldForceAgentLog
};

/**
 * Persona-agnostic log force: Chadwick keeps its early Confirm bypass;
 * every other logging agent gets a post-stream nudge if Adam asked to log
 * (or the agent claimed a save) without calling log_entry.
 */
export async function* streamWithAgentLogForce(anthropic, {
  slug,
  userMessage,
  ...streamOpts
} = {}) {
  if (slug === 'chadwick') {
    yield* streamWithChadwickPlanForce(anthropic, {
      slug,
      userMessage,
      ...streamOpts
    });
    return;
  }

  let assistantText = '';
  let sawLogEntry = false;

  if (typeof streamOpts.executeTools === 'function') {
    const innerExecute = streamOpts.executeTools;
    streamOpts = {
      ...streamOpts,
      executeTools: async (toolCall) => {
        if (toolCall?.name === 'log_entry') sawLogEntry = true;
        return innerExecute(toolCall);
      }
    };
  }

  for await (const event of anthropic.streamMessage(streamOpts)) {
    if (event.type === 'text' && typeof event.delta === 'string') {
      assistantText += event.delta;
    }
    if (event.type === 'tool_call' && event.name === 'log_entry') {
      sawLogEntry = true;
    }
    yield event;
  }

  if (!shouldForceAgentLog({ slug, userMessage, assistantText, sawLogEntry })) return;

  yield { type: 'status', text: forceStatusFor(slug) };

  const forceMessages = [
    ...(streamOpts.messages ?? []),
    {
      role: 'assistant',
      content: assistantText || '(claimed a save without calling log_entry)'
    },
    { role: 'user', content: forceLogNudgeFor(slug) }
  ];

  for await (const event of anthropic.streamMessage({
    ...streamOpts,
    messages: forceMessages
  })) {
    yield event;
  }
}
