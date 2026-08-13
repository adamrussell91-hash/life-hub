import { addCalendarDays, daysBetween } from '../../../js/core/time.js';

export const MIND_DIGEST_WINDOW_DAYS = 30;
const MIND_PATH = /^data\/mind\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const SILENCE_DAYS = 7;

export function getMindDigestWindowStart(today) {
  return addCalendarDays(today, -(MIND_DIGEST_WINDOW_DAYS - 1));
}

export function selectMindEntries(tree, { from, to } = {}) {
  if (!Array.isArray(tree)) return [];
  return tree.filter(entry => {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') return false;
    const match = MIND_PATH.exec(entry.path);
    if (!match) return false;
    if (from && match.groups.date < from) return false;
    if (to && match.groups.date > to) return false;
    return true;
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function selectOnThisDayEntries(tree, today) {
  if (!Array.isArray(tree) || typeof today !== 'string') return [];
  const [, month, day] = today.split('-');
  const [year] = today.split('-').map(Number);
  const found = [];
  for (let ago = 1; ago <= 3; ago += 1) {
    const y = String(year - ago);
    const prefix = `data/mind/${y}/${month}/${y}-${month}-${day}-diary-`;
    const hit = tree.find(entry => entry?.type === 'blob' && typeof entry.path === 'string' && entry.path.startsWith(prefix));
    if (hit) found.push(hit);
  }
  return found;
}

function lastDate(events, type) {
  const dates = (events ?? [])
    .filter(e => e?.record?.type === type && typeof e.record.date === 'string')
    .map(e => e.record.date)
    .sort();
  return dates.at(-1) ?? null;
}

function diaryWordCount(entry) {
  return (entry.body ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function summarizeDiaryForPrompt(events, today) {
  const entries = (events ?? []).filter(e => e?.record?.type === 'diary');
  if (!entries.length) return '';
  const last = lastDate(events, 'diary');
  const gap = last ? daysBetween(last, today) : null;
  const byDate = [...entries].sort((a, b) => a.record.date.localeCompare(b.record.date));
  let shortFlag = '';
  if (byDate.length >= 4) {
    const latestCount = diaryWordCount(byDate.at(-1));
    const others = byDate.slice(0, -1);
    const meanOthers = others.reduce((sum, e) => sum + diaryWordCount(e), 0) / others.length;
    if (latestCount < 0.7 * meanOthers) {
      shortFlag = 'Recent entries include some shorter than usual — a hypothesis, not a claim.';
    }
  }
  const lines = byDate
    .slice(-8)
    .map(e => {
      const r = e.record;
      const moods = Array.isArray(r.moods) && r.moods.length ? r.moods.join('/') : (r.mood ?? '');
      const tags = Array.isArray(r.tags) ? r.tags.join(', ') : '';
      const note = typeof r.system_note === 'string' && r.system_note.trim() ? ` system_note: ${r.system_note.trim()}` : '';
      return `${r.date}: mood ${moods}${r.mood_score != null ? ` score ${r.mood_score}` : ''}${tags ? ` tags ${tags}` : ''}${note}`;
    });
  return [
    'Diary (metadata only — do not quote prose):',
    ...lines,
    gap != null ? `Days since last entry: ${gap}.` : 'No diary dates.',
    shortFlag
  ].filter(Boolean).join('\n');
}

export function summarizeMindSessionsForPrompt(events, today) {
  const sessions = (events ?? []).filter(e => e?.record?.type === 'mind_session');
  if (!sessions.length) return '';
  const last = lastDate(events, 'mind_session');
  const gap = last ? daysBetween(last, today) : null;
  const lines = sessions
    .sort((a, b) => a.record.date.localeCompare(b.record.date))
    .slice(-6)
    .map(e => {
      const r = e.record;
      const thread = r.closing_question ? ` thread: ${r.closing_question}` : '';
      return `${r.date}: ${r.theme ?? 'session'}${thread}`;
    });
  return [
    'Vera sessions (do not quote session prose):',
    ...lines,
    gap != null ? `Days since last mind session: ${gap}.` : ''
  ].filter(Boolean).join('\n');
}

function lastMindPathDate(tree, { session }) {
  const dates = [];
  for (const entry of tree ?? []) {
    const match = typeof entry?.path === 'string' ? MIND_PATH.exec(entry.path) : null;
    if (!match) continue;
    const isSession = match.groups.name === 'session';
    if (session ? isSession : !isSession) dates.push(match.groups.date);
  }
  dates.sort();
  return dates.at(-1) ?? null;
}

export function simultaneousSilenceFlag({ tree, today }) {
  const lastDiary = lastMindPathDate(tree, { session: false });
  const lastSession = lastMindPathDate(tree, { session: true });
  const diaryGap = lastDiary ? daysBetween(lastDiary, today) : SILENCE_DAYS + 1;
  const sessionGap = lastSession ? daysBetween(lastSession, today) : SILENCE_DAYS + 1;
  if (diaryGap >= SILENCE_DAYS && sessionGap >= SILENCE_DAYS) {
    return `Mind silence: diary quiet ${lastDiary ? `${diaryGap}d` : 'with no files'} and Vera sessions quiet ${lastSession ? `${sessionGap}d` : 'with no files'} (both ≥${SILENCE_DAYS}).`;
  }
  return '';
}

export function divergenceLine(events, today) {
  const weekFrom = addCalendarDays(today, -6);
  const diaries = (events ?? []).filter(e => e?.record?.type === 'diary' && e.record.date >= weekFrom);
  const sessions = (events ?? []).filter(e => e?.record?.type === 'mind_session' && e.record.date >= weekFrom);
  if (!diaries.length || !sessions.length) return '';
  const diaryMoods = new Set(diaries.flatMap(e => Array.isArray(e.record.moods) && e.record.moods.length
    ? e.record.moods
    : (e.record.mood ? [e.record.mood] : [])));
  const sessionMoods = new Set(sessions.flatMap(e => [e.record.mood_at_open, e.record.mood_at_close].filter(Boolean)));
  const overlap = [...diaryMoods].some(m => sessionMoods.has(m));
  if (overlap || diaryMoods.size === 0 || sessionMoods.size === 0) return '';
  return `Hypothesis only: this week's diary moods (${[...diaryMoods].join(', ')}) and session moods (${[...sessionMoods].join(', ')}) did not overlap.`;
}

export function excerptOnThisDay({ date, mood, moods, tags, highlights, challenges, notes }) {
  const raw = typeof notes === 'string' ? notes.trim() : '';
  let excerpt = '';
  if (raw) {
    const sentences = raw.split(/(?<=[.!?])\s+/);
    excerpt = sentences.slice(0, 2).join(' ');
    if (excerpt.length > 400) excerpt = excerpt.slice(0, 400).replace(/\s+\S*$/, '');
  }
  const moodLabel = Array.isArray(moods) && moods.length ? moods.join('/') : (mood ?? '');
  return [
    `On this day ${date}: mood ${moodLabel}.`,
    Array.isArray(tags) && tags.length ? `Tags: ${tags.join(', ')}.` : '',
    highlights ? `Highlights: ${highlights}` : '',
    challenges ? `Challenges: ${challenges}` : '',
    excerpt ? `Excerpt: ${excerpt}` : ''
  ].filter(Boolean).join(' ');
}
