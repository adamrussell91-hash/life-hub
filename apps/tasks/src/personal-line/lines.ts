/** The four MindWorks lines and which catalogue subjects run on each (a subject can be on two). */
export type LineKey = 'J' | 'I' | 'E' | 'R';

export const LINE_ORDER: LineKey[] = ['J', 'I', 'E', 'R'];

export const LINES: Record<LineKey, { name: string; color: string; fill: string; ink: string }> = {
  J: { name: 'Justice', color: '#0057b8', fill: '#d4e6ff', ink: '#ffffff' },
  I: { name: 'Innovation', color: '#e0b400', fill: '#fff3b0', ink: '#13233a' },
  E: { name: 'Expression', color: '#009a3a', fill: '#c8f0d2', ink: '#ffffff' },
  R: { name: 'Reasoning', color: '#6b2d8e', fill: '#edd6fa', ink: '#ffffff' }
};

/** Adam's mapping, 14 Oct 2026. The first line is where the subject is listed in the builder. */
export const SUBJECT_LINES: Record<string, LineKey[]> = {
  Legal: ['J'],
  Debating: ['J', 'R'],
  'Public Speaking': ['J', 'E'],
  Humanities: ['J', 'E'],
  History: ['J'],
  Geography: ['J', 'I'],
  Leadership: ['J', 'R'],
  STEM: ['I'],
  Science: ['I'],
  Engineering: ['I'],
  Mathematics: ['I'],
  Coding: ['I'],
  Computing: ['I'],
  Robotics: ['I'],
  'Website Design': ['I', 'E'],
  'Game Development': ['I', 'E'],
  Physics: ['I'],
  Chemistry: ['I'],
  Biology: ['I'],
  Astronomy: ['I'],
  Business: ['I'],
  Economics: ['I', 'R'],
  English: ['E'],
  'Creative Writing': ['E'],
  'Essay Writing': ['E', 'R'],
  Arts: ['E'],
  Film: ['E'],
  Drama: ['E'],
  Music: ['E'],
  Languages: ['E'],
  Classics: ['R', 'E'],
  Psychology: ['R'],
  Philosophy: ['R'],
  Neuroscience: ['R']
};

/** Junior = Years 7–8, Rozelle = Year 9, Senior = Years 10–12. */
export function yearLineName(year: number): string {
  return year <= 8 ? 'Junior' : year === 9 ? 'Rozelle' : 'Senior';
}

export function linesForSubjects(subjects: Iterable<string>): LineKey[] {
  const wanted = new Set<LineKey>();
  for (const subject of subjects) for (const line of SUBJECT_LINES[subject] ?? []) wanted.add(line);
  return LINE_ORDER.filter((line) => wanted.has(line));
}
