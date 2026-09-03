import { describe, expect, it, vi } from 'vitest';
import {
  createHaikuJudge,
  INTUITIVE_SCAN_SYSTEM,
  localStubJudge,
  parseIntuitiveJudgment
} from '@/ai/intuitive-judge';
import type { IntuitiveDigest } from '@/domain/intuitive-digest';

function emptyDigest(overrides: Partial<IntuitiveDigest> = {}): IntuitiveDigest {
  return {
    as_of: '2026-08-26T00:00:00.000Z',
    timezone: 'Australia/Sydney',
    horizon_days: 21,
    week: { days: 7, tasks: 6, minutes: 400 },
    load: [
      {
        date: '2026-08-27',
        display: '27/08/26',
        tasks: 5,
        minutes: 320,
        titles: ['A', 'B', 'C', 'D']
      }
    ],
    already_detected: [],
    projects: [
      {
        id: 'proj_deep_a',
        title: 'MindWorks',
        type: 'standard',
        status: 'active',
        energy: 'deep_focus',
        target: '2026-09-04',
        open_tasks: 4,
        estimated_minutes: 300
      },
      {
        id: 'proj_deep_b',
        title: 'Masters thesis',
        type: 'standard',
        status: 'active',
        energy: 'deep_focus',
        target: '2026-09-10',
        open_tasks: 3,
        estimated_minutes: 240
      }
    ],
    tasks: [
      {
        id: 'task_huge',
        title: 'Write the term showcase brief',
        due: '2026-09-02',
        due_display: '02/09/26',
        minutes: 180,
        priority: 'high',
        domain: 'teaching',
        project: 'MindWorks',
        status: 'open',
        overdue: false
      }
    ],
    ...overrides
  };
}

describe('parseIntuitiveJudgment', () => {
  it('reads fenced JSON and drops generic or duplicate flags', () => {
    const flags = parseIntuitiveJudgment(`
Here you go
\`\`\`json
{
  "flags": [
    {
      "pattern_description": "Write the term showcase brief is a 180-minute lift sitting on a week that already has five dues.",
      "source_project_or_task_id": "task_huge",
      "fingerprint": "intuitive:task_huge:crowded-week"
    },
    {
      "pattern_description": "things are busy",
      "source_project_or_task_id": null,
      "fingerprint": "intuitive:busy"
    },
    {
      "pattern_description": "Write the term showcase brief is a 180-minute lift sitting on a week that already has five dues.",
      "source_project_or_task_id": "task_huge",
      "fingerprint": "intuitive:task_huge:crowded-week"
    }
  ]
}
\`\`\`
`);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.fingerprint).toBe('intuitive:task_huge:crowded-week');
  });

  it('prefixes fingerprints that the model forgot to namespace', () => {
    const flags = parseIntuitiveJudgment(
      JSON.stringify({
        flags: [
          {
            pattern_description: 'Two deep-focus projects are landing in the same fortnight.',
            source_project_or_task_id: 'proj_deep_a',
            fingerprint: 'deep-stack'
          }
        ]
      })
    );
    expect(flags[0]?.fingerprint).toBe('intuitive:proj_deep_a');
  });
});

describe('localStubJudge', () => {
  it('flags a huge task when the week is already crowded', async () => {
    const judgment = await localStubJudge(emptyDigest());
    expect(judgment.model).toBe('local-stub');
    expect(judgment.flags.some((flag) => flag.fingerprint.includes('crowded-week'))).toBe(true);
    expect(judgment.flags[0]?.pattern_description).toMatch(/180-minute|deep-focus/i);
  });
});

describe('createHaikuJudge', () => {
  it('sends the compact digest to Haiku and parses the reply', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                flags: [
                  {
                    pattern_description:
                      'The showcase brief is huge and five other dues sit in the same week — start it before Thursday packs out.',
                    source_project_or_task_id: 'task_huge',
                    fingerprint: 'intuitive:task_huge:crowded-week'
                  }
                ]
              })
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    const judge = createHaikuJudge({ apiKey: 'test-key', fetchImpl: fetchImpl as unknown as typeof fetch });
    const digest = emptyDigest();
    const judgment = await judge(digest);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [request, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(request).toContain('api.anthropic.com/v1/messages');
    const payload = JSON.parse(String(init.body)) as {
      model: string;
      system: string;
      messages: Array<{ content: string }>;
    };
    expect(payload.model).toBe('claude-haiku-4-5');
    expect(payload.system).toContain('compound judgment');
    expect(payload.system).toBe(INTUITIVE_SCAN_SYSTEM);
    expect(JSON.parse(payload.messages[0]!.content)).toMatchObject({ as_of: digest.as_of });
    expect(judgment.flags).toHaveLength(1);
    expect(judgment.model).toBe('claude-haiku-4-5');
  });
});
