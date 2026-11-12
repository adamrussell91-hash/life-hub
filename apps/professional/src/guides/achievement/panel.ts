// The Achievement guide panel: (who) → context and depth → four questions, each with a dig when it
// comes up weak → can't, or won't? when it matters → their turn (optional) → your read → the plan.
// Adam drives; nothing is kept until Save. Same shell as the Guides panel; full screen on a phone.
import { recentContexts, runsFor, historyFor, type PlacedRun } from '../runs';
import type { GuideRun, Tap } from '../types';
import { ACHIEVEMENT_EMBLEM } from './icons';
import {
  ACHIEVEMENT_ID, ACHIEVEMENT_NAME, AREA, AREA_IDS, MOVES, PROFILES, PROFILE_IDS, TAP_LABELS,
  againDate, askedAreas, currentValues, emptyState, leadArea, leadMoves, mismatches, movesFor,
  pairingAdvised, path, profileFor, question, stateFromRun, suggested, theirScaled, toRun, weakTap,
  type AchievementState, type Again, type AreaId, type Mode, type Step
} from './model';
import { createStream } from './stream';

export interface AchievementSaveExtras {
  /** A new look-again date (YYYY-MM-DD) when this save set one; null otherwise. */
  lookAgain: string | null;
}

export interface AchievementPanelOptions {
  about: Array<{ ref: string; name: string }>;
  placedRuns: () => Promise<PlacedRun[]>;
  onSave: (run: GuideRun, extras: AchievementSaveExtras) => Promise<void>;
  edit?: GuideRun;
  now?: () => string;
  newId?: () => string;
}

const AGAIN: Array<[Again, string]> = [['2w', '2 weeks'], ['4w', '4 weeks'], ['6w', '6 weeks'], ['none', 'Not now']];
const MAX_TEXT = 300;

