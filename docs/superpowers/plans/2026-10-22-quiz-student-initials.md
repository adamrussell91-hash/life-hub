# Quiz Student Initials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students take a Teaching quiz under initials from their class list. Each set of initials is claimed once per class, locked to one device, and shown to the teacher as "BB · Bob Brown".

**Architecture:** Class-list students gain a stable `id` and `initials`. One TypeScript module holds the rules, and it is generated to an `.mjs` for the Netlify functions. A new server module stores claims as create-only blobs per class. The quiz endpoint finds the student from `class_id` plus a class-scoped device token, keys their attempts by student (not device), and records `class_id`/`student_id` on each attempt. The teacher's Students section gains an initials column, a claimed badge and a Release button. The student quiz asks for initials when the device holds no claim.

**Tech Stack:** TypeScript + Vite + vitest (jsdom) in `apps/teaching`; Netlify Functions (`.mjs`) with Netlify Blobs; `node:test` for server tests in `tests/unit`; esbuild generator `scripts/generate-alchemy-schema.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-22-quiz-student-initials-design.md`

**Deviations from the spec, decided while planning:**
- **Attempts are keyed by student, not device,** once a student is known. A released student who re-claims on a new device keeps their attempt count and history, and can't get extra goes by switching devices.
- **Missing student ids are derived from the name** (a short hash), so an old list without ids gives the same ids on the server and in the browser until the teacher saves it.
- **The live board stays as it is.** It only ever shows counts, never names. `live_join` requires a claim, and the player record stores the `student_id`.
- **The class-scoped token lives under the localStorage key `quiz-device:class:{classId}`,** because `deviceToken` adds the `quiz-device:` prefix.
- **The teacher's board display** (`teacher/lesson-display.ts`) has no class, so its quiz shows "Open this quiz from your class page." Students never answer on the board.
- **The server doesn't check that the quiz's unit belongs to the class.** A student would need another class's id and that class's initials to get around it, and the check could wrongly block a quiz whose unit is no longer active.

**Rules for every task:**
- Real people's names never go in code, tests or fixtures. Use invented names: Bob Brown, Tom Tills, Ben Bates, Ava Moss.
- Run commands from the repo root `/Users/example/Projects/life-hub-quiz-initials` unless a step says otherwise.
- Server tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`.
- Client tests: `cd apps/teaching && npx vitest run tests/unit/<file>.test.ts`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/teaching/src/schemas/student-initials.ts` | Create | Initials rules: normalise, derive, assign ids/initials, find problems |
| `netlify/functions/_shared/student-initials.mjs` | Generated | Server copy of the above |
| `scripts/generate-alchemy-schema.mjs` | Modify | Add the generator entry |
| `apps/teaching/src/schemas/class.ts` | Modify | `ClassStudentSchema` gains `id`, `initials` |
| `netlify/functions/class.mjs` | Modify | `cleanClassStudents` keeps and fills `id`/`initials` |
| `netlify/functions/_shared/class-claims.mjs` | Create | Load roster, claim, look up, list, release |
| `netlify/functions/class-claims.mjs` | Create | Teacher endpoint `/api/classes/:id/claims` |
| `netlify/functions/_shared/quiz.mjs` | Modify | Identify the student, `claim` action, student-keyed attempts, labels in results |
| `apps/teaching/src/blocks/classroom-tools/logic.ts` | Modify | `parseStudentList` carries `id`/`initials` over |
| `apps/teaching/src/teacher/sections/class-students.ts` | Modify | Initials column, claimed badge, Release |
| `apps/teaching/src/quiz/student-quiz.ts` | Modify | Class context, initials box, "Quizzing as BB" |
| `apps/teaching/src/student/lesson-view.ts` | Modify | Pass `classId` into the quiz |
| `apps/teaching/src/quiz/teacher-panel.ts` | Modify | "BB · Bob Brown" labels |
| `apps/teaching/src/quiz/quiz.css`, `apps/teaching/src/blocks/classroom-tools/classroom-tools.css` | Modify | Styles for the new controls |
| `apps/teaching/scripts/mock-api.ts` | Modify | Route the claims endpoint for local dev |
| `tests/unit/student-initials.test.js`, `tests/unit/class-claims.test.js` | Create | Server tests |
| `tests/unit/quiz.test.js`, `tests/unit/classroom-tools.test.js` | Modify | Class context, new cases |
| `apps/teaching/tests/unit/student-initials.test.ts`, `apps/teaching/tests/unit/class-students-initials.test.ts` | Create | Client tests |
| `apps/teaching/tests/unit/classroom-tools.test.ts` | Modify | Save payload now carries ids/initials |

---

### Task 1: Shared initials rules

**Files:**
- Create: `apps/teaching/src/schemas/student-initials.ts`
- Modify: `apps/teaching/src/schemas/class.ts:27-30`
- Modify: `scripts/generate-alchemy-schema.mjs`
- Generated: `netlify/functions/_shared/student-initials.mjs`
- Test: `apps/teaching/tests/unit/student-initials.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/teaching/tests/unit/student-initials.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assignInitials, deriveInitials, initialsProblems, normaliseInitials, studentIdFor } from '@/schemas/student-initials';
import { ClassStudentSchema } from '@/schemas';

describe('student initials', () => {
  it('normalises what a student types', () => {
    expect(normaliseInitials(' b.b ')).toBe('BB');
    expect(normaliseInitials('bb2')).toBe('BB2');
    expect(normaliseInitials('')).toBe('');
  });

  it('derives initials from a name, up to four letters', () => {
    expect(deriveInitials('Bob Brown')).toBe('BB');
    expect(deriveInitials('Mary-Jane Ann Smith Lee')).toBe('MJAS');
    expect(deriveInitials('Ava')).toBe('A');
    expect(deriveInitials('  ')).toBe('S');
  });

  it('gives a stable id from the name when one is missing', () => {
    expect(studentIdFor('Bob Brown')).toBe(studentIdFor(' bob brown '));
    expect(studentIdFor('Bob Brown')).not.toBe(studentIdFor('Tom Tills'));
    expect(studentIdFor('Bob Brown')).toMatch(/^st_[a-z0-9]+$/);
  });

  it('fills in ids and initials, numbering a clash and keeping set values', () => {
    const out = assignInitials([
      { name: 'Bob Brown', skip_picker: false },
      { name: 'Ben Bates', skip_picker: false },
      { name: 'Tom Tills', skip_picker: true, id: 'st_keep', initials: 'TOM' }
    ]);
    expect(out.map((s) => s.initials)).toEqual(['BB', 'BB2', 'TOM']);
    expect(out[2]).toEqual({ name: 'Tom Tills', skip_picker: true, id: 'st_keep', initials: 'TOM' });
    expect(new Set(out.map((s) => s.id)).size).toBe(3);
  });

  it('never hands a derived set of initials to someone when a later student already holds it', () => {
    const out = assignInitials([
      { name: 'Bob Brown', skip_picker: false },
      { name: 'Ben Bates', skip_picker: false, initials: 'BB' }
    ]);
    expect(out.map((s) => s.initials)).toEqual(['BB2', 'BB']);
  });

  it('renumbers a duplicate that was typed in, and is stable when run twice', () => {
    const once = assignInitials([
      { name: 'Bob Brown', skip_picker: false, initials: 'BB' },
      { name: 'Ben Bates', skip_picker: false, initials: 'BB' }
    ]);
    expect(once.map((s) => s.initials)).toEqual(['BB', 'BB2']);
    expect(assignInitials(once)).toEqual(once);
  });

  it('lists problems beside each student', () => {
    const problems = initialsProblems([
      { name: 'Bob Brown', initials: 'BB' },
      { name: 'Ben Bates', initials: 'bb' },
      { name: 'Tom Tills', initials: 'T1T' }
    ]);
    expect(problems.get(0)).toBeUndefined();
    expect(problems.get(1)).toBe('BB is already used by Bob Brown.');
    expect(problems.get(2)).toBe('Use 1–4 letters, then a number if needed, like BB or BB2.');
  });

  it('the class list schema accepts the new fields and refuses bad initials', () => {
    expect(ClassStudentSchema.parse({ name: 'Bob Brown', id: 'st_abc', initials: 'BB2' }).initials).toBe('BB2');
    expect(ClassStudentSchema.safeParse({ name: 'Bob Brown', initials: 'bb' }).success).toBe(false);
    expect(ClassStudentSchema.parse({ name: 'Bob Brown' }).id).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/student-initials.test.ts`
