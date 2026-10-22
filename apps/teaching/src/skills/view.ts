import { ApiClientError } from '@/api/client';
import { loadSkills, refreshSkills } from './api';
import { RUNG_IDS, type SkillStrand, type SkillSubStrand, type SkillsContinuum } from './schema';
import './skills.css';

/** Kept across remounts of the Resource Library, so links can open a given skill. */
const state: { strand: string; sub: string; mode: 'ladder' | 'grid' } = { strand: '', sub: '', mode: 'ladder' };

/** Open the continuum at one sub-strand, `strand.sub`, on its next render. */
export function selectSkill(ref: string): void {
  const [strand, sub] = ref.split('.');
  state.strand = strand ?? '';
  state.sub = sub ?? '';
  state.mode = 'ladder';
}

export function resetSkillsViewForTests(): void {
  state.strand = '';
  state.sub = '';
  state.mode = 'ladder';
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...children: Array<Node | string | null | false>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of children) if (child) node.append(child);
  return node;
}

function button(cls: string, label: Node | string, onClick: () => void): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** The Skills continuum page inside the Resource Library. */
export function renderSkillsLibrary(host: HTMLElement): void {
  const root = h('div', 'skl');
  host.append(h('h2', 'resources-main__title', 'Skills continuum'), root);
  root.append(h('p', 'skl__status', 'Loading the skills continuum…'));
  loadSkills()
    .then((c) => {
      if (root.isConnected) paint(root, c);
    }, (error: unknown) => {
      if (!root.isConnected) return;
      root.replaceChildren(h('p', 'skl__status', error instanceof ApiClientError ? error.message : 'The skills continuum didn’t load. Try again in a moment.'));
    });
}

function paint(root: HTMLElement, c: SkillsContinuum): void {
  const strand: SkillStrand = c.strands.find((s) => s.strand === state.strand) ?? c.strands.find((s) => s.strand === 'arguing') ?? c.strands[0]!;
  const sub: SkillSubStrand = strand.sub_strands.find((s) => s.id === state.sub) ?? strand.sub_strands[0]!;
  state.strand = strand.strand;
  state.sub = sub.id;
  const repaint = (): void => paint(root, c);

  const tabs = h('div', 'skl__strands');
  tabs.setAttribute('role', 'tablist');
  for (const s of c.strands) {
    const b = button('skl__strand', s.name, () => {
      state.strand = s.strand;
      state.sub = '';
      repaint();
    });
    b.setAttribute('role', 'tab');
    b.dataset.skillStrand = s.strand;
    b.setAttribute('aria-selected', s === strand ? 'true' : 'false');
    tabs.append(b);
  }

  const pills = h('div', 'hub-pills hub-pills--loose skl__subs');
  pills.setAttribute('role', 'group');
  pills.setAttribute('aria-label', 'Sub-strand');
  for (const s of strand.sub_strands) {
    const b = button('hub-pills__btn', s.name, () => {
      state.sub = s.id;
      state.mode = 'ladder';
      repaint();
    });
    b.dataset.skillSub = s.id;
    b.setAttribute('aria-pressed', s === sub && state.mode === 'ladder' ? 'true' : 'false');
    pills.append(b);
  }
  const modes = h('div', 'skl__modes');
  for (const [mode, label] of [['ladder', 'One sub-strand'], ['grid', 'Whole strand']] as const) {
    const b = button('skl__mode', label, () => {
      state.mode = mode;
      repaint();
    });
    b.dataset.skillMode = mode;
    b.setAttribute('aria-pressed', mode === state.mode ? 'true' : 'false');
    modes.append(b);
  }
  const refresh = button('btn btn--secondary skl__refresh', 'Refresh from private repo', () => {
    refresh.disabled = true;
    refreshSkills().then((fresh) => paint(root, fresh), () => {
      refresh.disabled = false;
      refresh.textContent = 'Refresh failed. Try again';
    });
  });

  root.replaceChildren(
    tabs,
    h('p', 'skl__summary', strand.summary),
    h('div', 'skl__bar', pills, h('div', 'skl__bar-end', modes, refresh)),
    state.mode === 'grid' ? grid(c, strand) : ladder(c, sub)
  );
}

