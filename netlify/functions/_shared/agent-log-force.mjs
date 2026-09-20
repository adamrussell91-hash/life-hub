import {
  forceLogNudgeFor,
  forceStatusFor,
  missingSaraBodyLogTypes,
  saraBodyCoverageNudge,
  shouldForceAgentLog
} from '../../../apps/life/js/core/log-finalize-detect.js';
import { streamWithChadwickPlanForce } from './chadwick-plan-force.mjs';

export {
  forceLogNudgeFor,
  forceStatusFor,
  shouldForceAgentLog
};

function noteLogEntry(toolCall, seenTypes) {
  if (toolCall?.name !== 'log_entry') return false;
  const type = toolCall.input?.type;
  if (typeof type === 'string' && type) seenTypes.add(type);
  return true;
}

/**
 * Persona-agnostic log force: Chadwick keeps its early Confirm bypass.
 * Other logging agents get a post-stream nudge when Adam asked to log
 * or the agent claimed a save without calling log_entry.
 *
 * Sara also gets deterministic body coverage enforcement. If one message
 * contains both composition and tape figures, the stream keeps nudging until
 * every required record type has produced a log_entry proposal.
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
  const seenLogTypes = new Set();

  if (typeof streamOpts.executeTools === 'function') {
    const innerExecute = streamOpts.executeTools;
    streamOpts = {
      ...streamOpts,
      executeTools: async (toolCall) => {
        if (noteLogEntry(toolCall, seenLogTypes)) sawLogEntry = true;
        return innerExecute(toolCall);
      }
    };
  }

  for await (const event of anthropic.streamMessage(streamOpts)) {
    if (event.type === 'text' && typeof event.delta === 'string') {
      assistantText += event.delta;
    }
    if (event.type === 'tool_call' && noteLogEntry(event, seenLogTypes)) {
      sawLogEntry = true;
    }
    yield event;
  }

  const maxForcedPasses = slug === 'sara' ? 3 : 1;
  for (let attempt = 0; attempt < maxForcedPasses; attempt += 1) {
    const missingBodyTypes = slug === 'sara'
      ? missingSaraBodyLogTypes({ userMessage, loggedTypes: seenLogTypes })
      : [];

    const needsForce = shouldForceAgentLog({
      slug,
      userMessage,
      assistantText,
      sawLogEntry,
      loggedTypes: seenLogTypes
    });

    if (!needsForce && missingBodyTypes.length === 0) return;

    yield { type: 'status', text: forceStatusFor(slug) };

    const nudge = missingBodyTypes.length
      ? saraBodyCoverageNudge(missingBodyTypes)
      : forceLogNudgeFor(slug);

    const forceMessages = [
      ...(streamOpts.messages ?? []),
      {
        role: 'assistant',
        content: assistantText || '(claimed a save without calling log_entry)'
      },
      { role: 'user', content: nudge }
    ];

    let forcedText = '';
    for await (const event of anthropic.streamMessage({
      ...streamOpts,
      messages: forceMessages
    })) {
      if (event.type === 'text' && typeof event.delta === 'string') {
        forcedText += event.delta;
      }
      if (event.type === 'tool_call' && noteLogEntry(event, seenLogTypes)) {
        sawLogEntry = true;
      }
      yield event;
    }
    assistantText += forcedText;

    if (slug !== 'sara') return;
  }
}
