import {
  CHADWICK_FORCE_PLAN_NUDGE,
  shouldForceChadwickPlanProposal
} from '../../../js/core/workout-plan-detect.js';
import {
  buildPlannedWorkoutInput,
  findLatestWorkoutPlanText
} from '../../../js/core/parse-workout-chat.js';

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

export async function* streamWithChadwickPlanForce(anthropic, {
  slug,
  userMessage,
  today,
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

  const source = latestPlanSource({
    assistantText,
    messages: streamOpts.messages,
    userMessage
  });
  const input = buildPlannedWorkoutInput(source, { date: today });
  if (input) {
    yield { type: 'tool_call', id: 'forced_plan', name: 'log_entry', input };
    return;
  }

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