export function openAchievementPanel(doc: Document, options: AchievementPanelOptions): { el: HTMLElement; close(): void } {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => `guide_${crypto.randomUUID()}`);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, className: string, part?: string) => {
    const b = el('button', className, label);
    b.type = 'button';
    if (part) b.dataset.part = part;
    return b;
  };
  const pressed = (b: HTMLElement, on: boolean) => b.setAttribute('aria-pressed', String(on));
  const emblem = () => {
    const span = el('span', 'guide-emblem');
    span.innerHTML = ACHIEVEMENT_EMBLEM; // a constant, never user text
    return span;
  };

  const panel = el('aside', 'guide-panel guide achv');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Achievement guide');
  const head = el('div', 'guide-panel__head');
  const closeBtn = button('✕', 'btn btn--ghost', 'guide-close');
  closeBtn.setAttribute('aria-label', 'Close the guide');
  head.append(el('b', undefined, 'Guides'), closeBtn);
  const body = el('div', 'guide-panel__body');
  const sheet = el('div', 'achv-sheet');
  sheet.hidden = true;
  panel.append(head, body, sheet);
  doc.body.append(panel);

  const editing = options.edit ?? null;
  let s: AchievementState = editing ? stateFromRun(editing) : emptyState();
  let who: { ref: string; name: string } | null = editing ? { ref: editing.person_ref, name: editing.person_name } : null;
  let placed: PlacedRun[] = [];
  let step: Step | 'who' = 'context';
  let lastShown: Step | 'who' | null = null;
  let againTouched = false;
  let closed = false;
  const opener = doc.activeElement as HTMLElement | null;

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const active = doc.activeElement;
    if (active instanceof HTMLInputElement && active.value) return;
    if (!sheet.hidden) return closeSheet();
    close();
  };
  function close(): void {
    if (closed) return;
    closed = true;
    panel.remove();
    doc.removeEventListener('keydown', onKey);
    doc.defaultView?.removeEventListener('hashchange', close);
    if (opener && doc.contains(opener)) opener.focus();
  }
  doc.addEventListener('keydown', onKey);
  doc.defaultView?.addEventListener('hashchange', close);
  closeBtn.addEventListener('click', close);

  function focusScreen(): void {
    const target = body.querySelector<HTMLElement>('[tabindex="-1"]') ?? body.querySelector<HTMLElement>('button:not([disabled])');
    target?.focus();
  }

  const subtitle = () => (who ? `${who.name}${s.context ? ` · ${s.context}` : ''}` : '');
  function top(title = ACHIEVEMENT_NAME): HTMLElement {
    const row = el('div', 'guide-step__top');
    const words = el('div');
    const t = el('div', 'guide-step__title', title);
    t.tabIndex = -1;
    words.append(t, el('div', 'guide-step__who', subtitle()));
    row.append(emblem(), words);
    return row;
  }

  function progress(): HTMLElement {
    const steps = path(s);
    const at = steps.indexOf(step as Step);
    const bar = el('div', 'achv-progress');
    bar.setAttribute('aria-label', `Step ${Math.max(1, at + 1)} of ${steps.length}`);
    steps.forEach((st, i) => {
      const area = st.includes(':') ? AREA[st.split(':')[1] as AreaId] : st === 'check' ? AREA.efficacy : null;
      const branch = st.startsWith('dig:') || st === 'check';
      const seg = el('i', [branch ? 'is-branch' : '', i < at ? 'is-done' : '', i === at ? 'is-now' : ''].filter(Boolean).join(' '));
      if (area) seg.style.setProperty('--a', area.colour);
      bar.append(seg);
    });
    return bar;
  }

  function nav(back: { label: string; run: () => void }, next: { label: string; run: () => void; part?: string; disabled?: boolean }): HTMLElement {
    const row = el('div', 'guide-nav');
    const b = button(back.label, 'btn btn--ghost', 'achv-back');
    b.addEventListener('click', back.run);
    const n = button(next.label, 'btn btn--primary', next.part ?? 'achv-next');
    n.disabled = !!next.disabled;
    n.addEventListener('click', next.run);
    row.append(b, n);
    return row;
  }

  function go(next: Step | 'who'): void {
    step = next;
    render();
  }
  function forward(): void {
    const steps = path(s);
    const i = steps.indexOf(step as Step);
    go(steps[Math.min(steps.length - 1, i + 1)]!);
  }
  function backward(): void {
    const steps = path(s);
    const i = steps.indexOf(step as Step);
    if (i <= 0) return go(options.about.length > 1 && !editing ? 'who' : 'context');
    go(steps[i - 1]!);
  }

  function areaTag(k: AreaId, label: string, small?: string): HTMLElement {
    const tag = el('span', `achv-tag achv-a--${k}`);
    tag.append(el('i', 'achv-sw'), doc.createTextNode(label));
    if (small) tag.append(el('small', undefined, small));
    return tag;
  }

  /* ---- Screens ---- */
  function pickWho(): void {
    body.replaceChildren(top(), el('p', 'guide-hint', 'Who is this about?'));
    for (const person of options.about) {
      const b = button(person.name, 'guide-about');
      b.dataset.about = person.ref;
      b.addEventListener('click', () => {
        who = person;
        go('context');
      });
      body.append(b);
    }
  }

  function context(): void {
    const card = el('div', 'guide-prompt');
    card.append(el('div', 'guide-prompt__ask', 'What’s this about?'), el('p', 'guide-hint', 'One subject or task at a time. Run it again for another.'));
    const input = el('input', 'guide-input');
    input.name = 'context';
    input.placeholder = 'English · viva voce';
    input.maxLength = 120;
    input.setAttribute('aria-label', 'What this is about');
    input.value = s.context;
    card.append(input);
    const used = who ? recentContexts(runsFor(placed, who.ref, who.name).filter((p) => p.run.guide === ACHIEVEMENT_ID)) : [];
    if (used.length) {
      card.append(el('div', 'guide-listen__h', `Used before with ${who!.name}`));
      const chips = el('div', 'guide-chips');
      for (const c of used) {
        const chip = button(c, 'guide-chip');
        chip.addEventListener('click', () => {
          input.value = c;
          input.dispatchEvent(new Event('input'));
        });
        chips.append(chip);
      }
      card.append(chips);
    }
    const modes = el('div', 'achv-modes');
    const modeRow = (id: Mode, name: string, line: string) => {
      const b = button('', 'achv-mode');
      b.dataset.mode = id;
      pressed(b, s.mode === id);
      const words = el('span');
      words.append(el('b', undefined, name), el('span', undefined, line));
      b.append(el('i', 'achv-mode__dot'), words);
      b.addEventListener('click', () => {
        s.mode = id;
        render();
      });
      return b;
    };
    modes.append(
      modeRow('quick', 'Quick read', 'Four questions, one per area. Dig anywhere with one tap.'),
      modeRow('full', 'Full', 'Four questions, then a dig into each weak one.'),
      modeRow('one', 'One area', 'Just the part that came up.')
    );
    const areaPick = el('div', 'achv-areapick');
    if (s.mode === 'one') {
      for (const k of AREA_IDS) {
        const b = button('', `achv-areabtn achv-a--${k}`);
        b.dataset.area = k;
        pressed(b, s.one === k);
        b.append(el('i', 'achv-sw'), doc.createTextNode(question(AREA[k])));
        b.addEventListener('click', () => {
          s.one = k;
          render();
        });
        areaPick.append(b);
      }
    }
    const their = button('', 'achv-switch', 'achv-their-on');
    pressed(their, s.theirOn);
    const tw = el('span');
    tw.append(el('b', undefined, 'Their turn at the end'), el('span', undefined, 'Hand over the device and they rate the four themselves.'));
    their.append(el('i', 'achv-switch__knob'), tw);
    their.addEventListener('click', () => {
      s.theirOn = !s.theirOn;
      render();
    });
    const go_ = nav(
      { label: 'Cancel', run: close },
      {
        label: 'Start ›', part: 'achv-start', disabled: !s.context.trim(),
        run: () => {
          s.context = input.value.trim();
          go(path(s)[1]!);
        }
      }
    );
    input.addEventListener('input', () => {
      s.context = input.value;
      (go_.querySelector('[data-part="achv-start"]') as HTMLButtonElement).disabled = !input.value.trim();
    });
    body.replaceChildren(top(), progress(), card, el('div', 'guide-listen__h', 'How deep?'), modes, areaPick, their, go_);
    if (!areaPick.childElementCount) areaPick.remove();
    focusScreen();
    if (!s.context) input.focus();
  }

  function gate(k: AreaId): void {
    const a = AREA[k];
    const asked = askedAreas(s);
    const card = el('div', `guide-prompt achv-a--${k}`);
    const sounds = el('div', 'achv-sounds');
    const list = (title: string, lines: string[], kind: 'solid' | 'shaky') => {
      const box = el('div', `achv-sounds__${kind}`);
      box.append(el('h5', undefined, title));
      const ul = el('ul');
      for (const line of lines) ul.append(el('li', undefined, `“${line}”`));
      box.append(ul);
      return box;
    };
    sounds.append(list('Sounds solid', a.solid, 'solid'), list('Sounds shaky', a.shaky, 'shaky'));
    const alt = el('p', 'achv-alt');
    alt.append(el('b', undefined, 'Or try: '), doc.createTextNode(`“${a.alt}”`));
    card.append(areaTag(k, `${asked.indexOf(k) + 1} of ${asked.length} · ${question(a)}`, a.theory), el('div', 'guide-prompt__ask', `“${a.ask}”`), alt, el('p', 'guide-hint', a.hint), sounds);

    const taps = el('div', `guide-taps achv-taps achv-a--${k}`);
    taps.setAttribute('role', 'group');
    taps.setAttribute('aria-label', `How solid is ${question(a)}`);
    TAP_LABELS.forEach((label, tap) => {
      const b = button('', 'guide-tap achv-tap');
      b.dataset.tap = String(tap);
      pressed(b, s.taps[k] === tap);
      const ri = el('span', 'achv-tap__ri');
      const bar = el('i');
      bar.style.height = `${[2, 5, 9, 13][tap]}px`;
      ri.append(bar);
      b.append(ri, doc.createTextNode(label));
      b.addEventListener('click', () => {
        s.taps[k] = tap as Tap;
        s.touched[k] = false;
        if (tap > 1) s.forceDig[k] = false;
        render();
      });
      taps.append(b);
    });

    let fork: HTMLElement | null = null;
    if (s.mode === 'quick' && weakTap(s, k)) {
      fork = button(s.forceDig[k] ? 'Digging into why: it opens next' : '↳ Dig into why', `achv-fork achv-a--${k}`, 'achv-dig');
      pressed(fork, !!s.forceDig[k]);
      fork.addEventListener('click', () => {
        s.forceDig[k] = !s.forceDig[k];
        render();
      });
    } else if (s.mode === 'full' && weakTap(s, k)) {
      fork = el('p', `achv-forknote achv-a--${k}`, '↳ You will dig into this next.');
    }
    const quote = el('input', 'guide-input guide-quote');
    quote.name = 'quote';
    quote.maxLength = MAX_TEXT;
    quote.placeholder = '❝ Their words, if you caught them (optional)';
    quote.setAttribute('aria-label', 'Their words');
    quote.value = s.quotes[k] ?? '';
    quote.addEventListener('input', () => {
      s.quotes[k] = quote.value;
    });
    body.replaceChildren(top(), progress(), card, taps, ...(fork ? [fork] : []), quote,
      nav({ label: '‹ Back', run: backward }, { label: 'Next ›', run: forward, disabled: s.taps[k] == null }));
    focusScreen();
  }

  function dig(k: AreaId): void {
    const a = AREA[k];
    const card = el('div', `guide-prompt achv-branch achv-a--${k}`);
    card.append(areaTag(k, `↳ Dig · ${question(a)}`), el('div', 'guide-prompt__ask', a.digAsk), el('p', 'guide-hint', a.digHint));
    const opts = el('div', 'achv-opts');
    for (const d of a.digs) {
      const b = button('', 'achv-opt');
      b.dataset.dig = d.id;
      pressed(b, s.digs[k].includes(d.id));
      const words = el('span');
      words.append(el('b', undefined, d.name), el('q', undefined, d.example), el('small', undefined, d.theory));
      b.append(el('i', 'achv-opt__box'), words);
      b.addEventListener('click', () => {
        s.digs[k] = s.digs[k].includes(d.id) ? s.digs[k].filter((x) => x !== d.id) : [...s.digs[k], d.id];
        render();
      });
      opts.append(b);
    }
    card.append(opts);
    const opened = [...new Set(s.digs[k].flatMap((id) => a.digs.find((d) => d.id === id)?.moves ?? []))];
    if (opened.length) card.append(el('p', 'achv-opens', `Opens ${opened.length} move${opened.length === 1 ? '' : 's'} for the plan.`));
    if (k === 'value' && s.digs.value.includes('cost')) card.append(el('p', 'achv-forknote achv-a--efficacy', '↳ Cost can hide doubt. A quick check opens after Can I?.'));
    body.replaceChildren(top(), progress(), card, nav({ label: '‹ Back', run: backward }, { label: 'Next ›', run: forward }));
    focusScreen();
  }

  function check(): void {
    const card = el('div', 'guide-check achv-branch achv-a--efficacy');
    const tag = el('span', 'achv-tag');
    tag.append(el('i', 'achv-sw achv-sw--split'), doc.createTextNode('Getting the call right'));
    card.append(tag, el('h4', undefined, 'Can’t, or won’t?'),
      el('p', 'guide-hint', 'Worth it and Can I both came up weak. A student who doubts they can do well may say it is pointless, which protects how able they look. Check which one is driving it.'));
    const probe = (key: 'want' | 'hold', ask: string, options: Array<['yes' | 'no', string]>) => {
      const block = el('div', 'guide-probe');
      block.append(el('p', undefined, `“${ask}”`));
      const two = el('div', 'guide-two');
      for (const [id, label] of options) {
        const b = button(label, 'guide-tap achv-tap');
        b.dataset.probe = key;
        b.dataset.option = id;
        pressed(b, s.checks[key] === id);
        b.addEventListener('click', () => {
          s.checks[key] = id;
          s.touched.value = false;
          render();
        });
        two.append(b);
      }
      block.append(two);
      return block;
    };
    card.append(
      probe('want', 'If you knew you’d do well at it, would you want to do it?', [['no', 'No, still not'], ['yes', 'Yes, then I would']]),
      probe('hold', 'Do you ever not try properly, so if it goes badly it doesn’t really count?', [['no', 'No'], ['yes', 'Yes, sometimes']])
    );
    if (s.checks.want) {
      card.append(el('p', 'achv-nudge', s.checks.want === 'yes'
        ? 'Worth it moved up three in the suggestion. The doubt is doing the work, so Can I is the place to start.'
        : 'The suggestion stays. The worth really is low for now.'));
    }
    if (s.checks.hold === 'yes') {
      const side = el('div', 'achv-side');
      const words = el('div');
      words.append(el('b', undefined, 'Perfectionism side card'), el('span', undefined, 'Holding back so a bad result doesn’t count can be fear of falling short.'));
      const open = button('Open', 'btn btn--secondary', 'achv-perfection');
      open.addEventListener('click', openPerfection);
      side.append(words, open);
      card.append(side);
    }
    body.replaceChildren(top(), progress(), card, nav({ label: 'Skip', run: forward }, { label: 'Next ›', run: forward }));
    focusScreen();
  }

  function openPerfection(): void {
    const inner = el('div', 'achv-sheet__inner');
    inner.setAttribute('role', 'dialog');
    inner.setAttribute('aria-label', 'Perfectionism side card');
    const title = el('b', undefined, 'Perfectionism · side card');
    title.tabIndex = -1;
    inner.append(title, el('p', 'guide-hint', 'Three questions to ask. Not a screen, not a diagnosis.'));
    const q = (ask: string, why: string) => {
      const block = el('div', 'guide-probe');
      block.append(el('p', undefined, ask), el('p', 'guide-hint', why));
      return block;
    };
    inner.append(
      q('“How far is your work from where you think it should be?”', 'A big gap between their standard and how they see their work is the part that hurts (the discrepancy in the Almost Perfect Scale).'),
      q('“Do you feel other people expect it to be perfect?”', 'Pressure they feel from others, rather than standards they own, is the riskier kind (socially prescribed perfectionism).'),
      q('“When it matters, do you put off starting, or leave it too late to do well?”', 'Holding back effort protects how able they look (self-handicapping).'),
      el('p', 'achv-diff', 'If any of this sounds like real distress, stop here and open Check-in from the Guides shelf.')
    );
    const back = button('Back to the guide', 'btn btn--primary', 'achv-sheet-close');
    back.addEventListener('click', closeSheet);
    inner.append(back);
    sheet.replaceChildren(inner);
    sheet.hidden = false;
    title.focus();
  }
  function closeSheet(): void {
    sheet.hidden = true;
    sheet.replaceChildren();
    body.querySelector<HTMLElement>('[data-part="achv-perfection"]')?.focus();
  }

  function their(): void {
    const wrap = el('div', 'achv-their');
    wrap.append(el('p', 'guide-hint', `Your turn · ${s.context}`), el('h3', undefined, 'How true is each of these for you?'));
    for (const k of askedAreas(s)) {
      const box = el('div', 'achv-stmt');
      box.append(el('p', undefined, AREA[k].their));
      const row = el('div', 'achv-dots5');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', AREA[k].their);
      for (let r = 1; r <= 5; r++) {
        const b = button('', 'achv-dot');
        b.dataset.their = k;
        b.dataset.rating = String(r);
        b.setAttribute('aria-label', `${r} of 5`);
        pressed(b, s.their[k] === r);
        const dot = el('i');
        dot.style.width = dot.style.height = `${8 + (r - 1) * 3}px`;
        b.append(dot);
        b.addEventListener('click', () => {
          s.their[k] = r;
          render();
        });
        row.append(b);
      }
      const ends = el('div', 'achv-ends');
      ends.append(el('span', undefined, 'Not at all'), el('span', undefined, 'Totally'));
      box.append(row, ends);
      wrap.append(box);
    }
    wrap.append(el('p', 'guide-hint', 'There are no right answers. Your teacher sees these next to their own notes.'));
    body.replaceChildren(wrap, nav({ label: '‹ Back', run: backward }, { label: 'Hand back ›', run: forward }));
    focusScreen();
  }

  function read(): void {
    const v = currentValues(s);
    const sug = suggested(s);
    const prof = () => s.profile ?? profileFor(currentValues(s));
    const history = editing ? historyFor(placed, editing, 1)[0]?.values ?? null : null;
    const stream = createStream(doc, v, { pin: s.profile ?? undefined, enter: lastShown !== 'read', ghost: history });
    const key = el('p', 'achv-key', 'Streams: your read, 0 to 10 · Channel: held back by the narrowest stream · Gate: how well they run it');
    if (Object.keys(s.their).length) key.append(doc.createTextNode(' · ○ their own rating'));
    const sliders = el('div', 'achv-sliders');
    const diffBox = el('p', 'achv-diff');
    diffBox.setAttribute('role', 'status');
    const reads = el('div', 'achv-reads');
    const paintReads = () => {
      const values = currentValues(s);
      const id = prof();
      const p = PROFILES[id];
      const lead = leadArea(id);
      reads.className = `achv-reads${lead ? ` achv-a--${lead}` : ''}`;
      const words = el('div');
      words.append(el('div', 'achv-reads__k', 'Reads as'), el('div', 'achv-reads__name', p.name), el('div', 'achv-reads__line', p.line));
      const select = el('select', 'achv-reads__pick');
      select.setAttribute('aria-label', 'Change the read');
      for (const pid of PROFILE_IDS) {
        const o = el('option', undefined, PROFILES[pid].name);
        o.value = pid;
        o.selected = pid === id;
        select.append(o);
      }
      select.addEventListener('change', () => {
        s.profile = select.value === profileFor(currentValues(s)) ? null : (select.value as typeof id);
        stream.set(currentValues(s), { pin: prof(), animate: false });
        paintReads();
      });
      reads.replaceChildren(words, select);
      const diffs = mismatches(values, s.their);
      diffBox.hidden = !diffs.length;
      diffBox.textContent = diffs.length ? `You and ${who?.name.split(' ')[0] ?? 'they'} see ${diffs.map((k) => AREA[k].short).join(' and ')} differently. Ask about it before you plan.` : '';
    };
    for (const k of AREA_IDS) {
      const asked = v[k] != null;
      const row = el('div', `achv-sl achv-a--${k}${asked ? '' : ' is-off'}`);
      const label = el('label', 'achv-sl__label');
      const inputId = `achv-sl-${k}`;
      label.htmlFor = inputId;
      label.append(el('i', 'achv-sw'), doc.createTextNode(AREA[k].short));
      const out = el('output', 'achv-sl__out', asked ? String(v[k]) : '·');
      const track = el('div', 'achv-sl__track');
      const input = el('input');
      input.type = 'range';
      input.id = inputId;
      input.min = '0';
      input.max = '10';
      input.step = '1';
      input.value = String(v[k] ?? 0);
      input.disabled = !asked;
      input.dataset.area = k;
      input.style.setProperty('--p', `${(v[k] ?? 0) * 10}%`);
      input.addEventListener('input', () => {
        const n = Number(input.value);
        s.values[k] = n;
        s.touched[k] = true;
        s.profile = null;
        input.style.setProperty('--p', `${n * 10}%`);
        out.textContent = String(n);
        stream.set(currentValues(s));
        paintReads();
      });
      track.append(input);
      if (asked && sug[k] != null) {
        const mark = el('span', 'achv-sl__sug');
        mark.style.left = `calc(10px + ${sug[k]! / 10} * (100% - 20px))`;
        mark.title = `Suggested from your tap: ${sug[k]}`;
        track.append(mark);
      }
      if (asked && s.their[k] != null) {
        const mark = el('span', 'achv-sl__them');
        mark.style.left = `calc(10px + ${theirScaled(s.their[k]!) / 10} * (100% - 20px))`;
        mark.title = `Their own rating: ${s.their[k]} of 5`;
        track.append(mark);
      }
      row.append(label, track, out);
      sliders.append(row);
    }
    paintReads();
    body.replaceChildren(top('Your read'), progress(), el('p', 'guide-hint', 'The widths start at your taps (dotted marks). Drag to your call. Only what you save is kept.'),
      stream.el, key, sliders, diffBox, reads, nav({ label: '‹ Back', run: backward }, { label: 'Plan ›', run: forward, part: 'achv-plan' }));
    focusScreen();
  }

  let errorEl: HTMLElement | null = null;
  function plan(): void {
    const v = currentValues(s);
    const id = s.profile ?? profileFor(v);
    const p = PROFILES[id];
    const lead = leadArea(id);
    s.chosen = s.chosen.filter((m) => MOVES[m]);
    const moveBtn = (mid: string) => {
      const m = MOVES[mid]!;
      const on = s.chosen.includes(mid);
      const b = button('', `achv-move${m.area ? ` achv-a--${m.area}` : ''}`);
      b.dataset.move = mid;
      pressed(b, on);
      b.disabled = !on && s.chosen.length >= 2;
      const words = el('span');
      words.append(doc.createTextNode(m.text), el('small', undefined, m.source));
      b.append(el('i', 'achv-move__box'), words);
      b.addEventListener('click', () => {
        s.chosen = on ? s.chosen.filter((x) => x !== mid) : [...s.chosen, mid];
        render();
      });
      return b;
    };
    const head_ = el('div', `achv-start${lead ? ` achv-a--${lead}` : ''}`);
    const title = el('div', 'achv-start__title');
    if (lead) title.append(el('i', 'achv-sw'));
    title.append(doc.createTextNode(lead ? `Start with ${AREA[lead].short}` : p.name));
    head_.append(title, el('p', 'guide-hint', p.line));
    const leadList = el('div', 'achv-moves');
    for (const mid of leadMoves(s, id)) leadList.append(moveBtn(mid));
    const parts: HTMLElement[] = [top('The plan'), progress(), head_, leadList,
      el('p', 'guide-hint', s.chosen.length >= 2 ? 'Two is plenty. Untick one to swap.' : 'Pick one or two. Small beats many.')];
    if (pairingAdvised(id)) {
      parts.push(el('p', 'achv-diff', 'In the intervention study, plans aimed at value or the setting moved grades most, and ones aimed at belief or self-management moved them least. Make one of your two a move from another area below.'));
    }
    const others = AREA_IDS.filter((k) => k !== lead && v[k] != null);
    if (others.length) {
      const more = el('details', 'achv-more');
      more.open = pairingAdvised(id);
      more.append(el('summary', undefined, 'Moves for the other areas'));
      const list = el('div', 'achv-moves');
      for (const mid of [...new Set(others.flatMap((k) => movesFor(s, k)))]) list.append(moveBtn(mid));
      more.append(list);
      parts.push(more);
    }
    const next = el('input', 'guide-input');
    next.name = 'next';
    next.maxLength = MAX_TEXT;
    next.placeholder = 'When I get home Tuesday, I will…';
    next.setAttribute('aria-label', 'Their next step, in their words');
    next.value = s.next;
    next.addEventListener('input', () => {
      s.next = next.value;
    });
    parts.push(el('div', 'guide-listen__h', 'Their next step, in their words'), next,
      el('p', 'guide-hint', 'Plans written as “When…, I will…” have a medium-to-large effect on follow-through (implementation intentions).'));
    const pills = el('div', 'achv-pills');
    pills.setAttribute('role', 'group');
    pills.setAttribute('aria-label', 'Look again in');
    for (const [aid, label] of AGAIN) {
      const b = button(label, 'achv-pill');
      b.dataset.again = aid;
      pressed(b, s.again === aid);
      b.addEventListener('click', () => {
        s.again = aid;
        againTouched = true;
        render();
      });
      pills.append(b);
    }
    const when = (() => {
      if (!againTouched && s.againDate) return `A look-again task is already set for ${shortDay(s.againDate)}.`;
      const date = againDate(s.again, new Date(now()));
      return date ? `Adds a task for ${shortDay(date)}. Running it again shows whether the narrow stream widened.` : 'No reminder.';
    })();
    parts.push(el('div', 'guide-listen__h', 'Look again in'), pills, el('p', 'guide-hint', when));
    const save = button(editing ? 'Save changes' : 'Save to meeting', 'btn btn--primary', 'achv-save');
    const row = el('div', 'guide-nav');
    const back = button('‹ Back', 'btn btn--ghost', 'achv-back');
    back.addEventListener('click', backward);
    row.append(back, save);
    save.addEventListener('click', async () => {
      save.disabled = true;
      const stamp = now();
      const fresh = againTouched || !s.againDate ? againDate(s.again, new Date(stamp)) : null;
      if (againTouched || !s.againDate) s.againDate = fresh;
      const run = toRun(s, {
        id: editing?.id ?? newId(),
        person_ref: who!.ref,
        person_name: who!.name,
        created_at: editing?.created_at ?? stamp,
        updated_at: stamp
      });
      try {
        await options.onSave(run, { lookAgain: fresh });
        close();
      } catch {
        save.disabled = false;
        if (!errorEl) {
          errorEl = el('p', 'guide-panel__error', 'Could not save. Try again.');
          errorEl.setAttribute('role', 'alert');
        }
        if (!errorEl.isConnected) body.append(errorEl);
      }
    });
    parts.push(row);
    body.replaceChildren(...parts);
    focusScreen();
  }

  function shortDay(ymd: string): string {
    const d = new Date(`${ymd}T00:00:00`);
    return Number.isNaN(d.getTime()) ? ymd : new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(d);
  }

  function render(): void {
    if (closed) return;
    if (step !== 'who' && !path(s).includes(step)) step = 'read';
    if (step === 'who') pickWho();
    else if (step === 'context') context();
    else if (step === 'check') check();
    else if (step === 'their') their();
    else if (step === 'read') read();
    else if (step === 'plan') plan();
    else {
      const [kind, k] = step.split(':') as ['gate' | 'dig', AreaId];
      if (kind === 'gate') gate(k);
      else dig(k);
    }
    lastShown = step;
  }

  if (!editing && !options.about.length) {
    body.append(el('p', 'guide-panel__empty', 'Add them to In the room first, then run a guide about them.'));
    return { el: panel, close };
  }
  void options.placedRuns().catch(() => [] as PlacedRun[]).then((list) => {
    if (closed) return;
    placed = list;
    if (editing) go('read');
    else if (options.about.length === 1) {
      who = options.about[0]!;
      go('context');
    } else go('who');
  });
  return { el: panel, close };
}

