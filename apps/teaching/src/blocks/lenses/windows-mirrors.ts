import type { Block } from '@/schemas/block';
import { WindowsMirrorsConfigSchema, type WindowsMirrorsConfig } from '@/schemas/lens';
import { canHaveKaplanQualifier, isKaplanFocusStatement, kaplanFocusText, suggestKaplanFocus } from '../kaplan';
import { readLens, withLens, withoutLens } from './attachments';
import type { LensChoice, LensConfig, LensLevel, LensStep, StepContext, SteppedLens, WriteItDown } from './types';

/**
 * Windows & Mirrors. A window looks outward at a world that is not ours (its
 * time, place and people); a mirror looks inward at what people everywhere
 * share. Teachers set Window, Mirror, Both or Student's choice, and a level.
 */
export const WINDOWS_MIRRORS_ID = 'windows_mirrors';
type Path = 'window' | 'mirror' | 'both';

export const ANSWER_WITH_LABELS: Record<WindowsMirrorsConfig['answer_with'], string> = {
  window: 'Window', mirror: 'Mirror', both: 'Both', choice: 'Student’s choice'
};

const CHOICES: LensChoice[] = [
  {
    value: 'window', label: 'Window: look outward',
    detail: 'See a world that isn’t yours. Test: I see how they do things differently in their time and place. Like noticing that a friend’s family eats, celebrates and makes rules differently from yours.'
  },
  {
    value: 'mirror', label: 'Mirror: look inward',
    detail: 'See yourself and people everywhere. Test: I see they do the same basic human things I do. Like noticing that a friend’s family still eats together, argues and looks after each other, just like yours.'
  },
  { value: 'both', label: 'Both', detail: 'Look outward, then inward. The hardest answer, and the strongest.' }
];

/** One moment students already know, shown every way at every level. */
const EXAMPLES: Record<Path, Record<LensLevel, string>> = {
  window: {
    support: 'When Katniss volunteers for Prim at the reaping, it shows that in Panem the Capitol makes children fight so the districts stay scared.',
    core: 'Through Katniss volunteering at the reaping, Collins reveals how the Capitol uses a yearly ritual of child sacrifice to keep the districts afraid and obedient.',
    extend: 'Through the reaping, Collins exposes a regime that turns children’s deaths into a public ceremony. Katniss’s volunteering reveals the only choice the Capitol still allows: whose child dies, not whether one does.'
  },
  mirror: {
    support: 'When Katniss volunteers for Prim, it makes us think about how far we would go to protect someone we love.',
    core: 'Through Katniss volunteering in Prim’s place, Collins forces us to reflect on how far people will go to protect those they love. This suggests that love can make people braver than fear does.',
    extend: 'Katniss’s sacrifice confronts us with an uncomfortable truth: self-sacrifice is admirable, yet it leaves the system untouched. Collins forces readers to ask whether protecting the people we love is the same as resisting injustice.'
  },
  both: {
    support: 'Katniss volunteering shows how cruel the Capitol is to the districts, and it makes us think about how far we would go for our family.',
    core: 'Through Katniss volunteering at the reaping, Collins reveals how the Capitol rules through fear, while forcing us to reflect on how love can make ordinary people defy it.',
    extend: 'Collins reveals a Panem where the Capitol rules by staging children’s deaths as entertainment, yet she also holds up a mirror to readers, whose appetite for watching others suffer on screen is uncomfortably close to the Capitol audience’s.'
  }
};

const FRAMES: Record<Path, { support: string; core: string; extend: string }> = {
  window: {
    support: 'When ___ happens, it shows that in ___, people ___.',
    core: 'Through ___, [composer] reveals how ___ in [the world of the text], where ___.',
    extend: 'Write two or three sentences that explain the world of the text and name the technique that shows it.'
  },
  mirror: {
    support: 'When ___ happens, it makes us think about ___.',
    core: 'Through ___, [composer] forces us to reflect on ___. This suggests that people ___.',
    extend: 'Write two or three sentences that name an uncomfortable truth the text shows about people, and why it is uncomfortable.'
  },
  both: {
    support: '___ shows ___, and it makes us think about ___.',
    core: 'Through ___, [composer] reveals how ___ while forcing us to reflect on ___.',
    extend: 'Write a short paragraph that moves from the text’s world to ourselves and names the tension between them.'
  }
};

