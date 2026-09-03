import { describe, expect, it } from 'vitest';
import { buildLifeContextDigest, lifeContextToPromptBlock } from '@/domain/life-context';
import { createLifeContextProvider, defaultLifeContextProvider } from '@/ai/life-hub-client';

const SAMPLE = `# Purpose
Central node.
---
## Agent Directory
- stuff
---
## Current Constraints & Priorities
### Medical Status
- Condition X, medication Y 40mg daily, diagnosis detail that must never reach Clare.
---
## Today's Status (Monday 1 June 2026)
**Health:** Flare-up, medication increased, clinical detail here.
**Nutrition:** 2,000 kcal.
**Exercise:** Session logged.
**Mood:** 7/10.
**Energy:** Medium.
**Flags:** Appraisal goal overdue.
---
## This Week (1 - 7 June 2026)
**Key Events:**
- Wed 3: Dentist 2pm.
**Flags:**
- Salary sacrifice unactioned.
---
## This Month (June 2026)
**Upcoming:**
- 10 Jun: Wedding venue walkthrough.
**Active Goals:**
- Ship the Clare rebuild (High)
---
## Long-Term Trends & Patterns
**Health Trajectory:**
- Clinical narrative that must never reach Clare.
---
## Cross-Agent Coordination
- Chadwick->Sara: clinical detail unrelated to Clare.
- Diary -> Clare: new dog sitter went well.
- Clare -> Hammond: routed a task for review.
---
## Recent Agent Actions
- Some agent did a thing.
`;

describe('buildLifeContextDigest', () => {
  it('extracts only the operational sections', () => {
    const digest = buildLifeContextDigest(SAMPLE);
    expect(digest.today_status).toContain('Mood');
    expect(digest.today_status).toContain('Energy');
    expect(digest.today_status).toContain('Flags');
    expect(digest.this_week).toContain('Dentist');
    expect(digest.this_month).toContain('Wedding venue walkthrough');
    expect(digest.this_month).toContain('Ship the Clare rebuild');
    expect(digest.as_of).toBe('Monday 1 June 2026');
  });

  it('never surfaces Constraints, health trajectory, or the Today Health line', () => {
    const digest = buildLifeContextDigest(SAMPLE);
    const block = lifeContextToPromptBlock(digest) ?? '';
    expect(block).not.toMatch(/diagnosis detail/i);
    expect(block).not.toMatch(/clinical narrative/i);
    expect(block).not.toMatch(/medication increased/i);
    expect(block).not.toMatch(/40mg/i);
  });

  it('keeps only Clare-routed cross-agent lines', () => {
    const digest = buildLifeContextDigest(SAMPLE);
    expect(digest.clare_directives).toEqual([
      'Diary -> Clare: new dog sitter went well.',
      'Clare -> Hammond: routed a task for review.'
    ]);
    expect(digest.clare_directives.join('\n')).not.toMatch(/Chadwick/);
  });

  it('returns null prompt block when nothing is available', () => {
    expect(lifeContextToPromptBlock(null)).toBeNull();
    const empty = buildLifeContextDigest('# Purpose\nNothing here.');
    expect(lifeContextToPromptBlock(empty)).toBeNull();
  });
});

describe('life-hub-client', () => {
  it('returns null when LIFE_HUB_DATA_TOKEN is unset', () => {
    expect(defaultLifeContextProvider({})).toBeNull();
  });

  it('fetches central-node.md and returns a digest', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(SAMPLE, { status: 200, headers: { 'content-type': 'text/plain' } });
    const provider = createLifeContextProvider({
      token: 'github_pat_test',
      repository: 'adamrussell91-hash/life-hub-data',
      fetchImpl
    });
    const digest = await provider();
    expect(digest?.today_status).toContain('Mood');
    expect(digest?.today_status).not.toMatch(/medication increased/i);
  });

  it('returns null on non-OK GitHub responses', async () => {
    const fetchImpl: typeof fetch = async () => new Response('nope', { status: 401 });
    const provider = createLifeContextProvider({
      token: 'bad',
      repository: 'adamrussell91-hash/life-hub-data',
      fetchImpl
    });
    expect(await provider()).toBeNull();
  });
});
