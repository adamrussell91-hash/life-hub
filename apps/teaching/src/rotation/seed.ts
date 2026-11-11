import type { Block } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { blankQuestion } from '@/quiz/core';
import { RotationSettingsSchema, type PretestItem, type RotationRole, type RotationSettings, type Station } from './schema';
import { PRETEST_PER_STATION, findStationSection, isRotationFinale, withSettings } from './model';

/** New stations, their sections and pretest questions. Browser only (it builds blocks). */

export function nextId(prefix: string, used: Set<string>): string {
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function newStation(r: RotationSettings, kind: Station['kind'] = 'concepts'): Station {
  const id = nextId('s', new Set(r.stations.map((s) => s.id)));
  const n = r.stations.filter((s) => s.kind !== 'teacher').length + 1;
  return {
    id,
    title: kind === 'teacher' ? 'Teacher station' : `Station ${n}`,
    kind,
    outcomes: [],
    minutes: kind === 'teacher' ? 8 : 20,
    seats: kind === 'teacher' ? 5 : 6,
    piece: ''
  };
}

export function newPretestItems(r: RotationSettings, station: string, count: number, newId: () => string): PretestItem[] {
  const used = new Set(r.pretest.map((p) => p.id));
  const out: PretestItem[] = [];
  for (let i = 0; i < count; i++) {
    const id = nextId('q', used);
    used.add(id);
    out.push({ id, station, question: blankQuestion('multiple_choice', id, 1, newId) });
  }
  return out;
}

const tagged = (b: Block, role: RotationRole, extra: Record<string, unknown> = {}): Block => withSettings(b, { rotation_role: role, ...extra });

/** The blocks a new station's section starts with, in card order. */
export function seedStationBlocks(station: Station, newId: () => string): Block[] {
  if (station.kind === 'teacher') {
    const t = createBlock('with_teacher', newId());
    return [tagged({ ...t, content: { talking_points: [] } } as Block, 'step')];
  }
  const goal = createBlock('rich_text', newId());
  const step = createBlock('rich_text', newId());
  const done = createBlock('rich_text', newId());
  const exitId = newId();
  const exit = createBlock('quiz_question', exitId);
  return [
    tagged({ ...goal, content: { html: '<p>By the end of this station you can…</p>' } } as Block, 'goal'),
    tagged({ ...step, content: { html: '' } } as Block, 'step'),
    tagged({ ...done, content: { html: '<ul><li></li></ul>' } } as Block, 'done'),
    tagged({ ...exit, content: { question: blankQuestion('multiple_choice', exitId, 1, newId) } } as Block, 'exit')
  ];
}

export function stationSection(station: Station, newId: () => string): Block {
  const base = createBlock('section', newId());
  return { ...base, content: { title: station.title, blocks: seedStationBlocks(station, newId), rotation_station: station.id } } as Block;
}

/** A section for each station that has none, and the finale section. Unchanged blocks come back as the same array. */
export function withRotationSections(blocks: Block[], r: RotationSettings, newId: () => string): Block[] {
  let next = blocks;
  for (const s of r.stations) if (!findStationSection(next, s.id)) next = [...next, stationSection(s, newId)];
  if (!next.some(isRotationFinale)) {
    const base = createBlock('section', newId());
    next = [...next, { ...base, content: { title: 'Finale', blocks: [], rotation_finale: true } } as Block];
  }
  return next;
}

/** Defaults for a new rotation: two stations and their pretest. */
export function seedRotation(classId: string, newId: () => string): RotationSettings {
  let r: RotationSettings = RotationSettingsSchema.parse({ class_id: classId });
  for (let i = 0; i < 2; i++) {
    const s = newStation(r);
    r = { ...r, stations: [...r.stations, s] };
    r = { ...r, pretest: [...r.pretest, ...newPretestItems(r, s.id, PRETEST_PER_STATION, newId)] };
  }
  return r;
}