Expected: FAIL, because `@/schemas/student-initials` doesn't exist.

- [ ] **Step 3: Write the module**

`apps/teaching/src/schemas/student-initials.ts`:

```ts
/**
 * Initials on a class list: how a quiz knows who is answering. One rule for
 * the class page in the browser and the quiz server, which runs a generated
 * copy (netlify/functions/_shared/student-initials.mjs).
 */

/** 1–4 letters, then an optional number for a double-up: BB, BB2. */
export const INITIALS_PATTERN = /^[A-Z]{1,4}[0-9]?$/;
export const STUDENT_ID_PATTERN = /^st_[a-z0-9_]{1,24}$/;

export type RosterStudent = { name: string; skip_picker?: boolean; id?: string; initials?: string };
export type RosterEntry<T extends RosterStudent = RosterStudent> = T & { id: string; initials: string };

/** " b.b " → "BB". Anything but letters and digits is dropped. */
export function normaliseInitials(text: string): string {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

/** First letter of each word, up to four: "Bob Brown" → "BB". */
export function deriveInitials(name: string): string {
  const letters = String(name ?? '')
    .split(/[\s-]+/)
    .map((word) => word.replace(/[^A-Za-z]/g, '').charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 4);
  return letters || 'S';
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * An id for a student saved before ids existed. It comes from the name, so
 * the browser and the server agree on it until the teacher saves the list.
 */
export function studentIdFor(name: string): string {
  return `st_${fnv1a(String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase())}`;
}

function freeInitials(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n <= 9; n += 1) {
    const next = `${base.slice(0, 4)}${n}`;
    if (!taken.has(next)) return next;
  }
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const next = `${base.slice(0, 3)}${letter}`;
    if (!taken.has(next)) return next;
  }
  return base;
}

/**
 * Fills in a missing id and initials for every student and keeps any that are
 * set. A clash gets the lowest free number (BB, BB2, BB3), and a derived set
 * of initials never takes one another student already holds.
 */
export function assignInitials<T extends RosterStudent>(students: readonly T[]): Array<RosterEntry<T>> {
  const held = new Set<string>();
  for (const s of students) {
    const own = normaliseInitials(s.initials ?? '');
    if (INITIALS_PATTERN.test(own)) held.add(own);
  }
  const used = new Set<string>();
  const ids = new Set<string>();
  return students.map((s) => {
    const own = normaliseInitials(s.initials ?? '');
    let initials: string;
    if (INITIALS_PATTERN.test(own) && !used.has(own)) initials = own;
    else initials = freeInitials(deriveInitials(s.name), new Set([...held, ...used]));
    used.add(initials);
    let id = s.id && STUDENT_ID_PATTERN.test(s.id) && !ids.has(s.id) ? s.id : studentIdFor(s.name);
    for (let n = 2; ids.has(id); n += 1) id = `${studentIdFor(s.name)}_${n}`;
    ids.add(id);
    return { ...s, id, initials };
  });
}

/** Problems to show beside each student, keyed by row. Empty when the list is fine. */
export function initialsProblems(students: readonly RosterStudent[]): Map<number, string> {
  const out = new Map<number, string>();
  const first = new Map<string, number>();
  students.forEach((s, i) => {
    const value = normaliseInitials(s.initials ?? '');
    if (!INITIALS_PATTERN.test(value)) {
      out.set(i, 'Use 1–4 letters, then a number if needed, like BB or BB2.');
      return;
    }
    const earlier = first.get(value);
    if (earlier !== undefined) out.set(i, `${value} is already used by ${students[earlier]?.name ?? 'another student'}.`);
    else first.set(value, i);
  });
  return out;
}
```

Note on the duplicate-typed test: the first BB is kept. The second BB derives to "BB" from "Ben Bates", finds it taken, and becomes BB2. Running it again keeps BB and BB2 unchanged, because both are now valid and unique.

- [ ] **Step 4: Add the fields to the schema**

In `apps/teaching/src/schemas/class.ts`, add the import at the top and the two fields:

```ts
import { INITIALS_PATTERN, STUDENT_ID_PATTERN } from './student-initials';
```

```ts
export const ClassStudentSchema = z.object({
  name: z.string().min(1).max(80),
  skip_picker: z.boolean().default(false),
  /** Never changes once saved, so renames keep a student's quiz results. */
  id: z.string().regex(STUDENT_ID_PATTERN).optional(),
  /** What the student types to take a quiz. Unique within the class. */
  initials: z.string().regex(INITIALS_PATTERN).optional()
});
```

Also update the doc comment above it: "One student on a class list, for the classroom name picker, groups and quiz initials."

- [ ] **Step 5: Run the test and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/student-initials.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Add the generator entry and generate**

Add to the end of `scripts/generate-alchemy-schema.mjs`:

```js
await build({
  entryPoints: ['apps/teaching/src/schemas/student-initials.ts'],
  outfile: 'netlify/functions/_shared/student-initials.mjs',
  bundle: true, platform: 'node', format: 'esm',
  banner: {js:'// Generated from apps/teaching/src/schemas/student-initials.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});
```

