// apps/teaching/src/lecture/state.ts
import type { LectureScene } from './scenes';

export type GateResult = 'right' | 'wrong' | 'done';

export type LectureState = {
  scene: number;
  /** How many of the scene's beats are showing. */
  shown: number;
  /** How far each reached scene got, by scene id, so going back and forward cannot skip a gate. */
  shownBy: Record<string, number>;
  /** The gate whose side path is playing, or null. */
  detour: string | null;
  answered: Record<string, GateResult>;
  ticked: string[];
  detoured: string[];
  missed: string[];
  reached: string[];
  replays: Record<string, number>;
  finished: boolean;
};

export type MainAction =
  | { kind: 'reveal'; label: string }
  | { kind: 'next'; label: string }
  | { kind: 'finish'; label: string }
  | { kind: 'wait'; label: string }
  | { kind: 'tick'; label: string; noteId: string }
  | { kind: 'detour'; label: string; gateId: string }
  | { kind: 'return'; label: string };

const add = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

function firstShown(scene: LectureScene | undefined): number {
  if (!scene) return 0;
  return scene.reveal === 'all' ? scene.beats.length : Math.min(1, scene.beats.length);
}

export function startState(scenes: readonly LectureScene[]): LectureState {
  return {
    scene: 0,
    shown: firstShown(scenes[0]),
    shownBy: scenes[0] ? { [scenes[0].id]: firstShown(scenes[0]) } : {},
    detour: null,
    answered: {},
    ticked: [],
    detoured: [],
    missed: [],
    reached: scenes[0] ? [scenes[0].id] : [],
    replays: {},
    finished: false
  };
}

/** What the big button does now. Gates and note cues hold it until they are done. */
export function mainAction(state: LectureState, scenes: readonly LectureScene[]): MainAction {
  if (state.detour) return { kind: 'return', label: 'Back to the lecture →' };
  const scene = scenes[state.scene];
  if (!scene) return { kind: 'finish', label: 'See your recap →' };
  for (const beat of scene.beats.slice(0, state.shown)) {
    const id = beat.block.id;
    if (beat.gate && !state.answered[id]) return { kind: 'wait', label: 'Answer to continue' };
    if (beat.gate && state.answered[id] === 'wrong' && beat.sidePath && !state.detoured.includes(id)) {
      return { kind: 'detour', label: 'Let’s look again →', gateId: id };
    }
    if (beat.block.block_type === 'note_cue' && !state.ticked.includes(id)) {
      return { kind: 'tick', label: 'Done · I wrote it', noteId: id };
    }
  }
  if (state.shown < scene.beats.length) return { kind: 'reveal', label: `Reveal · ${state.shown + 1} of ${scene.beats.length}` };
  if (state.scene < scenes.length - 1) return { kind: 'next', label: 'Next scene →' };
  return { kind: 'finish', label: 'See your recap →' };
}

export function act(state: LectureState, scenes: readonly LectureScene[], action: MainAction): LectureState {
  switch (action.kind) {
    case 'reveal': {
      const id = scenes[state.scene]?.id;
      return { ...state, shown: state.shown + 1, shownBy: id ? { ...state.shownBy, [id]: state.shown + 1 } : state.shownBy };
    }
    case 'next':
      return goTo(state, scenes, state.scene + 1);
    case 'finish':
      // Opens the recap only; the recap's Finish button marks the lecture finished.
      return state;
    case 'tick':
      return { ...state, ticked: add(state.ticked, action.noteId) };
    case 'detour':
      return { ...state, detour: action.gateId, detoured: add(state.detoured, action.gateId) };
    case 'return': {
      // Nothing left after the gate: carry straight on to the next scene.
      const scene = scenes[state.scene];
      const gateLast = !!scene && scene.beats[scene.beats.length - 1]?.block.id === state.detour;
      const back = { ...state, detour: null };
      if (gateLast && state.shown >= scene.beats.length && state.scene < scenes.length - 1) return goTo(back, scenes, state.scene + 1);
      return back;
    }
    case 'wait':
      return state;
  }
}

/** A gate block reported its result. A miss is kept for the recap, even if they fix it later. */
export function answer(state: LectureState, gateId: string, result: GateResult): LectureState {
  return {
    ...state,
    answered: { ...state.answered, [gateId]: result },
    missed: result === 'wrong' ? add(state.missed, gateId) : state.missed
  };
}

/** Back, Next and preview jumps. A scene already reached opens whole and counts as a replay. */
export function goTo(state: LectureState, scenes: readonly LectureScene[], index: number): LectureState {
  const target = Math.max(0, Math.min(index, scenes.length - 1));
  const scene = scenes[target];
  if (!scene) return state;
  const seen = state.reached.includes(scene.id);
  const here = scenes[state.scene];
  const shownBy = here ? { ...state.shownBy, [here.id]: state.shown } : { ...state.shownBy };
  const shown = Math.min(shownBy[scene.id] ?? firstShown(scene), scene.beats.length);
  shownBy[scene.id] = shown;
  return {
    ...state,
    scene: target,
    detour: null,
    shown,
    shownBy,
    reached: add(state.reached, scene.id),
    replays: seen && target < state.scene ? { ...state.replays, [scene.id]: (state.replays[scene.id] ?? 0) + 1 } : state.replays
  };
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []);

/** A state read back from the device; anything odd starts fresh. */
export function restoreState(raw: unknown, scenes: readonly LectureScene[]): LectureState {
  const fresh = startState(scenes);
  if (!raw || typeof raw !== 'object' || typeof (raw as LectureState).scene !== 'number') return fresh;
  const r = raw as Partial<LectureState>;
  const scene = Math.max(0, Math.min(Math.floor(r.scene ?? 0), scenes.length - 1));
  const beats = scenes[scene]?.beats.length ?? 0;
  const results = Object.entries(r.answered ?? {}).filter(([, v]) => v === 'right' || v === 'wrong' || v === 'done');
  const replays = Object.entries(r.replays ?? {}).filter(([, v]) => typeof v === 'number' && v >= 0);
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const current = scenes[scene];
  const shown = finite(r.shown) ? Math.max(firstShown(current), Math.min(Math.floor(r.shown), beats)) : firstShown(current);
  const shownBy = Object.fromEntries(
    Object.entries(r.shownBy ?? {}).filter(([id, v]) => finite(v) && scenes.some((sc) => sc.id === id)).map(([id, v]) => [id, Math.max(0, Math.floor(v as number))])
  ) as Record<string, number>;
  if (current) shownBy[current.id] = shown;
  const detour = typeof r.detour === 'string' && current?.beats.some((beat) => beat.block.id === r.detour && beat.sidePath) ? r.detour : null;
  return {
    scene,
    shown,
    shownBy,
    detour,
    answered: Object.fromEntries(results) as Record<string, GateResult>,
    ticked: strings(r.ticked),
    detoured: strings(r.detoured),
    missed: strings(r.missed),
    reached: strings(r.reached).length ? strings(r.reached) : fresh.reached,
    replays: Object.fromEntries(replays) as Record<string, number>,
    finished: r.finished === true
  };
}
