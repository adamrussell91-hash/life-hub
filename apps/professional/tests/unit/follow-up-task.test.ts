import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFollowUpIntents,
  createOrRetryFollowUpTask,
  recipientPersonRefsFromLinks,
  type FollowUpLinkRecord
} from '@/services/follow-up-task';

describe('follow-up Task orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds one follow_up and one contact per recipient Person', () => {
    const intents = buildFollowUpIntents({
      communicationRef: 'professional:communication:communication_1',
      recipientPersonRefs: ['shared:person:person_seth']
    });
    expect(intents).toEqual([
      {
        intent_id: 'follow_up:professional:communication:communication_1',
        relationship_type: 'follow_up',
        target_ref: 'professional:communication:communication_1'
      },
      {
        intent_id: 'contact:shared:person:person_seth',
        relationship_type: 'contact',
        target_ref: 'shared:person:person_seth'
      }
    ]);
  });

  it('reads recipients from Universal Links only', () => {
    const refs = recipientPersonRefsFromLinks([
      {
        link: {
          id: 'ul_1',
          status: 'current',
          relationship_type: 'recipient',
          source_ref: 'professional:communication:c1',
          target_ref: 'shared:person:person_seth'
        }
      },
      {
        link: {
          id: 'ul_2',
          status: 'ended',
          relationship_type: 'recipient',
          source_ref: 'professional:communication:c1',
          target_ref: 'shared:person:person_old'
        }
      },
      {
        link: {
          id: 'ul_3',
          status: 'current',
          relationship_type: 'follows_from',
          source_ref: 'professional:communication:c1',
          target_ref: 'tasks:task:task_1'
        }
      }
    ] as Array<{ link: FollowUpLinkRecord }>);
    expect(refs).toEqual(['shared:person:person_seth']);
  });

  it('creates one Task with follow_up and contact links; Task body never receives ids', async () => {
    const createdTasks: Array<Record<string, unknown>> = [];
    const createdLinks: Array<Record<string, unknown>> = [];
    const result = await createOrRetryFollowUpTask(
      {
        createTask: async (input) => {
          const task = { id: 'task_follow_1', title: input.title };
          createdTasks.push(task);
          return task;
        },
        listLinksForEntity: async () => ({
          outgoing: [
            {
              link: {
                id: 'ul_recipient',
                status: 'current',
                relationship_type: 'recipient',
                source_ref: 'professional:communication:communication_1',
                target_ref: 'shared:person:person_seth'
              }
            }
          ]
        }),
        createLink: async (input) => {
          createdLinks.push(input);
          return {
            link: { id: `ul_${createdLinks.length}` },
            created: true
          };
        }
      },
      {
        communicationId: 'communication_1',
        title: 'Follow up: Proposal'
      }
    );

    expect(result.incomplete).toBe(false);
    expect(result.created_task).toBe(true);
    expect(result.state.task_id).toBe('task_follow_1');
    expect(createdTasks).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(createdTasks[0], 'person_id')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(createdTasks[0], 'communication_id')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(createdTasks[0], 'universal_link_id')).toBe(false);
    expect(createdLinks).toEqual([
      {
        source_ref: 'tasks:task:task_follow_1',
        target_ref: 'professional:communication:communication_1',
        relationship_type: 'follow_up'
      },
      {
        source_ref: 'tasks:task:task_follow_1',
        target_ref: 'shared:person:person_seth',
        relationship_type: 'contact'
      }
    ]);
  });

  it('keeps the original Task when a contact write fails and retry completes only missing links', async () => {
    let taskCreates = 0;
    const linkCalls: string[] = [];
    let failContact = true;

    const deps = {
      createTask: async (input: { title: string }) => {
        taskCreates += 1;
        return { id: 'task_saved', title: input.title };
      },
      listLinksForEntity: async () => ({
        outgoing: [
          {
            link: {
              id: 'ul_recipient',
              status: 'current',
              relationship_type: 'recipient',
              source_ref: 'professional:communication:communication_1',
              target_ref: 'shared:person:person_seth'
            }
          }
        ]
      }),
      createLink: async (input: {
        source_ref: string;
        target_ref: string;
        relationship_type: string;
      }) => {
        linkCalls.push(input.relationship_type);
        if (input.relationship_type === 'contact' && failContact) {
          throw new Error('contact write failed');
        }
        return { link: { id: `ul_${input.relationship_type}` }, created: true };
      }
    };

    const first = await createOrRetryFollowUpTask(deps, {
      communicationId: 'communication_1',
      title: 'Follow up: Proposal'
    });
    expect(first.incomplete).toBe(true);
    expect(first.state.task_id).toBe('task_saved');
    expect(first.state.failed_relationships.map((item) => item.relationship_type)).toEqual(['contact']);
    expect(first.state.completed_intent_ids).toContain(
      'follow_up:professional:communication:communication_1'
    );
    expect(taskCreates).toBe(1);

    failContact = false;
    const second = await createOrRetryFollowUpTask(deps, {
      communicationId: 'communication_1',
      title: 'Follow up: Proposal',
      prior: first.state
    });
    expect(second.incomplete).toBe(false);
    expect(second.created_task).toBe(false);
    expect(second.state.task_id).toBe('task_saved');
    expect(taskCreates).toBe(1);
    expect(linkCalls.filter((type) => type === 'follow_up')).toHaveLength(1);
    expect(linkCalls.filter((type) => type === 'contact')).toHaveLength(2);
  });

  it('retry creates no second Task and no duplicate equivalent link when createLink is idempotent', async () => {
    let taskCreates = 0;
    const linkAttempts = new Map<string, number>();
    const deps = {
      createTask: async () => {
        taskCreates += 1;
        return { id: 'task_one' };
      },
      listLinksForEntity: async () => ({
        outgoing: [
          {
            link: {
              id: 'ul_recipient',
              status: 'current',
              relationship_type: 'recipient',
              source_ref: 'professional:communication:c1',
              target_ref: 'shared:person:person_seth'
            }
          }
        ]
      }),
      createLink: async (input: {
        source_ref: string;
        target_ref: string;
        relationship_type: string;
      }) => {
        const key = `${input.relationship_type}|${input.target_ref}`;
        linkAttempts.set(key, (linkAttempts.get(key) ?? 0) + 1);
        return { link: { id: `ul_${input.relationship_type}` }, created: linkAttempts.get(key) === 1 };
      }
    };

    const first = await createOrRetryFollowUpTask(deps, {
      communicationId: 'c1',
      title: 'Follow up'
    });
    const second = await createOrRetryFollowUpTask(deps, {
      communicationId: 'c1',
      title: 'Follow up',
      prior: first.state
    });
    expect(taskCreates).toBe(1);
    expect(second.created_task).toBe(false);
    expect(linkAttempts.get('follow_up|professional:communication:c1')).toBe(1);
    expect(linkAttempts.get('contact|shared:person:person_seth')).toBe(1);
  });
});
