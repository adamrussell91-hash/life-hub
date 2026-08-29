import {
  CHADWICK_FORCE_PLAN_NUDGE,
  shouldForceChadwickPlanProposal
} from '../../../js/core/workout-plan-detect.js';

export { CHADWICK_FORCE_PLAN_NUDGE, shouldForceChadwickPlanProposal };

export async function* streamWithChadwickPlanForce(anthropic, {
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
