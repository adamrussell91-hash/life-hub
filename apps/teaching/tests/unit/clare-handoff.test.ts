import { describe, expect, it } from 'vitest';
import { isTasksClareRequest, tasksClareHref } from '@/ai/clare-handoff';

describe('Clare hand-off to Tasks', () => {
  it.each([
    'Can you schedule a meeting with the head of English?',
    'Book a time with Priya on Thursday',
    'Put parent-teacher interviews in my calendar',
    'Remind me to chase the Year 12 drafts tomorrow',
    'Set up a catch-up with my mentor',
    'Add a task to email the excursion form',
    'Reschedule my call with the deputy'
  ])('sends "%s" to Tasks', (message) => {
    expect(isTasksClareRequest(message)).toBe(true);
  });

  it.each([
    'Tighten the instructions for the task in this lesson',
    'Make a checklist for the essay plan',
    'Order the steps for the Othello lesson',
    'What book are we reading in this unit?'
  ])('keeps "%s" in Teaching', (message) => {
    expect(isTasksClareRequest(message)).toBe(false);
  });

  it('links to Clare in Tasks with the message sent on arrival', () => {
    expect(tasksClareHref('  Book a meeting & agenda ')).toBe(
      '/tasks/#/clare?agent=clare&send=1&prompt=Book%20a%20meeting%20%26%20agenda'
    );
  });
});
