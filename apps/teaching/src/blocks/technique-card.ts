/**
 * Interactive Periodic Table technique card for annotation notes.
 * Ports the widgets detail pane (word origin, lineage, mapped connections,
 * related techniques) plus its offline learning tools (drill, write-your-own)
 * into the note a student opens. No network.
 */
import {
  familyOfTechnique,
  linksOfTechnique,
  lookupTechnique,
  siblingsOfTechnique,
  type LiteraryElementsTable,
  type LiteraryTechnique
} from '@/blocks/literary-elements';

/** Another note in the same poem that a student can jump to. */
export type TechniqueCardPoemSpot = {
  annotationId: string;
  quote: string;
  techniqueId: string;
};

export type TechniqueCardOptions = {
  /** Notes in this poem tagged with a Periodic Table technique (excluding the open one). */
  poemSpots?: TechniqueCardPoemSpot[];
  onOpenNote?: (annotationId: string) => void;
  /** Teacher preview: card facts only, no practice tools. */
  compact?: boolean;
};

const TRY_KEY_PREFIX = 'lh-technique-try:';

function readTry(id: string): string {
  try {
    return localStorage.getItem(`${TRY_KEY_PREFIX}${id}`) ?? '';
  } catch {
    return '';
  }
}

function writeTry(id: string, value: string): void {
  try {
    if (value.trim()) localStorage.setItem(`${TRY_KEY_PREFIX}${id}`, value);
    else localStorage.removeItem(`${TRY_KEY_PREFIX}${id}`);
  } catch {
    // Storage may be blocked; the draft just won't survive a reload.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function section(label: string): HTMLElement {
  const sec = el('div', 'block-annotation__element-sec');
  sec.append(el('h4', undefined, label));
  return sec;
}

/** Four-option question: which technique matches this definition? */
export function buildQuizQuestion(
  table: LiteraryElementsTable,
  answer: LiteraryTechnique,
  random: () => number = Math.random
): { answer: LiteraryTechnique; options: LiteraryTechnique[] } {
  const near = shuffle(siblingsOfTechnique(table, answer), random);
  const linked = shuffle(
    linksOfTechnique(table, answer).map((link) => link.technique),
    random
  );
  const picked: LiteraryTechnique[] = [];
  for (const tech of [...near, ...linked]) {
    if (picked.length >= 3) break;
    if (!picked.some((row) => row.id === tech.id)) picked.push(tech);
  }
  const rest = shuffle(
    table.techniques.filter(
      (tech) => tech.id !== answer.id && !picked.some((row) => row.id === tech.id)
    ),
    random
  );
  while (picked.length < 3 && rest.length > 0) picked.push(rest.shift()!);
  return { answer, options: shuffle([answer, ...picked], random) };
}

export function renderElementCard(
  start: LiteraryTechnique,
  table: LiteraryElementsTable,
  options: TechniqueCardOptions = {}
): HTMLElement {
  const card = el('section', 'block-annotation__element');
  const trail: LiteraryTechnique[] = [];
  let current = start;

  function go(next: LiteraryTechnique): void {
    trail.push(current);
    current = next;
    paint();
    card.scrollIntoView?.({ block: 'nearest' });
  }

  function back(): void {
    const prev = trail.pop();
    if (!prev) return;
    current = prev;
    paint();
  }

  function paint(): void {
    const technique = current;
    const family = familyOfTechnique(table, technique);
    const subgroup = table.subgroups.find((row) => row.id === technique.subgroup);
    card.replaceChildren();
    card.dataset.techniqueId = technique.id;
    if (family) {
      card.dataset.family = family.key;
      card.style.setProperty('--c', family.colour);
    }
    card.setAttribute('aria-label', `Technique: ${technique.name}`);

    if (trail.length > 0) {
      const backBtn = el(
        'button',
        'block-annotation__element-back',
        `← Back to ${trail[trail.length - 1]!.name}`
      );
      backBtn.type = 'button';
      backBtn.addEventListener('click', back);
      card.append(backBtn);
    }

    const head = el('div', 'block-annotation__element-head');
    const badge = el('span', 'block-annotation__element-badge');
    badge.setAttribute('aria-hidden', 'true');
    badge.append(el('span', 'block-annotation__element-symbol', technique.symbol));
    const titleWrap = el('div', 'block-annotation__element-titles');
    const name = el('p', 'block-annotation__element-name', technique.name);
    const crumbs = el('div', 'block-annotation__element-crumbs');
    if (family) {
      crumbs.append(
        el('span', 'block-annotation__element-chip block-annotation__element-chip--family', family.name)
      );
    }
    if (subgroup) crumbs.append(el('span', 'block-annotation__element-chip', subgroup.name));
    if (technique.lang && technique.lang !== 'Other') {
      crumbs.append(
        el(
          'span',
          'block-annotation__element-chip block-annotation__element-chip--lang',
          `${technique.lang} origin`
        )
      );
    }
    titleWrap.append(name, crumbs);
    head.append(badge, titleWrap);
    card.append(head);

    const facts: Array<[string, string, boolean]> = [
      ['Definition', technique.definition, false],
      ['Effect', technique.effect, false],
      ['Example', technique.example, true]
    ];
    for (const [label, value, isExample] of facts) {
      if (!value?.trim()) continue;
      const sec = section(label);
      const p = el('p', isExample ? 'block-annotation__element-example' : undefined, value);
      sec.append(p);
      card.append(sec);
    }

    if (technique.lineage?.length || technique.etymology) {
      const sec = section('Word origin');
      if (technique.lineage?.length) {
        const chain = el('ol', 'block-annotation__element-lineage');
        chain.setAttribute('aria-label', `How the word ${technique.name} developed`);
        for (const step of technique.lineage) {
          const li = el('li', 'block-annotation__element-lineage-step');
          li.append(
            el('span', 'block-annotation__element-lineage-word', step.word),
            el('span', 'block-annotation__element-lineage-lang', step.lang),
            el('span', 'block-annotation__element-lineage-meaning', step.meaning)
          );
          chain.append(li);
        }
        sec.append(chain);
      }
      if (technique.etymology) sec.append(el('p', undefined, technique.etymology));
      card.append(sec);
    }

    if (!options.compact) paintPoemSpots(technique);
    paintLinks(technique);
    if (!options.compact) paintPractice(technique);
  }

  function paintPoemSpots(technique: LiteraryTechnique): void {
    const spots = options.poemSpots ?? [];
    if (!options.onOpenNote || spots.length === 0) return;
    const family = familyOfTechnique(table, technique);
    const same = spots.filter((spot) => spot.techniqueId === technique.id);
    const kin = spots.filter((spot) => {
      if (spot.techniqueId === technique.id) return false;
      const other = lookupTechnique(table, spot.techniqueId);
      return Boolean(other && family && familyOfTechnique(table, other)?.key === family.key);
    });
    if (same.length === 0 && kin.length === 0) return;
    const sec = section('In this poem');
    sec.classList.add('block-annotation__element-poem');
    const addGroup = (label: string, rows: TechniqueCardPoemSpot[]) => {
      if (rows.length === 0) return;
      sec.append(el('p', 'block-annotation__element-hint', label));
      const list = el('div', 'block-annotation__element-spots');
      for (const spot of rows.slice(0, 8)) {
        const other = lookupTechnique(table, spot.techniqueId);
        const btn = el('button', 'block-annotation__element-spot');
        btn.type = 'button';
        btn.append(el('span', 'block-annotation__element-spot-quote', `“${spot.quote}”`));
        if (other && other.id !== technique.id) {
          btn.append(el('span', 'block-annotation__element-spot-tech', other.name));
        }
        btn.addEventListener('click', () => options.onOpenNote?.(spot.annotationId));
        list.append(btn);
      }
      sec.append(list);
    };
    addGroup(`${technique.name} also appears at:`, same);
    if (family) addGroup(`More ${family.name.toLowerCase()} techniques here:`, kin);
    card.append(sec);
  }

  function paintLinks(technique: LiteraryTechnique): void {
    const links = linksOfTechnique(table, technique);
    if (links.length === 0) return;
    const mapped = links.filter((link) => link.axis);
    const related = links.filter((link) => !link.axis);
    const sec = section('Connections');
    sec.append(
      el('p', 'block-annotation__element-hint', 'Tap one to open its card. Back returns here.')
    );
    if (mapped.length > 0) {
      const list = el('div', 'block-annotation__element-rels');
      for (const link of mapped) {
        const btn = el('button', 'block-annotation__element-rel');
        btn.type = 'button';
        btn.dataset.axis = link.axis ?? '';
        const info = el('span', 'block-annotation__element-rel-info');
        info.append(
          el('span', 'block-annotation__element-rel-name', link.technique.name),
          el('span', 'block-annotation__element-rel-axis', link.axisLabel ?? '')
        );
        btn.append(
          el('span', 'block-annotation__element-rel-sym', link.technique.symbol),
          info,
          el('span', 'block-annotation__element-rel-arrow', '›')
        );
        btn.addEventListener('click', () => go(link.technique));
        list.append(btn);
      }
      sec.append(list);
    }
    if (related.length > 0) {
      const chips = el('div', 'block-annotation__element-relchips');
      for (const link of related) {
        const chip = el('button', 'block-annotation__element-relchip', link.technique.name);
        chip.type = 'button';
        chip.addEventListener('click', () => go(link.technique));
        chips.append(chip);
      }
      sec.append(chips);
    }
    card.append(sec);
  }

  function paintPractice(technique: LiteraryTechnique): void {
    const wrap = el('div', 'block-annotation__element-practice');
    const tabs = el('div', 'block-annotation__element-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Practise this technique');
    const pane = el('div', 'block-annotation__element-pane');
    const defs: Array<{ key: 'check' | 'try'; label: string }> = [
      { key: 'check', label: 'Check yourself' },
      { key: 'try', label: 'Try it' }
    ];
    const buttons = new Map<string, HTMLButtonElement>();
    const show = (key: 'check' | 'try') => {
      for (const [k, b] of buttons) b.setAttribute('aria-selected', k === key ? 'true' : 'false');
      pane.replaceChildren(key === 'check' ? quizPane(technique) : tryPane(technique));
    };
    for (const def of defs) {
      const b = el('button', 'block-annotation__element-tab', def.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(def.key));
      buttons.set(def.key, b);
      tabs.append(b);
    }
    wrap.append(tabs, pane);
    card.append(wrap);
    show('check');
  }

  function quizPane(home: LiteraryTechnique): HTMLElement {
    const box = el('div', 'block-annotation__element-quiz');
    // Questions cycle through this technique and the ones it connects to.
    const pool = [home, ...linksOfTechnique(table, home).map((link) => link.technique)];
    let index = 0;
    let score = 0;
    let asked = 0;

    const ask = () => {
      const target = pool[index % pool.length]!;
      const { options: choices } = buildQuizQuestion(table, target);
      box.replaceChildren();
      box.append(
        el('p', 'block-annotation__element-hint', 'Which technique is this?'),
        el('p', 'block-annotation__element-quiz-def', target.definition)
      );
      const opts = el('div', 'block-annotation__element-quiz-opts');
      const feedback = el('p', 'block-annotation__element-quiz-fb');
      feedback.setAttribute('aria-live', 'polite');
      let answered = false;
      for (const choice of choices) {
        const b = el('button', 'block-annotation__element-quiz-opt', choice.name);
        b.type = 'button';
        b.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          asked += 1;
          const ok = choice.id === target.id;
          if (ok) score += 1;
          for (const other of opts.querySelectorAll<HTMLButtonElement>('button')) {
            other.disabled = true;
            if (other.textContent === target.name) other.classList.add('is-right');
          }
          if (!ok) b.classList.add('is-wrong');
          feedback.textContent = ok
            ? `Yes. ${target.effect || ''}`.trim()
            : `It was ${target.name}. ${target.example ? `For example: “${target.example}”` : ''}`.trim();
          next.hidden = false;
          tally.textContent = `${score} of ${asked}`;
        });
        opts.append(b);
      }
      const foot = el('div', 'block-annotation__element-quiz-foot');
      const tally = el('span', 'block-annotation__element-quiz-score', asked ? `${score} of ${asked}` : '');
      const next = el('button', 'block-annotation__element-quiz-next', 'Next question');
      next.type = 'button';
      next.hidden = true;
      next.addEventListener('click', () => {
        index += 1;
        ask();
      });
      foot.append(tally, next);
      box.append(opts, feedback, foot);
    };
    ask();
    return box;
  }

  function tryPane(technique: LiteraryTechnique): HTMLElement {
    const box = el('div', 'block-annotation__element-try');
    box.append(
      el(
        'p',
        'block-annotation__element-hint',
        `Write a line of your own that uses ${technique.name.toLowerCase()}. It stays on this device.`
      )
    );
    const area = el('textarea', 'block-annotation__element-try-input');
    area.rows = 3;
    area.setAttribute('aria-label', `Your ${technique.name} line`);
    area.placeholder = technique.example ? `Like: ${technique.example}` : '';
    area.value = readTry(technique.id);
    area.addEventListener('input', () => writeTry(technique.id, area.value));
    const checks = el('ul', 'block-annotation__element-try-checks');
    const prompts = [
      technique.definition && `Does your line do this: ${technique.definition.replace(/\.$/, '').toLowerCase()}?`,
      technique.effect && `Would a reader feel the effect: ${technique.effect.replace(/\.$/, '').toLowerCase()}?`,
      'Could you point to the exact words that carry it?'
    ].filter((row): row is string => Boolean(row));
    for (const text of prompts) {
      const li = el('li');
      const label = el('label');
      const box2 = el('input');
      box2.type = 'checkbox';
      label.append(box2, document.createTextNode(` ${text}`));
      li.append(label);
      checks.append(li);
    }
    box.append(area, checks);
    return box;
  }

  paint();
  return card;
}
