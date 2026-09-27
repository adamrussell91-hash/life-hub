# Live Notion Communications source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed authenticated live Notion Communications pages into the existing Plan 5 preview and idempotent writer without creating or relying on an export.

**Architecture:** The Notion connector harvests page IDs, properties, relation-title lookups, and enhanced Markdown into an OS-private JSON batch. A pure adapter converts that batch to `NotionComm` records, and a small reader gives the existing CLI the same source shape as its export reader. The existing planner, repositories, and import maps remain unchanged writers of record data.

**Tech Stack:** Node.js ESM, node:test, Notion MCP connector, Netlify Blobs repositories.

---

### Task 1: Normalise a live Notion page

**Files:**
- Create: `scripts/lib/notion-comms/live-page.mjs`
- Create: `tests/unit/notion-comms-live-page.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseLivePage } from '../../scripts/lib/notion-comms/live-page.mjs';

test('normaliseLivePage preserves direct dates, relations and Markdown blocks', () => {
  const page = normaliseLivePage({
    id: 'a'.repeat(32),
    properties: {
      'Meeting Title': 'Fixture review',
      'Meeting Type': 'Staff Meetings',
      'Communication Method': 'Video Call',
      'date:Date:start': '2026-09-02T01:00:00.000Z',
      'date:Date:end': '2026-09-02T02:00:00.000Z',
      'date:Date:is_datetime': 1,
      Attendees: ['https://app.notion.com/p/Sam-K-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
      'Follow-up Required': '__YES__'
    },
    body: '# Fixture review\\n\\n## Action Items\\n- [ ] Sam to reply'
  }, { ['b'.repeat(32)]: 'Sam K.' });
  assert.equal(page.date.start, '2026-09-02T01:00:00.000Z');
  assert.equal(page.attendees[0].name, 'Sam K.');
  assert.equal(page.todos[0].heading, 'Action Items');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/notion-comms-live-page.test.js`

Expected: FAIL because `live-page.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
import { markdownToBlocks } from './markdown-to-blocks.mjs';

const pageId = (value) => String(value ?? '').match(/([a-f0-9]{32})(?:\?|$)/i)?.[1]?.toLowerCase() ?? null;
const text = (value) => typeof value === 'string' ? value.trim() : '';

export function normaliseLivePage({ id, properties = {}, body = '' }, relationNames = {}) {
  const isDateTime = Number(properties['date:Date:is_datetime']) === 1;
  const start = text(properties['date:Date:start']);
  const relation = (value) => (Array.isArray(value) ? value : []).map((url) => {
    const notionId = pageId(url); return notionId && relationNames[notionId] ? { notionId, name: relationNames[notionId] } : null;
  }).filter(Boolean);
  const converted = markdownToBlocks(body);
  return { notionId: id, title: text(properties['Meeting Title']) || text(properties['Meeting Name']) || 'Untitled communication', meetingType: text(properties['Meeting Type']) || 'Other', communicationMethod: text(properties['Communication Method']), date: start ? { start, end: text(properties['date:Date:end']) || null, allDay: !isDateTime, timeZone: 'Australia/Sydney' } : null, followUpDate: text(properties['date:Follow-up Date:start']).slice(0, 10) || null, followUpRequired: properties['Follow-up Required'] === '__YES__' || properties['Follow-up Required'] === true, attendees: relation(properties.Attendees), studentName: text(properties['Student Name']), location: text(properties.Location), notes: text(properties['Notes and Follow Up']), parent: relation(properties['Parent item'])[0] ?? null, todos: converted.todos, blocks: converted.blocks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/notion-comms-live-page.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/notion-comms/live-page.mjs tests/unit/notion-comms-live-page.test.js
git commit -m "feat: normalise live notion pages"
```

### Task 2: Read a private live batch through the existing importer

**Files:**
- Create: `scripts/lib/notion-comms/read-live-batch.mjs`
- Modify: `scripts/import-notion-comms.mjs`
- Create: `tests/unit/notion-comms-read-live-batch.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('readLiveBatch converts private page input into planner rows', async () => {
  const result = await readLiveBatch('/private/tmp/invented-live-batch.json');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].notionId, 'a'.repeat(32));
  assert.deepEqual(result.unmatchedRows, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/notion-comms-read-live-batch.test.js`

Expected: FAIL because `readLiveBatch` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
import fs from 'node:fs/promises';
import { normaliseLivePage } from './live-page.mjs';

export async function readLiveBatch(file) {
  const input = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!Array.isArray(input.pages) || typeof input.relationNames !== 'object' || input.relationNames === null) throw new Error('Live batch requires pages and relationNames.');
  return { rows: input.pages.map((page) => normaliseLivePage(page, input.relationNames)), unmatchedRows: [] };
}
```

In `scripts/import-notion-comms.mjs`, require exactly one of `--export` and
`--live-input`, choose `readExport(exportDir)` or `readLiveBatch(liveInput)`,
and use `source.rows` directly when the source is live instead of calling
`parseRow` again.

- [ ] **Step 4: Run importer source tests**

Run: `node --test tests/unit/notion-comms-read-live-batch.test.js tests/unit/notion-comms-read-export.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/notion-comms/read-live-batch.mjs scripts/import-notion-comms.mjs tests/unit/notion-comms-read-live-batch.test.js
git commit -m "feat: accept live notion import batches"
```

### Task 3: Generate, preview, and apply direct batches

**Files:**
- Use: OS-private temporary paths only
- Use: `scripts/import-notion-comms.mjs`

- [ ] **Step 1: Harvest live records**

Use the authenticated Notion connector to query every Communications row and
fetch every associated page. Resolve relation URLs to current page titles and
write a temporary JSON object with `pages` and `relationNames`; do not print or
commit the object.

- [ ] **Step 2: Run the preview through the authenticated private-store transport**

Run: `node scripts/import-notion-comms.mjs --live-input /private/tmp/notion-comms-live.json --transport netlify-cli --report /private/tmp/notion-comms-report.md`

Expected: a count-only report that includes existing mappings, missing dates,
ambiguous people, and records by kind.

- [ ] **Step 3: Resolve only reported ambiguous people**

Preserve all existing person mappings. Apply explicit choices only through a
temporary `--people-map` input outside the repository; do not guess.

- [ ] **Step 4: Apply after Adam's explicit go-ahead**

Run: `node scripts/import-notion-comms.mjs --live-input /private/tmp/notion-comms-live.json --transport netlify-cli --apply`

Expected: count-only progress, immediate page/thread/person map writes, and a
safe stop with stage plus source ID on failure.

- [ ] **Step 5: Verify the completed migration**

Run the same direct preview again. Expected: zero records and people to create.
Then inspect one comm, one meeting, and one case thread through their private
repositories to confirm blocks and Universal Links are present.
