/** Meeting Guides: a guide is data; a run is one structured read of one person in one context. */
export type Tap = 0 | 1 | 2 | 3;
export type Values = Record<string, number>;

export interface GuideRun {
  id: string;
  guide: string;
  person_ref: string;
  person_name: string;
  /** Free text: "English · essays". */
  context: string;
  taps: Record<string, Tap>;
  quotes: string[];
  checks: Record<string, string>;
  /** Adam's final call per scale, 0–10. Only saved values are kept. */
  values: Values;
  profile: string;
  moves: string[];
  created_at: string;
  updated_at: string;
}

export type Zone = 'apart' | 'controlled' | 'autonomous';

export interface GuideScale {
  id: string;
  label: string;
  zone: Zone;
  /** CSS tone key: `guide-tone--<tone>`. */
  tone: string;
}

export interface GuidePrompt {
  scale: string;
  ask: string;
  hint: string;
  listenFor: string[];
}

export interface GuideProbe {
  id: string;
  ask: string;
  options: Array<{ id: string; label: string; leans: 'introjected' | 'identified' }>;
}

export interface GuideProfile {
  id: string;
  name: string;
  line: string;
  moves: string[];
}

export interface GuideDefinition {
  id: string;
  name: string;
  line: string;
  minutes: number;
  /** Static SVG markup for the emblem (a constant, never user text). */
  emblem: string;
  cite: string;
  scales: GuideScale[];
  prompts: GuidePrompt[];
  probes: GuideProbe[];
  probeTitle: string;
  probeHint: string;
  profiles: GuideProfile[];
  suggest(taps: Partial<Record<string, Tap>>, checks: Record<string, string>): Values;
  needsCheck(taps: Partial<Record<string, Tap>>): boolean;
  profileFor(values: Values): GuideProfile;
  /** 0 = fully controlled, 1 = fully autonomous. */
  lean(values: Values): number;
}
