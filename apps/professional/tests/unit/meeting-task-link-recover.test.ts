import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/api/client';
import {
  meetingHasLinkedTask,
  meetingTaskLinkWrote
} from '@/api/meetings';
import type { MeetingRecord } from '@/domain/types';

describe('meetingTaskLinkWrote', () => {
  it('is true for the incomplete bind after the Task row already exists', () => {
    expect(
      meetingTaskLinkWrote(
        new ApiClientError(
          { code: 'professional_task_link_incomplete', message: 'Task relationship could not be completed.' },
          503,
          { operation_id: 'ptl_1', task_id: 'task_1' }
        )
      )
    ).toBe(true);
  });

  it('is false for a timeout with no write proof', () => {
    expect(meetingTaskLinkWrote(new ApiClientError({ code: 'timeout', message: 'Timed out' }, 504))).toBe(
      false
    );
  });
});

describe('meetingHasLinkedTask', () => {
  const meeting = {
    follow_up_operations: [
      { operation_id: 'ptl_fu', status: 'committed', task_id: 'task_fu', title: 'Call Seth' }
    ]
  } as MeetingRecord;

  it('matches a follow-up by title after a timed-out create', () => {
    expect(meetingHasLinkedTask(meeting, 'follow_up', { title: 'Call Seth' })).toBe(true);
    expect(meetingHasLinkedTask(meeting, 'follow_up', { title: 'Other' })).toBe(false);
    expect(meetingHasLinkedTask(meeting, 'preparation', { title: 'Call Seth' })).toBe(false);
  });
});