Run: `node scripts/generate-alchemy-schema.mjs && head -3 netlify/functions/_shared/student-initials.mjs`
Expected: the banner line, then `// apps/teaching/src/schemas/student-initials.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/schemas/student-initials.ts apps/teaching/src/schemas/class.ts scripts/generate-alchemy-schema.mjs netlify/functions/_shared/student-initials.mjs apps/teaching/tests/unit/student-initials.test.ts
git commit -m "Teaching: initials rules for class lists"
```

---

### Task 2: The server keeps ids and initials on the class list

**Files:**
- Modify: `netlify/functions/class.mjs:12-25`
- Test: `tests/unit/classroom-tools.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/classroom-tools.test.js`:

```js
test('class lists keep and fill in student ids and initials', () => {
  const out = cleanClassStudents([
    { name: 'Bob Brown' },
    { name: 'Ben Bates', initials: 'bb' },
    { name: 'Tom Tills', id: 'st_tom', initials: 'TT' },
    { name: 'Ava Moss', id: '../bad', initials: 'not valid!' }
  ]);
  assert.deepEqual(out.map(s => s.initials), ['BB2', 'BB', 'TT', 'AM']);
  assert.equal(out[2].id, 'st_tom');
  assert.match(out[0].id, /^st_[a-z0-9]+$/);
  assert.match(out[3].id, /^st_[a-z0-9]+$/, 'an unsafe id is replaced');
  assert.deepEqual(cleanClassStudents(out), out, 'saving again changes nothing');
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/classroom-tools.test.js`
Expected: FAIL, because `initials` is undefined.

- [ ] **Step 3: Implement**

In `netlify/functions/class.mjs`, add the import and change the loop body and the return:

```js
import { assignInitials } from './_shared/student-initials.mjs';
```

```js
/**
 * Tidy a class list before it is stored: names trimmed and capped, blanks and
 * repeats dropped, and every student given a lasting id and unique initials.
 * The list is teacher-only; published class pages never copy it.
 */
export function cleanClassStudents(value) {
  if (!Array.isArray(value)) throw new Error('students must be a list');
  const seen = new Set();
  const out = [];
  for (const row of value) {
    const name = typeof row?.name === 'string' ? row.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      skip_picker: row.skip_picker === true,
      ...(typeof row.id === 'string' ? { id: row.id } : {}),
      ...(typeof row.initials === 'string' ? { initials: row.initials } : {})
    });
    if (out.length >= MAX_CLASS_STUDENTS) break;
  }
  return assignInitials(out);
}
```