const VERB_CHECK: Record<Path, string> = {
  window: 'Uses a window verb', mirror: 'Uses a mirror verb', both: 'Uses a window verb and a mirror verb'
};

function config(raw: LensConfig): WindowsMirrorsConfig {
  return WindowsMirrorsConfigSchema.parse(raw);
}

function focusPhrase(raw: string): string {
  const text = kaplanFocusText(raw);
  if (!text) return 'the ideas in this activity';
  return isKaplanFocusStatement(text) ? 'this idea' : text.replace(/[.?!]+$/, '');
}

function pathFor(c: WindowsMirrorsConfig, choice?: string): Path | undefined {
  if (c.answer_with !== 'choice') return c.answer_with;
  return choice === 'window' || choice === 'mirror' || choice === 'both' ? choice : undefined;
}

type Draft = Omit<LensStep, 'prompt' | 'support'> & { prompt: string; support: string };

function chooseStep(level: LensLevel, reviewer: boolean): Draft {
  return {
    id: 'choose', title: 'Choose your lens', choices: CHOICES,
    prompt: reviewer
      ? 'Will you look for the window, the mirror, or both in your partner’s writing?'
      : level === 'support' ? 'How do you want to look at this text?' : 'Will you look through a window, into a mirror, or both?',
    support: ''
  };
}

function writerSteps(path: Path, level: LensLevel, focus: string): Draft[] {
  const support = level === 'support';
  const extend = level === 'extend';
  const steps: Draft[] = [{
    id: 'moment', title: 'Pick your moment',
    prompt: support
      ? 'Pick one part of the text you remember well. What happens?'
      : `Choose one specific moment from the text that shows ${focus}: a quotation, a scene, an image or a technique.`,
    support: support
      ? 'Start with: “I chose the part where…”'
      : extend
        ? 'Choose a moment you can quote or describe precisely.'
        : '“The Hunger Games is about sacrifice” is a topic, not a moment. “Katniss volunteers for Prim at the reaping” is a moment: something you can point to.'
  }];
  if (path !== 'mirror') {
    steps.push({
      id: 'window', title: 'Look outward',
      prompt: support
        ? 'What is life like for people in this story? How is it different from your life?'
        : `What does this moment show you about ${focus} in the world of the text: its time, place and people? How is that different from your world?`,
      support: support
        ? 'Pick a verb: shows · reveals · displays. Try: “This shows that in [place], people…”'
        : extend
          ? 'Window verbs: reveals, exposes, unveils, depicts.'
          : 'Window verbs: reveals, shows, opens, displays, unveils, presents, depicts, illustrates, transports. Test: I see how they do things differently in their context.'
    });
  }
  if (path !== 'window') {
    steps.push({
      id: 'mirror', title: 'Look inward',
      prompt: support
        ? 'Have you, or people you know, ever felt or done something like this?'
        : `What does this moment reflect about ${focus} in people everywhere, including you and people you know?`,
      support: support
        ? 'Pick a verb: makes us think about · reflects · reminds us. Try: “This makes us think about…”'
        : extend
          ? 'Mirror verbs: confronts, exposes, challenges, forces us to reflect on.'
          : 'Mirror verbs: reflects, confronts, exposes, illuminates, echoes, examines, challenges, captures, forces us to reflect on. Test: I see they do the same basic human things I do.'
    });
  }
  if (extend) {
    steps.push(path === 'both'
      ? {
          id: 'tension', title: 'Find the tension',
          prompt: 'Where do the window and the mirror pull against each other? What does the text’s world make easy to judge that becomes harder to judge in ourselves?',
          support: ''
        }
      : {
          id: 'closer', title: 'Look closer',
          prompt: `What technique or choice by the composer makes this moment work as a ${path}? What would be lost without it?`,
          support: ''
        });
  }
  return steps;
}

