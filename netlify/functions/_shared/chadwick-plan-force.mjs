import {
  CHADWICK_FORCE_PLAN_NUDGE,
  shouldForceChadwickPlanProposal
} from '../../../apps/life/js/core/workout-plan-detect.js';
import {
  buildPlannedWorkoutInput,
  findLatestWorkoutPlanText
} from '../../../apps/life/js/core/parse-workout-chat.js';

export { CHADWICK_FORCE_PLAN_NUDGE, shouldForceChadwickPlanProposal };

function latestPlanSource({ assistantText, messages, userMessage }) {
  const texts = [];
  for (const entry of messages ?? []) {
    if (typeof entry?.content === 'string') texts.push(entry.content);
  }
  if (typeof assistantText === 'string' && assistantText.trim()) texts.push(assistantText);
  if (typeof userMessage === 'string' && userMessage.trim()) texts.push(userMessage);
  return findLatestWorkoutPlanText(texts);
}

export function resolveForcedChadwickPlan({
  slug,
  userMessage,
  today,
  messages,
  assistantText = '',
  sawLogEntry = false
} = {}) {
  if (slug !== 'chadwick' || sawLogEntry) return null;
  if (!shouldForceChadwickPlanProposal({ userMessage, assistantText, sawLogEntry })) {
    return null;
  }
  const source = latestPlanSource({ assistantText, messages, userMessage });
  return buildPlannedWorkoutInput(source, { date: today });
}

function forcedPlanEvents(input) {
  return [
    { type: 'status', text: 'Locking the plan onto Fitness…' },
    { type: 'text', delta: 'On Fitness — confirm to save the plan.' },
    { type: 'tool_call', id: 'forced_plan', name: 'log_entry', input }
  ];
}

export async function* streamWithChadwickPlanForce(anthropic, {
  slug,
  userMessage,
  today,
  ...streamOpts
} = {}) {
  // Always give the model the first pass with full Central Node / history /
  // body context already in the system prompt. Mechanical early force used to
  // skip that load and emit cue-less "Planned session" cards blind to EP/pain.
  let assistantText = '';
  let sawLogEntry = false;

  // anthropic-client swallows tool_call after executeTools returns non-null.
  // Count those log_entry calls here or late-force emits a second Confirm.
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

  const late = resolveForcedChadwickPlan({
    slug,
    userMessage,
    today,
    messages: streamOpts.messages,
    assistantText,
    sawLogEntry
  });
  if (late) {
    for (const event of forcedPlanEvents(late)) yield event;
    return;
  }

  if (slug !== 'chadwick') return;
  if (!shouldForceChadwickPlanProposal({ userMessage, assistantText, sawLogEntry })) return;

  yield { type: 'status', text: 'Locking the plan onto Fitness…' };

  const forceMessages = [
    ...(streamOpts.messages ?? []),
    {
      role: 'assistant',
      content: assistantText || '(described a workout in chat without calling log_entry)'
    },
    { role: 'user', content: CHADWICK_FORCE_PLAN_NUDGE }
  ];

  for await (const event of anthropic.streamMessage({
    ...streamOpts,
    messages: forceMessages
  })) {
    yield event;
  }
}
