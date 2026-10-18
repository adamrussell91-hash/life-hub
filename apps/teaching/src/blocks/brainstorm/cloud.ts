/** Word cloud counts for brainstorm answers. */

const STOP = new Set(
  'a an and are as at be because but by for from he her him his i if in into is it its just me my of on or our she so than that the their them they this to too us was we were what when which who why will with you your'.split(' ')
);
const MAX_WORDS = 40;

export type CloudWord = { text: string; count: number };

/** Short answers (three words or fewer) count as one phrase; longer ones add their words. */
export function cloudWords(texts: string[]): CloudWord[] {
  const counts = new Map<string, { text: string; count: number }>();
  const bump = (raw: string) => {
    const key = raw.toLowerCase();
    const hit = counts.get(key);
    if (hit) hit.count++;
    else counts.set(key, { text: raw, count: 1 });
  };
  for (const t of texts) {
    const clean = t.replace(/[^\p{L}\p{N}'’\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const words = clean.split(' ');
    if (words.length <= 3) bump(clean);
    else for (const w of words) if (w.length > 2 && !STOP.has(w.toLowerCase())) bump(w);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).slice(0, MAX_WORDS);
}