(`assignInitials` replaces an id that doesn't match `STUDENT_ID_PATTERN` and normalises or re-derives bad initials, so nothing unsafe is stored.)

- [ ] **Step 4: Run the whole file and check it passes**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/classroom-tools.test.js`
Expected: the new test passes. If the existing `cleanClassStudents` assertion near line 42 uses `deepEqual` on `{ name, skip_picker }`, it now fails because of the extra fields. Change those expectations to compare `out.map(({ name, skip_picker }) => ({ name, skip_picker }))`, so the test still checks trimming and de-duplication, then rerun. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/class.mjs tests/unit/classroom-tools.test.js
git commit -m "Teaching: class lists store student ids and initials"
```

---

### Task 3: Claims store and the teacher claims endpoint

**Files:**
- Create: `netlify/functions/_shared/class-claims.mjs`
- Create: `netlify/functions/class-claims.mjs`
- Test: `tests/unit/class-claims.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/class-claims.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimFor, claimInitials, classClaimsAction, listClaims, loadRoster, releaseClaim } from '../../netlify/functions/_shared/class-claims.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const cls = (students) => ({ id: 'class1', type: 'class', title: '9 English', students });
const store = () => storeFixture([['classes/class1', cls([{ name: 'Bob Brown' }, { name: 'Tom Tills' }])]]);
const token = n => n.toString(16).repeat(48).slice(0, 48);

test('a roster fills in ids and initials, and a missing or bad class is null', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  assert.deepEqual(roster.students.map(x => x.initials), ['BB', 'TT']);
  assert.equal(await loadRoster(s, 'nope'), null);
  assert.equal(await loadRoster(s, '../x'), null);
});

test('claiming: on the list, once per device, never someone else’s', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), ' b.b ');
  assert.equal(bob.initials, 'BB');
  assert.equal((await claimFor(s, roster, token(1))).initials, 'BB');
  assert.equal(await claimFor(s, roster, token(2)), null);

  await assert.rejects(claimInitials(s, roster, token(2), 'BB'), /BB is already taken\. See your teacher\./);
  await assert.rejects(claimInitials(s, roster, token(2), 'XQ'), /XQ isn’t in this class\. Check with your teacher\./);
  await assert.rejects(claimInitials(s, roster, 'short', 'TT'), /can’t remember you/);

  const again = await claimInitials(s, roster, token(1), 'TT');
  assert.equal(again.initials, 'BB', 'a device that holds initials keeps them');
});

test('releasing frees the initials for a new device and drops the old one', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), 'BB');
  assert.deepEqual(Object.keys(await listClaims(s, 'class1')), [bob.id]);
  await releaseClaim(s, 'class1', bob.id);
  assert.deepEqual(await listClaims(s, 'class1'), {});
  assert.equal(await claimFor(s, roster, token(1)), null);
  assert.equal((await claimInitials(s, roster, token(2), 'BB')).id, bob.id);
});

test('teacher actions list and release, and refuse a missing class or unknown action', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), 'BB');
  const listed = await classClaimsAction(s, 'class1', { action: 'list' });
  assert.ok(listed.claims[bob.id]);
  const after = await classClaimsAction(s, 'class1', { action: 'release', student_id: bob.id });
  assert.deepEqual(after.claims, {});
  await assert.rejects(classClaimsAction(s, 'nope', { action: 'list' }), /Class not found/);
  await assert.rejects(classClaimsAction(s, 'class1', { action: 'wipe' }), /Unknown action/);
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/class-claims.test.js`
Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Write the claims module**

`netlify/functions/_shared/class-claims.mjs`:

```js
/**
 * Who is answering a quiz. A student claims their initials from the class list
 * once, on their own device, and that device keeps them for every quiz in the
 * class until the teacher releases them.
 *
 *   class-claims/{class}/students/{student}   { device, claimed_at }  create-only, the truth
 *   class-claims/{class}/devices/{device}     { student_id, claimed_at }  lookup from a device
 *
 * `device` is a hash of a class-scoped token (deviceHash), never the token.
 */
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { classKey, deleteKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { deviceHash, read, reject, validToken } from './question-drop.mjs';
import { assignInitials, normaliseInitials, STUDENT_ID_PATTERN } from './student-initials.mjs';

const keys = (classId) => ({
  student: (id) => `class-claims/${classId}/students/${id}`,
  students: `class-claims/${classId}/students/`,
  device: (device) => `class-claims/${classId}/devices/${device}`
});

/** The class and its list with ids and initials filled in. Null when the class is gone. */
export async function loadRoster(store, classId) {
  if (!isSafeId(classId)) return null;
  const cls = await read(store, classKey(classId));
  if (!cls || isDeletedRecord(cls)) return null;
  return { cls, students: assignInitials(Array.isArray(cls.students) ? cls.students : []) };
}

/** The student this device holds in the class, or null. */
export async function claimFor(store, roster, token) {
  if (!validToken(token)) return null;
  const k = keys(roster.cls.id);
  const device = deviceHash(token);
  const mine = await read(store, k.device(device));
  const student = mine && roster.students.find((s) => s.id === mine.student_id);
  if (!student) return null;
  // A release removes the student's record; a lookup left behind means nothing.
  const held = await read(store, k.student(student.id));
  return held?.device === device ? student : null;
}

export async function claimInitials(store, roster, token, typed) {
  if (!validToken(token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const existing = await claimFor(store, roster, token);
  if (existing) return existing;
  const initials = normaliseInitials(typed);
  const student = initials ? roster.students.find((s) => s.initials === initials) : null;
  if (!student) reject(404, 'not_in_class', `${initials || 'Those initials'} isn’t in this class. Check with your teacher.`);
  const k = keys(roster.cls.id);
  const device = deviceHash(token);
  const claimed_at = new Date().toISOString();
  const written = await store.setJSON(k.student(student.id), { device, claimed_at }, { onlyIfNew: true });
  if (written?.modified === false) {
    const held = await read(store, k.student(student.id));
    if (held?.device !== device) reject(409, 'taken', `${initials} is already taken. See your teacher.`);
  }
  await store.setJSON(k.device(device), { student_id: student.id, claimed_at });
  return student;
}

/** Teacher: when each student's initials were claimed, by student id. */
export async function listClaims(store, classId) {
  const found = await listBlobKeys(store, keys(classId).students);
  const out = {};
  await Promise.all(
    found.map(async (key) => {
      const held = await read(store, key);
      if (held) out[key.slice(key.lastIndexOf('/') + 1)] = held.claimed_at;
    })
  );
  return out;
}

export async function releaseClaim(store, classId, studentId) {
  const k = keys(classId);
  const held = await read(store, k.student(studentId));
  if (!held) return;
  await deleteKey(store, k.student(studentId));
  await deleteKey(store, k.device(held.device));
}

export async function classClaimsAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!(await loadRoster(store, classId))) reject(404, 'not_found', 'Class not found.');
  const action = body.action ?? 'list';
  if (!['list', 'release'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'release') {
    if (typeof body.student_id !== 'string' || !STUDENT_ID_PATTERN.test(body.student_id)) reject(400, 'bad_request', 'Unknown student.');
    await releaseClaim(store, classId, body.student_id);
  }
  return { claims: await listClaims(store, classId) };
}
```

Before writing it, check that `listBlobKeys` in `netlify/functions/_shared/blobs-list.mjs` takes `(store, prefix)` and returns an array of keys. `quiz.mjs:231` calls it that way. Also check that `read` in `question-drop.mjs` returns `null` for a missing key.

- [ ] **Step 4: Write the teacher endpoint**

`netlify/functions/class-claims.mjs` (same pattern as `netlify/functions/quiz.mjs`):

```js
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { classClaimsAction } from './_shared/class-claims.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/classes/:id/claims' };
/** Teacher only: who has claimed their quiz initials in a class, and releasing a claim. */
export function createClassClaimsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/classes\/([^/]+)\/claims$/);
    try {
      const result = await classClaimsAction(store, match?.[1], await request.json());
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createClassClaimsHandler();
```

- [ ] **Step 5: Run the tests and check they pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/class-claims.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/class-claims.mjs netlify/functions/class-claims.mjs tests/unit/class-claims.test.js
git commit -m "Teaching: claim quiz initials per class, teacher can release"
```

---

### Task 4: The quiz server knows who is answering

**Files:**
- Modify: `netlify/functions/_shared/quiz.mjs` (header comment, `quizAction` at 243-415, `liveStudent` at 616-658)
- Modify: `tests/unit/quiz.test.js`

- [ ] **Step 1: Give the existing tests a class context**

Every existing test takes a quiz the old way, with no class. The spec now refuses that, so give them an anonymous class (one with no list). In `tests/unit/quiz.test.js`:

1. Change the import line to:
```js
import { prepareQuizPublish, storeQuizKey, quizAction as rawQuizAction, quizTeacherAction } from '../../netlify/functions/_shared/quiz.mjs';
```
2. Below the imports, add:
```js
// Students take quizzes from a class page. `class0` has no list, so it stays anonymous.
const quizAction = (store, lessonId, body) => rawQuizAction(store, lessonId, { class_id: 'class0', ...body });
```
3. In `storeFixture`, seed the class after `const data = ...`:
```js
  if (!data.has('classes/class0')) data.set('classes/class0', { id: 'class0', type: 'class', title: 'Open class', students: [] });
```
4. Add `async delete(key) { data.delete(key); },` to the fixture's methods.

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz.test.js`
Expected: PASS for every existing test (nothing has changed yet). The public endpoint test near line 281 posts through `createPublishedQuizHandler`. If it posts a real action without `class_id` and later fails with `need_class`, add `class_id: 'class0'` to its body.

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/quiz.test.js`:

```js
const withClass = (store) => {
  store.data.set('classes/class1', { id: 'class1', type: 'class', title: '9 English', students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }] });
  return store;
};
const bobDevice = { token: token(1), class_id: 'class1', class_token: token(3) };
const tomDevice = { token: token(2), class_id: 'class1', class_token: token(4) };

test('a quiz only takes answers from a class page', async () => {
  const store = baseStore();
  await publishQuiz(store);
  const plain = await rawQuizAction(store, 'quiz1', { token: token(1) });
  assert.deepEqual(plain.identity, { need: 'class', initials: null });
  await assert.rejects(rawQuizAction(store, 'quiz1', { token: token(1), action: 'start' }), /Open this quiz from your class page/);
  await assert.rejects(rawQuizAction(store, 'quiz1', { token: token(1), class_id: 'gone', action: 'status' }), /Open this quiz from your class page/);
});

test('initials: claim once, then start; someone else’s initials are refused', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  const before = await rawQuizAction(store, 'quiz1', bobDevice);
  assert.deepEqual(before.identity, { need: 'initials', initials: null });
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' }), /Type your initials first/);

  const claimed = await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'bb' });
  assert.deepEqual(claimed.identity, { need: null, initials: 'BB' });
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'BB' }), /BB is already taken/);

  const started = await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  assert.ok(started.current);
  const startKey = [...store.data.keys()].find(k => k.startsWith('quiz/quiz1/attempts/'));
  const start = store.data.get(startKey);
  assert.equal(start.class_id, 'class1');
  assert.match(start.student_id, /^st_/);
});