/** On peer feedback the reader looks for the window and mirror in a classmate's writing. */
function reviewerSteps(path: Path, level: LensLevel): Draft[] {
  const support = level === 'support';
  const steps: Draft[] = [];
  if (path !== 'mirror') {
    steps.push({
      id: 'find_window', title: 'Find the window',
      prompt: support
        ? 'Find where your partner explains what life is like in the text. Copy their words.'
        : 'Which verb or phrase shows what the text reveals about its world? Quote it.',
      support: 'Window verbs: reveals, shows, depicts, exposes.'
    });
  }
  if (path !== 'window') {
    steps.push({
      id: 'find_mirror', title: 'Find the mirror',
      prompt: support
        ? 'Find where your partner says something about people in general, or about us. Copy their words, or write “missing”.'
        : 'Where does the writing make the reader reflect on themselves or people in general? Quote it, or note that it is missing.',
      support: 'Mirror verbs: reflects, confronts, challenges, forces us to reflect on.'
    });
  }
  if (level === 'extend') {
    steps.push({
      id: 'weigh', title: 'Weigh it',
      prompt: path === 'both'
        ? 'Which is stronger, the window or the mirror? What would make the weaker one match it?'
        : `How precise is the ${path}? What one change would sharpen it?`,
      support: ''
    });
  }
  return steps;
}

const isReviewer = (block: Block) => block.block_type === 'peer_feedback';

function steps(raw: LensConfig, ctx: StepContext): LensStep[] {
  const c = config(raw);
  const reviewer = isReviewer(ctx.block);
  const path = pathFor(c, ctx.choice);
  const list: Draft[] = c.answer_with === 'choice' ? [chooseStep(ctx.level, reviewer)] : [];
  if (path) list.push(...(reviewer ? reviewerSteps(path, ctx.level) : writerSteps(path, ctx.level, focusPhrase(c.focus))));
  return list.map((step) => {
    const key = `${ctx.level}.${step.id}`;
    const prompt = c.prompts?.[key]?.trim();
    const support = c.supports?.[key];
    return { ...step, prompt: prompt || step.prompt, support: support != null ? support.trim() : step.support };
  });
}

function writeItDown(raw: LensConfig, ctx: StepContext): WriteItDown {
  const c = config(raw);
  const path = pathFor(c, ctx.choice) ?? 'both';
  if (isReviewer(ctx.block)) {
    const frame = path === 'both'
      ? 'Your window is ___. Your mirror is ___. To sharpen it, ___.'
      : `Your ${path} is ___. To sharpen it, ___.`;
    return ctx.level === 'extend'
      ? {
          challenge: 'Write two sentences of feedback: what works in their writing, and one specific change that would sharpen the weaker part.',
          checklist: ['Quotes their words', 'Names what works', 'One specific suggestion']
        }
      : { frame, checklist: ['Quotes their words', 'One specific suggestion'] };
  }
  const example = c.examples?.[ctx.level]?.trim() || EXAMPLES[path][ctx.level];
  if (ctx.level === 'support') {
    return {
      frame: FRAMES[path].support, example,
      checklist: ['I named the part of the text', 'I used one of the verbs', 'I said something about people, not just what happens']
    };
  }
  const core = ['Names a specific moment', VERB_CHECK[path], 'Explains, rather than retells'];
  if (ctx.level === 'core') return { frame: FRAMES[path].core, example, checklist: core };
  return {
    challenge: FRAMES[path].extend, example,
    checklist: [...core, 'Names a technique', 'Names a tension or complication', 'The sentences link, not list']
  };
}

export function windowsMirrorsSymbol(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('kaplan-symbol');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  // A four-pane window beside a hand mirror.
  path.setAttribute('d', 'M2 4h9v14H2zM6.5 4v14M2 11h9M13 9a4 4 0 1 0 8 0 4 4 0 1 0-8 0M17 13v8');
  svg.append(path);
  return svg;
}

