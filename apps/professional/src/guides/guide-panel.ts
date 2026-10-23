// The Guides side panel: shelf → (who) → context → one card per prompt → check (when needed) →
// set the mix → Save. Adam drives; nothing is kept until Save. Full screen on a phone (guides.css).
import { createContinuumChart, type ContinuumChart } from './continuum-chart';
import { emblemEl } from './guide-card';
import { historyFor, newRun, recentContexts, runsFor, type PlacedRun } from './runs';
import type { GuideDefinition, GuideRun, Tap } from './types';

export interface GuidePanelOptions {
  guides: GuideDefinition[];
  /** People this run can be about: students in the room first (the caller decides). */
  about: Array<{ ref: string; name: string }>;
  placedRuns: () => Promise<PlacedRun[]>;
  onSave: (run: GuideRun) => Promise<void>;
  /** Editing a saved run opens straight on the mix. */
  edit?: { guide: GuideDefinition; run: GuideRun };
  now?: () => string;
  newId?: () => string;
}

const TAP_LABELS = ['Not at all', 'A bit', 'Quite a lot', 'Very much'];

export function openGuidePanel(doc: Document, options: GuidePanelOptions): { el: HTMLElement; close(): void } {
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

  const panel = el('aside', 'guide-panel guide');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Guides');
  const head = el('div', 'guide-panel__head');
  const closeBtn = button('✕', 'btn btn--ghost', 'guide-close');
  closeBtn.setAttribute('aria-label', 'Close guides');
  head.append(el('b', undefined, 'Guides'), closeBtn);
  const body = el('div', 'guide-panel__body');
  panel.append(head, body);
  doc.body.append(panel);

  let guide: GuideDefinition | null = null;
  let who: { ref: string; name: string } | null = null;
  let run: GuideRun | null = null;
  let placed: PlacedRun[] = [];
  let chart: ContinuumChart | null = null;
  /** Quotes typed on each prompt card, by prompt index; saved runs being edited seed from 100 up. */
  const quoteByPrompt = new Map<number, string>();

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  function close(): void {
    panel.remove();
    doc.removeEventListener('keydown', onKey);
  }
  doc.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', close);

  function top(subtitle: string): HTMLElement {
    const row = el('div', 'guide-step__top');
    const text = el('div');
    text.append(el('div', 'guide-step__title', guide!.name), el('div', 'guide-step__who', subtitle));
    row.append(emblemEl(doc, guide!), text);
    return row;
  }

  function progress(at: number): HTMLElement {
    const total = guide!.prompts.length + 3; // context, prompts, check, mix
    const bar = el('div', 'guide-progress');
    for (let i = 0; i < total; i++) bar.append(el('i', i < at ? 'is-done' : i === at ? 'is-now' : undefined));
    return bar;
  }

  function shelf(): void {
    body.replaceChildren();
    if (!options.about.length) {
      body.append(el('p', 'guide-panel__empty', 'Add them to In the room first, then run a guide about them.'));
    } else if (options.about.length === 1) {
      body.append(el('p', 'guide-panel__about', `About ${options.about[0]!.name}`));
    }
    for (const g of options.guides) {
      const card = button('', 'guide-shelf-card');
      card.dataset.guide = g.id;
      card.disabled = !options.about.length;
      const words = el('div');
      words.append(el('b', undefined, g.name), el('span', undefined, g.line));
      card.append(emblemEl(doc, g), words);
      card.addEventListener('click', async () => {
        guide = g;
        placed = await options.placedRuns().catch(() => []);
        if (options.about.length === 1) {
          who = options.about[0]!;
          context();
        } else {
          pickWho();
        }
      });
      body.append(card);
    }
  }

  function pickWho(): void {
    body.replaceChildren(top('Who is this about?'));
    for (const person of options.about) {
      const b = button(person.name, 'guide-about');
      b.dataset.about = person.ref;
      b.addEventListener('click', () => {
        who = person;
        context();
      });
      body.append(b);
    }
  }

  function context(): void {
    body.replaceChildren(top(`About ${who!.name}`), progress(0));
    const card = el('div', 'guide-prompt');
    card.append(el('div', 'guide-prompt__ask', 'What’s this about?'), el('div', 'guide-hint', 'One area at a time. Run it again for another.'));
    const input = el('input', 'guide-input');
    input.name = 'context';
    input.placeholder = 'English · essays';
    input.setAttribute('aria-label', 'What this is about');
    card.append(input);
    const used = recentContexts(runsFor(placed, who!.ref, who!.name).filter((p) => p.run.guide === guide!.id));
    if (used.length) {
      card.append(el('div', 'guide-hint', `Used before with ${who!.name}`));
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
    const start = button('Start ›', 'btn btn--primary', 'guide-start');
    start.disabled = true;
    input.addEventListener('input', () => {
      start.disabled = !input.value.trim();
    });
    start.addEventListener('click', () => {
      run = newRun({ guide: guide!.id, personRef: who!.ref, personName: who!.name, context: input.value, now: now(), id: newId() });
      prompt(0);
    });
    const nav = el('div', 'guide-nav');
    const cancel = button('Cancel', 'btn btn--ghost');
    cancel.addEventListener('click', close);
    nav.append(cancel, start);
    body.append(card, el('p', 'guide-hint', 'Ask each question in your own words, then set the mix yourself.'), nav);
    input.focus();
  }

  function prompt(index: number): void {
    const p = guide!.prompts[index]!;
    const scale = guide!.scales.find((s) => s.id === p.scale)!;
    body.replaceChildren(top(`${who!.name} · ${run!.context}`), progress(index + 1));
    const card = el('div', `guide-prompt guide-zone--${scale.zone}`);
    card.append(
      el('span', 'guide-type', `${index + 1} of ${guide!.prompts.length} · ${scale.label}`),
      el('div', 'guide-prompt__ask', `“${p.ask}”`),
      el('div', 'guide-hint', p.hint),
      el('div', 'guide-listen__h', 'Sounds like')
    );
    const list = el('ul', 'guide-listen');
    for (const line of p.listenFor) list.append(el('li', undefined, `“${line}”`));
    card.append(list);

    const taps = el('div', 'guide-taps');
    const paintTaps = () => {
      for (const b of taps.querySelectorAll<HTMLButtonElement>('[data-tap]')) {
        const on = run!.taps[p.scale] === Number(b.dataset.tap);
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      next.disabled = run!.taps[p.scale] === undefined;
    };
    TAP_LABELS.forEach((label, tap) => {
      const b = button(label, 'guide-tap');
      b.dataset.tap = String(tap);
      b.addEventListener('click', () => {
        run!.taps[p.scale] = tap as Tap;
        paintTaps();
      });
      taps.append(b);
    });

    const quote = el('input', 'guide-input guide-quote');
    quote.name = 'quote';
    quote.placeholder = '❝ In their words (optional)';
    quote.setAttribute('aria-label', 'In their words');
    quote.value = quoteByPrompt.get(index) ?? '';
    quote.addEventListener('input', () => {
      quoteByPrompt.set(index, quote.value);
      run!.quotes = [...quoteByPrompt.values()].map((q) => q.trim()).filter(Boolean);
    });

    const nav = el('div', 'guide-nav');
    const back = button('‹ Back', 'btn btn--ghost');
    back.addEventListener('click', () => (index ? prompt(index - 1) : context()));
    const next = button('Next ›', 'btn btn--primary', 'guide-next');
    next.addEventListener('click', () => {
      if (index + 1 < guide!.prompts.length) prompt(index + 1);
      else if (guide!.needsCheck(run!.taps)) check();
      else mix();
    });
    nav.append(back, next);
    body.append(card, taps, quote, nav);
    paintTaps();
  }

  function check(): void {
    body.replaceChildren(top(`${who!.name} · ${run!.context}`), progress(guide!.prompts.length + 1));
    const card = el('div', 'guide-check');
    card.append(el('span', 'guide-type guide-type--both', 'Getting the call right'), el('h4', undefined, guide!.probeTitle), el('div', 'guide-hint', guide!.probeHint));
    for (const probe of guide!.probes) {
      const block = el('div', 'guide-probe');
      block.append(el('p', undefined, `“${probe.ask}”`));
      const two = el('div', 'guide-two');
      for (const option of probe.options) {
        const b = button(option.label, `guide-tap guide-tap--${option.leans}`);
        b.dataset.probe = probe.id;
        b.dataset.option = option.id;
        b.addEventListener('click', () => {
          run!.checks[probe.id] = option.id;
          for (const sib of two.querySelectorAll<HTMLButtonElement>('button')) sib.classList.toggle('is-on', sib === b);
        });
        two.append(b);
      }
      block.append(two);
      card.append(block);
    }
    const nav = el('div', 'guide-nav');
    const skip = button('Skip', 'btn btn--ghost');
    skip.addEventListener('click', () => {
      run!.checks = {};
      mix();
    });
    const next = button('Set the mix ›', 'btn btn--primary', 'guide-next');
    next.addEventListener('click', mix);
    nav.append(skip, next);
    body.append(card, nav);
  }

  function mix(): void {
    const suggested = guide!.suggest(run!.taps, run!.checks);
    const start = options.edit ? run!.values : suggested;
    body.replaceChildren(top(`${who!.name} · ${run!.context}`), progress(guide!.prompts.length + 2));
    body.append(el('p', 'guide-hint', 'Dotted lines are suggested from your taps. Drag each bar to your call. Only what you save is kept.'));
    chart = createContinuumChart(doc, {
      scales: guide!.scales, values: start, suggested, lean: (v) => guide!.lean(v), editable: true,
      history: historyFor(placed, run!)
    });
    const nav = el('div', 'guide-nav');
    const back = button('‹ Back', 'btn btn--ghost');
    back.addEventListener('click', () => (guide!.needsCheck(run!.taps) ? check() : prompt(guide!.prompts.length - 1)));
    const save = button(options.edit ? 'Save changes' : 'Save to meeting', 'btn btn--primary', 'guide-save');
    save.addEventListener('click', async () => {
      save.disabled = true;
      const values = chart!.values();
      const profile = guide!.profileFor(values);
      const final: GuideRun = { ...run!, values, profile: profile.id, moves: profile.moves, updated_at: now() };
      try {
        await options.onSave(final);
        close();
      } catch {
        save.disabled = false;
        body.append(el('p', 'guide-panel__error', 'Could not save. Try again.'));
      }
    });
    nav.append(back, save);
    body.append(chart.el, nav);
  }

  if (options.edit) {
    guide = options.edit.guide;
    run = { ...options.edit.run, taps: { ...options.edit.run.taps }, checks: { ...options.edit.run.checks } };
    who = { ref: run.person_ref, name: run.person_name };
    run.quotes.forEach((q, i) => quoteByPrompt.set(100 + i, q));
    void options.placedRuns().catch(() => []).then((list) => {
      placed = list;
      mix();
    });
  } else {
    shelf();
  }
  return { el: panel, close };
}