test('attempts follow the student to a new device after a release', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });

  const { releaseClaim, loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const roster = await loadRoster(store, 'class1');
  await releaseClaim(store, 'class1', roster.students[0].id);

  const newDevice = { token: token(5), class_id: 'class1', class_token: token(6) };
  const moved = await rawQuizAction(store, 'quiz1', { ...newDevice, action: 'claim', initials: 'BB' });
  assert.equal(moved.attempts_used, 1, 'the earlier go still counts');
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...newDevice, action: 'start' }), /already done this quiz/);
});

test('teacher results label attempts with initials and name', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });
  await quizAction(store, 'quiz1', { token: token(7), action: 'start' });
  await quizAction(store, 'quiz1', { token: token(7), action: 'submit', responses: {} });

  const results = await quizTeacherAction(store, 'quiz1', { action: 'results' });
  const labels = results.attempts.map(a => a.student);
  assert.deepEqual(labels.filter(Boolean), [{ initials: 'BB', name: 'Bob Brown' }]);
  assert.equal(labels.filter(l => l === null).length, 1, 'the anonymous attempt has no label');

  const bobs = results.attempts.find(a => a.student);
  const detail = await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: bobs.id });
  assert.deepEqual(detail.attempt.student, { initials: 'BB', name: 'Bob Brown' });

  const cls = store.data.get('classes/class1');
  store.data.set('classes/class1', { ...cls, students: [{ name: 'Tom Tills' }] });
  const removed = await quizTeacherAction(store, 'quiz1', { action: 'results' });
  assert.deepEqual(removed.attempts.find(a => a.student).student, { initials: null, name: null });
});

test('live mode needs claimed initials to join', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  const live = await quizTeacherAction(store, 'quiz1', { action: 'live_start' });
  const code = live.live.code;
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'live_join', code }), /Type your initials first/);
  await rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'TT' });
  const joined = await rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'live_join', code });
  assert.equal(joined.live.joined, true);
  const player = [...store.data.entries()].find(([k]) => k.includes('/players/'))[1];
  assert.match(player.student_id, /^st_/);
});
```

- [ ] **Step 3: Run them and check they fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz.test.js`
Expected: the 5 new tests FAIL (`identity` undefined, `claim` is an unknown action).

- [ ] **Step 4: Implement identity in `quiz.mjs`**

1. Add to the header comment, after the `live/.../answers` line:
```
 *
 * Students answer from a class page. Once a class has a list, a student
 * claims their initials (class-claims.mjs) and their attempts are kept under
 * the student, not the device, so they follow them to a new device after the
 * teacher releases the old one. A class with no list stays anonymous.
```
and change the last header paragraph to "Students have no accounts. A device keeps a random token and the server keeps a hash of it. Attempts are counted by that hash, or by the student once initials are claimed."

2. Add the import:
```js
import { claimFor, claimInitials, loadRoster } from './class-claims.mjs';
```

3. Add, above `export async function quizAction`:
```js
/**
 * Works out who is answering. With no class the quiz can be looked at but not
 * answered. A class with no list stays anonymous. Otherwise the device must
 * hold claimed initials, and `claim` is how it gets them.
 */
async function identify(store, body, action) {
  if (!body.class_id) return { classId: null, student: null, need: 'class' };
  const roster = await loadRoster(store, body.class_id);
  if (!roster) reject(404, 'need_class', 'Open this quiz from your class page.');
  if (!roster.students.length) return { classId: roster.cls.id, student: null, need: null };
  const student = action === 'claim'
    ? await claimInitials(store, roster, body.class_token, body.initials)
    : await claimFor(store, roster, body.class_token);
  return { classId: roster.cls.id, student, need: student ? null : 'initials' };
}

function needIdentity(who) {
  if (who.need === 'class') reject(403, 'need_class', 'Open this quiz from your class page.');
  if (who.need === 'initials') reject(403, 'need_initials', 'Type your initials first.');
}

/** Whose attempts these are: the student once known, else this device. Same 24-hex shape either way. */
const ownerOf = (who, token) => (who.student ? deviceHash(`student:${who.classId}:${who.student.id}`) : deviceHash(token));
const identityOf = (who) => ({ need: who.need, initials: who.student?.initials ?? null });
const studentFields = (who) => (who.classId ? { class_id: who.classId, ...(who.student ? { student_id: who.student.id } : {}) } : {});
```

4. In `quizAction`:
   - Change the allowed actions: `if (!['status', 'claim', 'start', 'hint', 'check', 'submit'].includes(action)) ...`
   - Right after `const { record, settings, k } = await loadQuiz(store, lessonId);` add:
     ```js
     const who = await identify(store, body, action);
     if (!['status', 'claim'].includes(action)) needIdentity(who);
     ```
   - Add `identity: identityOf(who),` to the `shared` object.
   - Replace the token block (lines 261-266) with:
     ```js
     if (!who.student) {
       if (!body.token) {
         if (!['status', 'claim'].includes(action)) reject(400, 'no_device', 'This browser needs to allow saving to take the quiz.');
         return { ...shared, attempts_used: 0, current: null, results: [] };
       }
       if (!validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to take the quiz.');
     }
     const device = ownerOf(who, body.token);
     ```
   - In the `start` object, add `...studentFields(who),` after `deadline: ...`.

5. In `liveStudent`:
   - After `const { record, k } = await loadQuiz(store, lessonId);` add `const who = await identify(store, body, action);`
   - Replace the token lines (623-625) with:
     ```js
     if (!who.student && !body.token) return { live: { ...out, joined: false } };
     if (!who.student && !validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to join.');
     const device = ownerOf(who, body.token);
     ```
   - In `live_join`, check the code first, then add `needIdentity(who);`, and write the player as:
     ```js
     await store.setJSON(k.player(live.session, device), { joined_at: new Date().toISOString(), ...studentFields(who) }, { onlyIfNew: true });
     ```
   - In `live_answer`, add `needIdentity(who);` as its first line.

- [ ] **Step 5: Add labels to teacher results**

In `quiz.mjs`, above `export async function quizTeacherAction`:
```js
/** The teacher's label for an attempt: initials and name, or null when it was anonymous. */
async function studentLabel(store, start, rosters) {
  if (!start?.class_id || !start.student_id) return null;
  if (!rosters.has(start.class_id)) rosters.set(start.class_id, loadRoster(store, start.class_id));
  const found = (await rosters.get(start.class_id))?.students.find((s) => s.id === start.student_id);
  return found ? { initials: found.initials, name: found.name } : { initials: null, name: null };
}
```
In `quizTeacherAction`, after `const { record, settings, k } = loaded;` add `const rosters = new Map();`. Then:
- In the `attempt`/`mark` reply, add `student: await studentLabel(store, start, rosters),` after `device: device.slice(0, 6),`.
- In the results loop's `rows.push({...})`, add `student: await studentLabel(store, start, rosters),` after `device: device.slice(0, 6),`.