function ladder(c: SkillsContinuum, sub: SkillSubStrand): HTMLElement {
  const rungs = c.strands[0]!.rungs;
  const hsc = h('div', 'skl__hsc',
    h('span', 'skl__label', 'In the HSC'),
    h('p', '', sub.in_hsc),
    sub.example_question ? h('p', 'skl__example', h('span', 'skl__label', 'Example'), ' ', sub.example_question, sub.example_claim ? h('span', 'skl__claim', sub.example_claim) : null) : null,
    sub.example_note ? h('p', 'skl__src', sub.example_note) : null,
    h('p', 'skl__src', `Draws on ${sub.draws_on}`)
  );
  const list = h('div', 'skl__ladder');
  RUNG_IDS.forEach((id, i) => {
    const info = rungs.find((r) => r.id === id)!;
    const { i_can, indicators, build } = sub.rungs[id];
    const groups = new Map<string, HTMLElement>();
    for (const x of indicators) {
      if (!groups.has(x.group)) groups.set(x.group, h('ul', 'skl__inds'));
      groups.get(x.group)!.append(h('li', '', x.text, x.eg ? h('span', 'skl__eg', ` (e.g. ${x.eg})`) : null));
    }
    const look = groups.size ? h('div', 'skl__sec skl__look', h('span', 'skl__label', 'Look for'),
      ...[...groups].map(([g, ul]) => h('div', 'skl__group', h('span', 'skl__group-name', g), ul))) : null;
    const num = (k: number): HTMLElement => {
      const n = h('span', 'skl__num', String(k));
      n.style.setProperty('--pc', `var(--skl-p${k})`);
      return n;
    };
    const idx = new Map(build.parts.map((p, k) => [p.id, k + 1]));
    const formula = h('div', 'skl__formula');
    build.parts.forEach((p, k) => {
      if (k) formula.append(h('span', 'skl__plus', '+'));
      formula.append(h('span', 'skl__chip', num(k + 1), p.name));
    });
    const parts = h('div', 'skl__parts', ...build.parts.map((p, k) => h('div', 'skl__part', num(k + 1), h('div', '',
      h('p', '', h('b', '', `${p.name}. `), p.job),
      p.language.length ? h('p', 'skl__lang', 'Language: ', ...p.language.map((l) => h('code', '', l))) : null))));
    const built = h('p', 'skl__built');
    for (const [text, pid] of build.example) {
      if (pid && idx.has(pid)) {
        const seg = h('span', 'skl__seg', text, h('sup', '', String(idx.get(pid))));
        seg.style.setProperty('--pc', `var(--skl-p${idx.get(pid)})`);
        built.append(seg);
      } else built.append(h('span', 'skl__bg', text));
    }
    const tech = build.technique ? h('div', 'skl__tech', h('span', 'skl__label', build.technique.name), h('p', '', build.technique.how),
      h('div', 'skl__pairs', ...build.technique.pairs.flatMap(([a, z]) => [h('span', '', a), h('span', 'skl__to', '→'), h('b', '', z)]))) : null;
    const steps = build.steps ? h('div', 'skl__sec', h('span', 'skl__label', 'How to build it'), h('ol', 'skl__steps', ...build.steps.map((s) => h('li', '', s)))) : null;
    const last = i === RUNG_IDS.length - 1;
    const card = h('article', 'skl__rung',
      h('div', 'skl__rung-head', h('span', 'skl__rung-name', info.name), h('span', 'skl__meta', `${info.marks} marks`), h('span', 'skl__words', info.marker_words)),
      h('div', 'skl__col', h('div', 'skl__sec', h('span', 'skl__label', 'I can'), h('p', 'skl__ican', i_can)), look, h('div', 'skl__sec', h('span', 'skl__label', 'The build'), formula), parts, tech),
      h('div', 'skl__col', h('div', 'skl__sec', h('span', 'skl__label', 'Built'), built, h('p', 'skl__why', build.why_here)), steps,
        h('div', 'skl__sec', h('span', 'skl__label', 'Check it'), h('ul', 'skl__checks', ...build.checks.map((x) => h('li', '', x)))),
        h('div', 'skl__next', h('span', 'skl__label', last ? 'Keep refining' : 'Next move up'), h('p', '', build.next_move.replace(/^Keep refining: /, ''))))
    );
    card.style.setProperty('--c', `var(--skl-step${i + 1})`);
    card.dataset.rung = id;
    list.append(card);
  });
  return h('div', 'skl__body', hsc, list);
}

function grid(c: SkillsContinuum, strand: SkillStrand): HTMLElement {
  const rungs = c.strands[0]!.rungs;
  const table = h('table', 'skl__grid');
  table.append(h('thead', '', h('tr', '', h('th', '', 'Sub-strand'), ...rungs.map((r) => h('th', '', r.name, h('small', '', r.marks))))));
  const body = h('tbody');
  for (const s of strand.sub_strands) {
    const name = button('skl__grid-name', s.name, () => {
      state.sub = s.id;
      state.mode = 'ladder';
      const root = table.closest<HTMLElement>('.skl');
      if (root) paint(root, c);
    });
    body.append(h('tr', '', h('th', '', name), ...RUNG_IDS.map((id) => h('td', '', s.rungs[id].i_can))));
  }
  table.append(body);
  return h('div', 'skl__grid-wrap', table);
}
