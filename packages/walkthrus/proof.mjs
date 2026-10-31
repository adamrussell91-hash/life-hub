// packages/walkthrus/proof.mjs
// Proof: for each tile (technique or fusion) and class, how the class scored in lessons where the
// teacher ran it, next to that class's lessons where no WalkThru was run. Pure numbers and counts.
//
//   lesson score   0–1, one per lesson and class (the endpoint works it out from quiz attempts)
//   ran            lessons with a `ran` rep of this tile for that class
//   partly         lessons with a `partly` rep (and no `ran`): shown, never averaged
//   none           that class's scored lessons with no ran or partly rep of ANY tile
//   diff           ran.mean − none.mean, or null when either side has no lessons
//   enough         at least MIN_LESSONS lessons on both sides
//
// A rep saved without a class (`class_id: null`, an unscheduled lesson) counts for every class
// that has a score for that lesson.

export const MIN_LESSONS = 4;

const round = (n) => Math.round(n * 10_000) / 10_000;
const mean = (xs) => (xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const counts = (rep) => rep && (rep.state === 'ran' || rep.state === 'partly');
const byDate = (a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || a.lesson_id.localeCompare(b.lesson_id);

function cleanScores(scores) {
  const seen = new Map();
  for (const s of Array.isArray(scores) ? scores : []) {
    if (!s || typeof s.lesson_id !== 'string' || typeof s.class_id !== 'string') continue;
    if (typeof s.score !== 'number' || !Number.isFinite(s.score)) continue;
    const key = `${s.lesson_id}~${s.class_id}`;
    if (seen.has(key)) continue;
    seen.set(key, { lesson_id: s.lesson_id, class_id: s.class_id, score: round(Math.min(1, Math.max(0, s.score))), date: typeof s.date === 'string' ? s.date : null });
  }
  return [...seen.values()];
}

/**
 * @param {{ scores: Array<{ lesson_id: string, class_id: string, score: number, date?: string | null }>, reps: Array<{ technique_id: string, lesson_id: string, class_id: string | null, state: string }> }} input
 * @returns {Array<object>} one row per tile and class, ranked: enough first by diff (largest first), then the rest
 */
export function computeProof({ scores, reps }) {
  const lessons = cleanScores(scores);
  // lesson → reps that count, for matching against each (lesson, class)
  const repsByLesson = new Map();
  for (const rep of Array.isArray(reps) ? reps : []) {
    if (!counts(rep) || typeof rep.technique_id !== 'string' || typeof rep.lesson_id !== 'string') continue;
    const list = repsByLesson.get(rep.lesson_id) ?? [];
    list.push(rep);
    repsByLesson.set(rep.lesson_id, list);
  }

  const none = new Map(); // class → lessons with no WalkThru run
  const tiles = new Map(); // `${tile}\u0000${class}` → { ran: [], partly: [] }
  for (const lesson of lessons) {
    const here = (repsByLesson.get(lesson.lesson_id) ?? []).filter((r) => r.class_id == null || r.class_id === lesson.class_id);
    if (!here.length) {
      const list = none.get(lesson.class_id) ?? [];
      list.push(lesson);
      none.set(lesson.class_id, list);
      continue;
    }
    const states = new Map();
    for (const rep of here) {
      // A class's own record beats a classless one; ran beats partly.
      const prev = states.get(rep.technique_id);
      if (!prev || (prev.class_id == null && rep.class_id != null) || (prev.class_id === rep.class_id && rep.state === 'ran')) states.set(rep.technique_id, rep);
    }
    for (const [tile, rep] of states) {
      const key = `${tile}\u0000${lesson.class_id}`;
      const slot = tiles.get(key) ?? { ran: [], partly: [] };
      slot[rep.state].push(lesson);
      tiles.set(key, slot);
    }
  }

  const rows = [];
  for (const [key, slot] of tiles) {
    const [tile_id, class_id] = key.split('\u0000');
    const without = none.get(class_id) ?? [];
    const ran = [...slot.ran].sort(byDate);
    const partly = [...slot.partly].sort(byDate);
    const ranMean = mean(ran.map((l) => l.score));
    const noneMean = mean(without.map((l) => l.score));
    rows.push({
      tile_id,
      class_id,
      ran: { n: ran.length, mean: ranMean, lessons: ran.map(({ lesson_id, score, date }) => ({ lesson_id, score, date })) },
      partly: { n: partly.length, lessons: partly.map(({ lesson_id, score, date }) => ({ lesson_id, score, date })) },
      none: { n: without.length, mean: noneMean },
      diff: ranMean !== null && noneMean !== null ? round(ranMean - noneMean) : null,
      enough: ran.length >= MIN_LESSONS && without.length >= MIN_LESSONS
    });
  }
  return rankProof(rows);
}

/** Enough lessons first, largest difference first; then the rest, most ran lessons first. */
export function rankProof(rows) {
  const enough = rows.filter((r) => r.enough).sort((a, b) => b.diff - a.diff || a.tile_id.localeCompare(b.tile_id) || a.class_id.localeCompare(b.class_id));
  const few = rows.filter((r) => !r.enough).sort((a, b) => b.ran.n - a.ran.n || (b.diff ?? -Infinity) - (a.diff ?? -Infinity) || a.tile_id.localeCompare(b.tile_id) || a.class_id.localeCompare(b.class_id));
  return [...enough, ...few];
}

/**
 * The share of marks a class got in one lesson's quiz: the sum of awarded marks over the sum of
 * available marks, across each student's latest attempt. Rows still waiting for a mark are left
 * out of both sides; practice-set rows too. Null when nothing is marked.
 * @param {Array<{ rows?: Array<{ awarded: number | null, max: number, set?: string }> }>} attempts
 */
export function lessonScore(attempts) {
  let got = 0;
  let max = 0;
  for (const attempt of Array.isArray(attempts) ? attempts : []) {
    for (const row of Array.isArray(attempt?.rows) ? attempt.rows : []) {
      if (!row || row.set || typeof row.awarded !== 'number' || typeof row.max !== 'number' || row.max <= 0) continue;
      got += row.awarded;
      max += row.max;
    }
  }
  return max > 0 ? round(got / max) : null;
}