- [ ] **Step 6: Run the tests and check they pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz.test.js`
Expected: PASS for all tests, old and new.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/quiz.mjs tests/unit/quiz.test.js
git commit -m "Teaching quiz: answers come from a class page under claimed initials"
```

---

### Task 5: The teacher panel shows "BB · Bob Brown"

**Files:**
- Modify: `apps/teaching/src/quiz/teacher-panel.ts:55, 537-546, 590-602`

- [ ] **Step 1: Types**

Line 55, add `student: StudentLabel | null` to `AttemptSummary`, and the same to `AttemptDetail` (line 590). Above `type AttemptSummary`, add:
```ts
/** Initials and name from the class list; both null when the student was removed. */
type StudentLabel = { initials: string | null; name: string | null };
```

- [ ] **Step 2: A labelling helper**

Next to `deviceNames` (line 839), add:
```ts
/** "BB · Bob Brown" for a known student, else the anonymous "Student A" style label. */
function whoLabel(a: { device: string; student: StudentLabel | null }, names: Map<string, string>): string {
  if (a.student) return a.student.initials ? `${a.student.initials} · ${a.student.name}` : 'Removed student';
  return names.get(a.device) ?? 'A student';
}
```

- [ ] **Step 3: Use it**

- Line 538: `const names = deviceNames(r.attempts.filter((a) => !a.student).map((a) => a.device));`
- Line 545: `el('span', 'qz-attempt__who', `${whoLabel(a, names)}${a.n > 0 ? ` · go ${a.n + 1}` : ''}`),`
- In `attemptView`, add the label to the bar, after the back button and before the score span:
```ts
      el('span', 'qz-attempt__who', a.student ? whoLabel(a, new Map()) : 'Anonymous attempt'),
```

- [ ] **Step 4: Type-check and run the existing panel tests**

Run: `cd apps/teaching && npx tsc --noEmit -p . && npx vitest run tests/unit -t "quiz"`
Expected: no type errors. Quiz tests pass, and tests that build `AttemptSummary` fixtures may need `student: null` added. Add it wherever the compiler or a test complains.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/quiz/teacher-panel.ts apps/teaching/tests/unit
git commit -m "Teaching quiz: results name the student"
```

---

### Task 6: Initials, claims and Release on the class page

**Files:**
- Modify: `apps/teaching/src/blocks/classroom-tools/logic.ts:263-276`
- Modify: `apps/teaching/src/teacher/sections/class-students.ts`
- Modify: `apps/teaching/src/blocks/classroom-tools/classroom-tools.css`
- Modify: `apps/teaching/tests/unit/classroom-tools.test.ts:312-322`
- Test: `apps/teaching/tests/unit/class-students-initials.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/teaching/tests/unit/class-students-initials.test.ts`. Copy the `classRecord` helper from `apps/teaching/tests/unit/classroom-tools.test.ts` (search for `function classRecord` or `const classRecord`) to the top of this file:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ClassSchema, type Class, type ClassStudent } from '@/schemas';
import { parseStudentList } from '@/blocks/classroom-tools/logic';
import { mountClassStudents } from '@/teacher/sections/class-students';
import { assignInitials } from '@/schemas/student-initials';

// classRecord helper copied from classroom-tools.test.ts goes here.

const fakeClaims = (initial: Record<string, string> = {}) => {
  let claims = { ...initial };
  return {
    list: vi.fn(async () => claims),
    release: vi.fn(async (_c: string, id: string) => {
      const { [id]: _gone, ...rest } = claims;
      claims = rest;
      return claims;
    })
  };
};

describe('class list initials', () => {
  it('parseStudentList keeps a student’s id and initials when the list is pasted again', () => {
    const before = assignInitials([{ name: 'Bob Brown', skip_picker: false, initials: 'BOB' }]);
    const after = parseStudentList('Bob Brown\nTom Tills', before);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual({ name: 'Tom Tills', skip_picker: false });
  });

  it('shows initials, saves an edit, and refuses a duplicate', async () => {
    const cls = classRecord('c1', '9ENG2', [{ name: 'Bob Brown' }, { name: 'Tom Tills' }]);
    const save = vi.fn(async (_id: string, _s: ClassStudent[]) => undefined);
    const host = document.createElement('div');
    mountClassStudents(host, cls, { save, claims: fakeClaims() });
    const inputs = () => [...host.querySelectorAll<HTMLInputElement>('.class-students__initials')];
    expect(inputs().map((i) => i.value)).toEqual(['BB', 'TT']);

    inputs()[1]!.value = 'bb';
    inputs()[1]!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(host.querySelector('.class-students__status')?.textContent).toBe('BB is already used by Bob Brown.'));
    expect(save).not.toHaveBeenCalled();
    expect(inputs()[1]!.value).toBe('TT');

    inputs()[1]!.value = 'tom';
    inputs()[1]!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![1][1]).toMatchObject({ name: 'Tom Tills', initials: 'TOM' });
  });

  it('shows who has claimed their initials and releases a claim', async () => {
    const cls = classRecord('c1', '9ENG2', [{ name: 'Bob Brown' }, { name: 'Tom Tills' }]);
    const [bob] = assignInitials(cls.students ?? []);
    const claims = fakeClaims({ [bob!.id]: '2026-10-22T01:00:00.000Z' });
    const host = document.createElement('div');
    mountClassStudents(host, cls, { save: async () => undefined, claims });
    await vi.waitFor(() => expect(host.querySelectorAll('.class-students__claim.is-claimed').length).toBe(1));
    host.querySelector<HTMLButtonElement>('.class-students__release')!.click();
    await vi.waitFor(() => expect(claims.release).toHaveBeenCalledWith('c1', bob!.id));
    await vi.waitFor(() => expect(host.querySelectorAll('.class-students__claim.is-claimed').length).toBe(0));
    expect(host.querySelector('.class-students__status')?.textContent).toBe('BB can be claimed again.');
  });
});
```

If `classRecord` already runs `ClassSchema.parse`, the `ClassSchema` and `Class` imports are needed. Otherwise, drop whichever the copied helper doesn't use, so lint stays clean.