function pills<V extends string>(label: string, values: Array<[V, string]>, current: V, onPick: (value: V) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'kaplan-field';
  const heading = document.createElement('span');
  heading.textContent = label;
  const row = document.createElement('div');
  row.className = 'lens-levels';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  for (const [value, text] of values) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'lens-levels__option';
    pill.textContent = text;
    pill.setAttribute('aria-pressed', String(value === current));
    pill.addEventListener('click', () => onPick(value));
    row.append(pill);
  }
  group.append(heading, row);
  return group;
}

function setupFields(draft: LensConfig, update: (next: LensConfig) => void): HTMLElement[] {
  const c = config(draft);
  const answer = pills('Answer with', Object.entries(ANSWER_WITH_LABELS) as Array<[WindowsMirrorsConfig['answer_with'], string]>,
    c.answer_with, (value) => update({ ...draft, answer_with: value }));
  const path: Path = c.answer_with === 'choice' ? 'both' : c.answer_with;
  const preview = document.createElement('p');
  preview.className = 'kaplan-caption lens-example-preview';
  preview.textContent = `Students see this example: “${c.examples?.[c.level]?.trim() || EXAMPLES[path][c.level]}”`;

  const own = document.createElement('details');
  own.className = 'kaplan-support';
  const summary = document.createElement('summary');
  summary.textContent = 'Use your own examples';
  own.append(summary);
  for (const level of ['support', 'core', 'extend'] as const) {
    const label = document.createElement('label');
    label.className = 'kaplan-field';
    const area = document.createElement('textarea');
    area.rows = 2;
    area.maxLength = 1200;
    area.placeholder = EXAMPLES[path][level];
    area.value = c.examples?.[level] ?? '';
    area.addEventListener('input', () => {
      const examples = { ...((draft.examples as WindowsMirrorsConfig['examples']) ?? {}), [level]: area.value };
      draft.examples = examples;
    });
    label.append(document.createTextNode(`${level[0]!.toUpperCase()}${level.slice(1)} example · blank uses the built-in one`), area);
    own.append(label);
  }
  return [answer, preview, own];
}

export const WINDOWS_MIRRORS: SteppedLens = {
  id: WINDOWS_MIRRORS_ID,
  label: 'Windows & Mirrors',
  group: 'Literature',
  path: 'Find a moment → look outward, inward or both → write it',
  symbol: windowsMirrorsSymbol,
  levels: ['support', 'core', 'extend'],
  storageSuffix: `lens.${WINDOWS_MIRRORS_ID}`,
  printChoice: 'both',
  canAttach: canHaveKaplanQualifier,
  read: (block) => {
    const raw = readLens(block, WINDOWS_MIRRORS_ID);
    if (!raw) return undefined;
    const parsed = WindowsMirrorsConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  },
  write: (block, raw) => withLens(block, WINDOWS_MIRRORS_ID, cleanConfig(config(raw))),
  remove: (block) => withoutLens(block, WINDOWS_MIRRORS_ID),
  create: (block) => WindowsMirrorsConfigSchema.parse({ focus: suggestKaplanFocus(block) }),
  steps,
  setStepText: (raw, ctx, stepId, field, value) => {
    const key = `${ctx.level}.${stepId}`;
    return field === 'prompt'
      ? { ...raw, prompts: { ...((raw.prompts as Record<string, string>) ?? {}), [key]: value } }
      : { ...raw, supports: { ...((raw.supports as Record<string, string | null>) ?? {}), [key]: value } };
  },
  writeItDown,
  setupFields
};

/** Drop empty overrides and examples so saved lessons stay small. */
function cleanConfig(c: WindowsMirrorsConfig): WindowsMirrorsConfig {
  const next = { ...c };
  const prompts = Object.entries(c.prompts ?? {}).filter(([, v]) => v.trim());
  if (prompts.length) next.prompts = Object.fromEntries(prompts); else delete next.prompts;
  if (!c.supports || !Object.keys(c.supports).length) delete next.supports;
  const examples = Object.entries(c.examples ?? {}).filter(([, v]) => v?.trim());
  if (examples.length) next.examples = Object.fromEntries(examples); else delete next.examples;
  return next;
}