- [ ] **Step 2: Run it and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/class-students-initials.test.ts`
Expected: FAIL, because there are no `.class-students__initials` inputs and the `claims` option doesn't exist.

- [ ] **Step 3: `parseStudentList` carries `id` and `initials` over**

Replace the function in `apps/teaching/src/blocks/classroom-tools/logic.ts`:
```ts
export function parseStudentList(text: string, previous: readonly ClassStudent[] = [], max = 60): ClassStudent[] {
  // A student already on the list keeps their skip, id and initials when it is pasted again.
  const before = new Map(previous.map((s) => [s.name.trim().toLowerCase(), s]));
  const seen = new Set<string>();
  const out: ClassStudent[] = [];
  for (const raw of text.split(/[\n\r\t]+/)) {
    const name = raw.replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const old = before.get(key);
    out.push({
      name,
      skip_picker: old?.skip_picker ?? false,
      ...(old?.id ? { id: old.id } : {}),
      ...(old?.initials ? { initials: old.initials } : {})
    });
    if (out.length >= max) break;
  }
  return out;
}
```

- [ ] **Step 4: The Students section**

In `apps/teaching/src/teacher/sections/class-students.ts`:

1. Imports, added beside the existing ones:
```ts
import { apiPost } from '@/api/client';
import { assignInitials, initialsProblems, normaliseInitials } from '@/schemas/student-initials';
```

2. The file comment: add a paragraph "Each student has initials for quizzes. A student claims theirs once on their own device. The badge shows who has, and Release lets a student claim again on a new device."

3. `Options` gains a test seam:
```ts
  /** Test seam. Defaults to POST /api/classes/:id/claims. */
  claims?: {
    list: (classId: string) => Promise<Record<string, string>>;
    release: (classId: string, studentId: string) => Promise<Record<string, string>>;
  };
```

4. Inside `mountClassStudents`, replace the `let students = ...` line and add the claims state:
```ts
  const claimsApi = options.claims ?? {
    list: async (classId: string) => (await apiPost<{ claims: Record<string, string> }>(`/api/classes/${encodeURIComponent(classId)}/claims`, { action: 'list' })).claims,
    release: async (classId: string, studentId: string) =>
      (await apiPost<{ claims: Record<string, string> }>(`/api/classes/${encodeURIComponent(classId)}/claims`, { action: 'release', student_id: studentId })).claims
  };
  let students: ClassStudent[] = assignInitials((cls.students ?? []).map((s) => ({ ...s, skip_picker: Boolean(s.skip_picker) })));
  let claims: Record<string, string> | null = null;
```

5. Change the intro text to: `'The classroom name picker, groups and quiz initials use this list. Use the name each student goes by. Only you see this page.'`. Change the `skipHead` text to `'Initials and picker'`, and add a sentence to `skipHint`: `' Students type their initials to take a quiz from the class page.'`

6. In `paint()`, inside the row map, after `const name = ...`, build the initials input and claim badge, then append them:
```ts
        const initials = el('input', 'class-students__initials');
        initials.value = student.initials ?? '';
        initials.maxLength = 5;
        initials.autocomplete = 'off';
        initials.setAttribute('aria-label', `Quiz initials for ${student.name}`);
        initials.addEventListener('change', () => {
          const value = normaliseInitials(initials.value);
          const next = students.map((s, j) => (j === i ? { ...s, initials: value } : s));
          const problem = initialsProblems(next).get(i);
          if (problem) {
            initials.value = student.initials ?? '';
            say(problem, 'error');
            return;
          }
          if (value === student.initials) {
            initials.value = value;
            return;
          }
          void persist(next, `${student.name} is now ${value}.`);
        });
        const claimedAt = student.id ? claims?.[student.id] : undefined;
        const claim = el('span', `class-students__claim${claimedAt ? ' is-claimed' : ''}`, claims === null ? '' : claimedAt ? 'Claimed' : 'Not claimed');
        item.append(name, initials, claim);
        if (claimedAt && student.id) {
          const release = el('button', 'btn btn--ghost class-students__release', 'Release');
          release.type = 'button';
          release.setAttribute('aria-label', `Release ${student.initials} so ${student.name} can claim it again`);
          const studentId = student.id;
          release.addEventListener('click', async () => {
            release.disabled = true;
            try {
              claims = await claimsApi.release(cls.id, studentId);
              say(`${student.initials} can be claimed again.`);
            } catch {
              say('Not released. Check your connection and try again.', 'error');
            }
            paint();
          });
          item.append(release);
        }
        item.append(label);
```
Then remove the old `item.append(name, label);`, so the order is name, initials, claim badge, optional Release, skip toggle.

7. In the `saveBtn` handler, assign ids and initials before persisting: `const next = assignInitials(parseStudentList(area.value, students, MAX_CLASS_STUDENTS));`

8. At the end, before the final `paint();`, load claims without blocking:
```ts
  void claimsApi
    .list(cls.id)
    .then((found) => {
      claims = found;
      paint();
    })
    .catch(() => {
      // No claims to show (offline, or the class isn't saved yet). The list still works.
    });
```

- [ ] **Step 5: Styles**

Append to `apps/teaching/src/blocks/classroom-tools/classroom-tools.css`. Check the existing `.class-students__row` rules and use the same tokens: open the file and reuse the variables it already uses for borders, muted text and the success colour, rather than inventing new ones.
```css
.class-students__initials {
  width: 4.5rem;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-subtle, currentColor);
  border-radius: 6px;
  background: transparent;
  color: inherit;
}
.class-students__claim {
  font-size: 0.8125rem;
  color: var(--text-muted, inherit);
  min-width: 5.5rem;
}
.class-students__claim.is-claimed { color: var(--success, inherit); }
@media (max-width: 480px) {
  .class-students__row { flex-wrap: wrap; row-gap: 0.25rem; }
}
```
Replace each `var(--…, fallback)` with the exact token names the file already uses. If the row isn't flex, match its layout.

- [ ] **Step 6: Update the existing save expectation**

In `apps/teaching/tests/unit/classroom-tools.test.ts` (around line 312), the save now carries ids and initials:
```ts
    expect(save.mock.calls[0]![1]).toMatchObject([
      { name: 'Ava', skip_picker: false, initials: 'A' },
      { name: 'Noah', skip_picker: false, initials: 'N' },
      { name: 'Mia', skip_picker: false, initials: 'M' }
    ]);
```
and line 322: `expect(save.mock.calls[1][1][1]).toMatchObject({ name: 'Noah', skip_picker: true });`

- [ ] **Step 7: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/class-students-initials.test.ts tests/unit/classroom-tools.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/teaching/src/blocks/classroom-tools/logic.ts apps/teaching/src/teacher/sections/class-students.ts apps/teaching/src/blocks/classroom-tools/classroom-tools.css apps/teaching/tests/unit/class-students-initials.test.ts apps/teaching/tests/unit/classroom-tools.test.ts
git commit -m "Teaching class page: quiz initials, claims and Release"
```

---

### Task 7: The student quiz asks for initials

**Files:**
- Modify: `apps/teaching/src/quiz/student-quiz.ts`
- Modify: `apps/teaching/src/student/lesson-view.ts:136`
- Modify: `apps/teaching/src/quiz/quiz.css`

- [ ] **Step 1: Options and the class token**

In `student-quiz.ts`:
- Add `identity?: { need: 'class' | 'initials' | null; initials: string | null };` to the `Status` type.
- Change the signature to `export function mountStudentQuiz(lesson: PublishedLesson, options: { classId?: string } = {}): HTMLElement {`
- After `const token = deviceToken(`quiz:${lessonId}`);`, add:
```ts
  // Initials are claimed per class, so the class keeps its own token for this device.
  const classToken = options.classId ? deviceToken(`class:${options.classId}`) : null;
  const classFields = options.classId ? { class_id: options.classId, ...(classToken ? { class_token: classToken } : {}) } : {};
```
- Add `...classFields` to all four `apiPost` bodies: line 108 `{ action, ...(token ? { token } : {}), ...classFields, ...extra }`, and the `live_status`, `live_join` and `live_answer` calls (`{ action: 'live_join', token, ...classFields, code: input.value }` and so on).
- Add a line to the file's top comment: "A quiz takes answers only from its class page. The first time, the student types their initials from the class list, and this device keeps them for every quiz in that class."

- [ ] **Step 2: Paint the identity states**

In `paint()`, replace the `if (!token) {...}` block with:
```ts
    if (!token || (options.classId && !classToken)) {
      body.replaceChildren(panel('This browser can’t remember you, so you can’t take the quiz here.', 'Use your usual browser, in a normal (not private) window.'));
      return;
    }
    if (status.identity?.need === 'class') {
      body.replaceChildren(panel('Open this quiz from your class page.', 'Your class page has the link that knows who you are.'));
      return;
    }
    if (status.identity?.need === 'initials') {
      body.replaceChildren(initialsView());
      return;
    }
```

- [ ] **Step 3: The initials box and "Quizzing as"**

Add after `landingView`:
```ts
  function initialsView(): HTMLElement {
    const box = el('div', 'qz-panel qz-initials');
    box.append(
      el('p', 'qz-panel__title', 'Type your initials'),
      el('p', 'qz-note', 'Use the initials your teacher gave you, like BB. This device keeps them for every quiz in this class.')
    );
    const input = el('input', 'qz-input qz-initials__input');
    input.autocomplete = 'off';
    input.maxLength = 5;
    input.placeholder = 'BB';
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('aria-label', 'Your initials');
    const go = button('Continue', 'primary', async function () {
      this.disabled = true;
      const next = await call('claim', { initials: input.value });
      this.disabled = false;
      if (next && !next.identity?.need) paint();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go.click();
    });
    const row = el('div', 'qz-actions');
    row.append(input, go);
    box.append(row);
    return box;
  }
```
In `landingView`, after `const wrap = el('div', 'qz-landing');`, add:
```ts
    if (s.identity?.initials) wrap.append(el('p', 'qz-note qz-who', `Quizzing as ${s.identity.initials}`));
```

- [ ] **Step 4: Styles**

Append to `apps/teaching/src/quiz/quiz.css`, matching the existing `.qz-code-input` rule (copy its border, radius and padding tokens):
```css
.qz-initials__input {
  width: 6rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
}
.qz-who { margin: 0 0 0.5rem; font-weight: 600; }
```

- [ ] **Step 5: Pass the class from the class lesson page**

`apps/teaching/src/student/lesson-view.ts:136`:
```ts
  if (isQuiz) content.append(mountStudentQuiz(lesson, { classId: extras?.cls?.id }));
```
Leave `teacher/lesson-display.ts` alone. With no class, it shows "Open this quiz from your class page."

- [ ] **Step 6: Type-check and run the client tests**

Run: `cd apps/teaching && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/quiz/student-quiz.ts apps/teaching/src/quiz/quiz.css apps/teaching/src/student/lesson-view.ts
git commit -m "Teaching quiz: students type their initials from the class page"
```

---

### Task 8: Local dev wiring, a check in the browser, and the PR

**Files:**
- Modify: `apps/teaching/scripts/mock-api.ts` (imports near line 98, `handleQuiz` around line 3558, route list around line 3648)

- [ ] **Step 1: Route the claims endpoint in the mock**

- Import: `import { createClassClaimsHandler } from '../../../netlify/functions/class-claims.mjs';`
- In `handleQuiz`'s handler chain, add first: `const handler = /^\/api\/classes\/[^/]+\/claims$/.test(path) ? createClassClaimsHandler(deps) : /^\/api\/lessons\/[^/]+\/hinge\//.test(path) ...` (keep the rest of the chain as it is).
- In the route condition list (around line 3649), add `/^\/api\/classes\/[^/]+\/claims$/.test(path) ||`. This sits before the `CLASS_PATCH_RE` handling, so the claims path never reaches the class PATCH.

- [ ] **Step 2: Run everything**

Run: `npm run test:unit && (cd apps/teaching && npx vitest run tests/unit && npx tsc --noEmit -p .)`
Expected: all pass.

- [ ] **Step 3: Check it in the browser**

Start the Teaching dev server with `preview_start` (find its name in `.claude/launch.json`; add a config if there isn't one), signed in to the mock.
1. Open a class, then Students. Paste "Bob Brown", "Tom Tills" and "Ben Bates", and save. Check the initials show as BB, TT, BB2.
2. Publish a quiz lesson in that class's unit. Open it from the student class page (`/s/classes/<id>/lessons/<lesson>`). Check that the initials box shows. Type `xq` and check you see "XQ isn’t in this class…". Type `bb`, check "Quizzing as BB", then start and submit.
3. Open a second browser tab with fresh storage (or clear `quiz-device:class:<id>` in localStorage). Type `BB`, and check you see "BB is already taken…".
4. In the teacher view, check that the quiz Results show "BB · Bob Brown", and that the class Students section shows BB as Claimed with a Release button. Click Release and check that BB can be claimed in the second tab.
5. Open the plain link `/s/lessons/<lesson>` and check you see "Open this quiz from your class page."
6. Resize to 390px and check the Students rows and the initials box don't scroll sideways.
Take a screenshot of steps 2 and 4.

- [ ] **Step 4: Regenerate generated files and run the gate**

Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs && git status --short && npm run pre-pr-check`
Expected: generated files unchanged (or commit them if they changed), and `pre-pr-check` exits 0.

- [ ] **Step 5: Commit, push and open the PR**

```bash
git add -A
git commit -m "Teaching: route class claims in the mock API"
git push -u origin claude/quiz-initials
gh pr create --title "Teaching quiz: students answer under class-list initials" --body "$(cat <<'EOF'
Students take a quiz from their class page under initials from the class list (BB, TT; double-ups get BB2). One device owns each set of initials in a class until the teacher releases it, and the teacher's Results show "BB · Bob Brown" instead of "Student A".

- Class list: every student gets a lasting id and editable initials, with a claimed badge and Release button.
- Quiz server: plain lesson links can't take answers; attempts are kept per student so they follow a released student to a new device; a class with no list stays anonymous.
- Spec and plan: docs/superpowers/specs/2026-10-22-quiz-student-initials-design.md, docs/superpowers/plans/2026-10-22-quiz-student-initials.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Then enable auto-merge (merge commit), per `CLAUDE.md`.
