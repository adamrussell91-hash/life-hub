import { button, el } from '@/quiz/dom';
import { prototypeBuildProblems, prototypeRateProblems } from './checks';
import { LATER_GUIDE, type Guide } from './guidance';
import { draftOf, filePick, frameField, submitBar, task, valueCheckField, type FormContext, type PhaseForm, slidify, stepify } from './form-kit';
import { LEVEL_LABELS, type Level, type PhasePayload, type PrototypeBuild } from './schema';
import type { SprintStatus } from './api';

/**
 * Prototype, in four steps that each ask for one thing:
 * 1. Read your part. 2. Build it. 3. Put it together (the assembler) or check
 * your part is in (everyone else). 4. Rate your part against the criteria.
 */
export function mountPrototype(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = draftOf(ctx, 'prototype');
  const state: PhasePayload['prototype'] = { text: mine?.text ?? '', link: mine?.link ?? '', files: [...(mine?.files ?? [])], requirements: { ...(mine?.requirements ?? {}) }, self: { ...(mine?.self ?? {}) }, self_why: { ...(mine?.self_why ?? {}) }, value_answer: mine?.value_answer ?? '', builds: structuredClone(mine?.builds ?? {}) };
  const myParts = (s.parts ?? []).filter((p) => p.mine);
  const many = myParts.length > 1;
  const root = el('div', 'sprint-prototype');
  root.append(el('h2', '', 'Build your prototype'));

  // Step 1: what the part is and what it must show.
  const brief = el('div', 'sprint-brief-part');
  const line = (into: HTMLElement, k: string, v: string, cls = '') => { const p = el('p', `sprint-brief-part__line${cls}`); p.append(el('b', '', k), el('span', '', v)); into.append(p); };
  if (!myParts.length) line(brief, 'Your part', 'Your group gives out parts in Decide. Ask them which part is yours.');
  for (const part of myParts) {
    const card = el('section', 'sprint-mypart');
    if (many) card.append(el('h4', 'sprint-mypart__name', part.text));
    line(card, 'Your part', part.text);
    line(card, 'It must show', part.shows || 'Your group hasn’t said yet. Check with them.', ' sprint-brief-part__line--key');
    if (part.how) line(card, 'How we’ll make it', part.how);
    const serves = ctx.sprint.criteria.find((c) => c.id === part.criterion);
    if (serves) line(card, 'Criterion', serves.text);
    brief.append(card);
  }
  root.append(brief);

  const bar = submitBar(ctx, 'prototype', () => state, () => [
    ...prototypeBuildProblems(state, myParts).map((text) => ({ text, at: '.sprint-build' })),
    ...prototypeRateProblems(state, ctx.sprint.criteria, ctx.sprint.requirements, !!ctx.valueCheck).map((text) => ({ text, at: '.sprint-self' }))
  ]);

  // Step 2: one box per part, so nothing is copied across parts.
  if (many) {
    myParts.forEach((part, i) => {
      const build = (state.builds[part.id] ??= { text: '', link: '', files: [] });
      root.append(buildBox(ctx, build, { title: `Part ${i + 1} of ${myParts.length}: ${part.text}`, label: `Write “${part.text}” here`, changed: () => bar.changed() }));
    });
  } else root.append(buildBox(ctx, state, { label: 'Write your part here', changed: () => bar.changed() }));

  // Step 3: what this student does with the group's parts depends on their job.
  const together = el('div', 'sprint-together');
  let panel = s.group_parts ? groupPartsPanel(ctx, s) : null;
  const role = s.assemble ? (s.assembler?.me ? 'assembler' : 'helper') : 'pitch';
  let partsIn: ((next: SprintStatus) => void) | null = null;
  if (role === 'assembler') { const a = assemblerTasks(ctx, s, panel); partsIn = a.partsIn; together.append(...a.els); }
  else if (role === 'helper') together.append(...helperView(s, panel));
  else together.append(...pitchTasks(ctx, s, state, panel));
  root.append(together);

  // Step 4: rate each criterion and say where it shows.
  const self = el('div', 'sprint-self');
  for (const c of ctx.sprint.criteria) {
    const row = el('div', 'sprint-rate');
    row.append(el('p', 'sprint-rate__name', c.text));
    const levels = el('div', 'sprint-levels');
    levels.setAttribute('role', 'group');
    levels.setAttribute('aria-label', `How strong is it in ${c.text}?`);
    LEVEL_LABELS.forEach((name, i) => {
      const lv = (i + 1) as Level;
      const b = el('button', 'btn btn--secondary sprint-level', name);
      b.type = 'button';
      b.disabled = !ctx.editable;
      b.setAttribute('aria-pressed', String(state.self[c.id] === lv));
      b.addEventListener('click', () => {
        state.self[c.id] = lv;
        levels.querySelectorAll('.sprint-level').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        bar.changed();
      });
      levels.append(b);
    });
    row.append(levels, frameField({ label: 'Why? Point to the line or bit that shows it.', value: state.self_why[c.id] ?? '', max: 300, rows: 2, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.self_why[c.id] = v; bar.changed(); } }));
    self.append(row);
  }
  const reqs = ctx.sprint.requirements.filter((x) => x.phases.includes('prototype'));
  if (reqs.length) {
    const box = el('div', 'sprint-rate');
    box.append(el('p', 'sprint-rate__name', 'Must include'));
    for (const r of reqs) box.append(frameField({ label: `Where does your ${many ? 'work' : 'part'} show “${r.text}”?`, value: state.requirements[r.id] ?? '', max: 200, rows: 1, support: 'open', disabled: !ctx.editable, onInput: (v) => { state.requirements[r.id] = v; bar.changed(); } }));
    self.append(box);
  }
  const value = valueCheckField(ctx, state.value_answer, (v) => { state.value_answer = v; bar.changed(); });
  if (value) self.append(value);
  root.append(self);

  const share: Record<typeof role, { title: string; guide: Guide; lead?: string }> = {
    assembler: { title: 'Put the prototype together', guide: LATER_GUIDE.assemble },
    helper: { title: 'Check your part is in', guide: LATER_GUIDE.share, lead: s.assembler ? `${s.assembler.initials} puts the parts together. You don’t upload anything here: check your part says “In”.` : undefined },
    pitch: { title: 'Choose the pitch file', guide: LATER_GUIDE.pitch }
  };
  stepify(root, [
    { pick: '.sprint-brief-part', title: many ? 'Read your parts' : 'Read your part', guide: LATER_GUIDE.part },
    { pick: '.sprint-build', title: many ? `Build your ${myParts.length} parts` : 'Build it', guide: LATER_GUIDE.build, lead: many ? `You have ${myParts.length} parts. Build each one in its own box below.` : undefined },
    { pick: '.sprint-together', ...share[role] },
    { pick: '.sprint-self', title: many ? 'Rate your parts' : 'Rate your part', guide: LATER_GUIDE.check }
  ], 'Prototype');
  slidify(root, ctx.sprint.understand?.layout, bar, ctx.steps?.prototype ?? 0, (i) => { if (ctx.steps) ctx.steps.prototype = i; });
  root.append(bar.el);
  return {
    el: root,
    dispose: bar.dispose,
    // A groupmate's save repaints the parts list where it is, never the whole form.
    update(next) {
      if (!panel || !next.group_parts) return;
      const fresh = groupPartsPanel(ctx, next);
      panel.replaceWith(fresh);
      panel = fresh;
      partsIn?.(next);
    }
  };
}

/** One build: write it, then add up to three files or a link. */
function buildBox(ctx: FormContext, build: PrototypeBuild, o: { title?: string; label: string; changed(): void }): HTMLElement {
  const box = el('div', 'sprint-build');
  if (o.title) box.append(el('h4', 'sprint-build__title', o.title));
  box.append(frameField({ label: o.label, value: build.text, max: 4000, rows: 8, frames: ctx.frames, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { build.text = v; o.changed(); } }));

  const extra = el('div', 'sprint-files');
  extra.append(el('p', 'sprint-field__label', 'Made it somewhere else? Add it here'), el('p', 'sprint-note', 'Optional. A photo of a sketch, a PDF (up to 5 MB, three at most) or a link to Canva, Slides or a document.'));
  const names: Record<string, string> = {};
  const fileList = el('ul', 'sprint-filelist');
  const err = el('p', 'sprint-submit__err');
  err.setAttribute('role', 'alert');
  const pick = filePick({
    label: 'Add a picture or PDF',
    accept: 'application/pdf,image/png,image/jpeg,image/webp',
    ariaLabel: o.title ? `Upload a PDF or picture for ${o.title}` : 'Upload a PDF or picture',
    disabled: !ctx.editable,
    onFile: async (file) => {
      err.textContent = '';
      try {
        const up = await ctx.client.upload('prototype', file);
        names[up.id] = up.name;
        build.files.push(up.id);
        paintFiles();
        o.changed();
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : 'That didn’t upload.';
      }
    }
  });
  const paintFiles = () => {
    fileList.replaceChildren(...build.files.map((id, i) => {
      const li = el('li', 'sprint-filelist__item');
      li.append(el('span', '', `✓ ${names[id] ?? `File ${i + 1}`}`));
      if (ctx.editable) li.append(button('Remove', 'ghost', () => { build.files.splice(build.files.indexOf(id), 1); paintFiles(); o.changed(); }));
      return li;
    }));
    const full = !ctx.editable || build.files.length >= 3;
    pick.input.disabled = full;
    pick.el.classList.toggle('is-disabled', full);
  };
  paintFiles();
  const link = el('input', 'qz-input');
  link.type = 'url';
  link.placeholder = 'Paste a link: https://…';
  link.value = build.link;
  link.disabled = !ctx.editable;
  link.setAttribute('aria-label', 'Link');
  link.addEventListener('input', () => { build.link = link.value.trim(); o.changed(); });
  const row = el('div', 'sprint-files__row');
  row.append(pick.el, link);
  extra.append(fileList, row, err);
  box.append(extra);
  return box;
}

/** "In: name" for the finished file, or the link. */
const pitchSet = (s: SprintStatus) => (s.pitch ? (s.pitch.kind === 'link' ? s.pitch.link : s.pitch.name) : '');

/** A status line that says plainly whether a job is done: green when it is. */
function statusLine(done: boolean, text: string): HTMLElement {
  return el('p', `sprint-status${done ? ' is-done' : ''}`, text);
}

/** The assembler's three jobs, in order, each ticking once it is done. */
function assemblerTasks(ctx: FormContext, s: SprintStatus, panel: HTMLElement | null): { els: HTMLElement[]; partsIn(next: SprintStatus): void } {
  const allIn = (x: SprintStatus) => !!x.group_parts?.length && x.group_parts.every((r) => r.in);
  const intro = el('p', 'sprint-note', 'You’re the assembler. You still build your own part in step 2.');
  const t1 = task(1, 'Check every part is in', 'Each part says “In” once its owner has submitted it. Message anyone still going.');
  t1.done(allIn(s));
  if (panel) t1.el.append(panel);
  const err = el('p', 'sprint-submit__err');
  err.setAttribute('role', 'alert');
  const t2 = task(2, 'Upload the finished prototype', 'Put everyone’s parts together into one file or link. Your teacher opens it at the pitch.');
  t2.done(!!s.pitch);
  if (s.pitch) t2.el.append(statusLine(true, `In: ${pitchSet(s)}`));
  const pick = filePick({
    label: s.pitch ? 'Replace the file' : 'Upload the finished file',
    accept: 'application/pdf,.pptx,.docx,image/png,image/jpeg,image/webp',
    ariaLabel: 'Upload the finished prototype',
    disabled: !ctx.editable,
    onFile: async (file) => {
      try {
        const up = await ctx.client.upload('prototype', file);
        ctx.onStatus(await ctx.client.pitch({ file_id: up.id }));
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : 'That didn’t upload.';
      }
    }
  });
  const link = el('form', 'su-add');
  const input = el('input', 'qz-input');
  input.type = 'url';
  input.placeholder = 'Or paste a link: https://…';
  input.setAttribute('aria-label', 'Link to the finished prototype');
  input.disabled = !ctx.editable;
  const go = el('button', 'btn btn--secondary', 'Use this link');
  go.type = 'submit';
  go.disabled = !ctx.editable;
  link.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { ctx.onStatus(await ctx.client.pitch({ link: input.value.trim() })); } catch (x) { err.textContent = x instanceof Error ? x.message : 'That didn’t work.'; }
  });
  link.append(input, go);
  const pickRow = el('div', 'sprint-files__row');
  pickRow.append(pick.el);
  t2.el.append(pickRow, link);
  const t3 = coverTask(ctx, 3, err);
  return { els: [intro, t1.el, t2.el, t3, err], partsIn: (next) => t1.done(allIn(next)) };
}

/** Everyone but the assembler: the group's parts and where the finished prototype is up to. Nothing to upload. */
function helperView(s: SprintStatus, panel: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (panel) out.push(panel);
  const box = el('div', 'sprint-pitch');
  box.append(el('h4', '', 'The finished prototype'));
  box.append(s.pitch
    ? statusLine(true, `In: ${pitchSet(s)}`)
    : statusLine(false, s.assembler ? `Waiting for ${s.assembler.initials} to put it together.` : 'Your group hasn’t picked an assembler. Ask your teacher.'));
  out.push(box);
  return out;
}

/** Sprints published before assemblers: anyone sets the pitch file from their own part. */
function pitchTasks(ctx: FormContext, s: SprintStatus, state: PhasePayload['prototype'], panel: HTMLElement | null): HTMLElement[] {
  const err = el('p', 'sprint-submit__err');
  err.setAttribute('role', 'alert');
  const out: HTMLElement[] = [];
  let n = 1;
  if (panel) { const t = task(n++, 'See your group’s parts', ''); t.el.append(panel); out.push(t.el); }
  const t = task(n++, 'Pitch file', 'One person sets what your group shows during the 2-minute pitch.');
  t.done(!!s.pitch);
  if (s.pitch) t.el.append(statusLine(true, `In: ${pitchSet(s)}`));
  const usePitch = button('Use my file or link as the pitch file', 'secondary', async () => {
    try {
      const all = [state, ...Object.values(state.builds)];
      const linked = all.find((b) => b.link)?.link;
      const file = all.flatMap((b) => b.files).at(-1);
      const next = linked ? await ctx.client.pitch({ link: linked }) : file ? await ctx.client.pitch({ file_id: file }) : null;
      if (next) ctx.onStatus(next);
      else err.textContent = 'Add a file or link in step 2 first.';
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t work.';
    }
  });
  usePitch.disabled = !ctx.editable;
  const row = el('div', 'sprint-files__row');
  row.append(usePitch);
  t.el.append(row);
  out.push(t.el, coverTask(ctx, n, err), err);
  return out;
}

/** One picture the projector shows while the group pitches: a poster for the idea, not the slides. */
function coverTask(ctx: FormContext, n: number, err: HTMLElement): HTMLElement {
  const s = ctx.status;
  const t = task(n, 'Add a cover poster', 'One picture that sums up your idea. It goes up on the screen while you pitch.');
  t.done(!!s.cover);
  t.el.classList.add('sprint-cover');
  if (s.cover) t.el.append(statusLine(true, `In: ${s.cover.name}`));
  const pick = filePick({
    label: s.cover ? 'Replace the poster' : 'Upload the poster',
    accept: 'image/png,image/jpeg,image/webp',
    ariaLabel: 'Upload the cover poster',
    disabled: !ctx.editable,
    onFile: async (file) => {
      try {
        const up = await ctx.client.upload('prototype', file);
        ctx.onStatus(await ctx.client.pitch({ cover_file_id: up.id }));
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : 'That didn’t upload.';
      }
    }
  });
  const row = el('div', 'sprint-files__row');
  row.append(pick.el);
  t.el.append(row);
  return t.el;
}

/** Every part of the group's prototype as it comes in: who, how far along, what they made. Each of your parts is its own row. */
function groupPartsPanel(ctx: FormContext, s: SprintStatus): HTMLElement {
  const rows = s.group_parts ?? [];
  const box = el('section', 'sp-parts');
  const done = rows.filter((r) => r.in).length;
  box.append(el('h4', 'sp-parts__head', `Your group’s parts · ${done} of ${rows.length} in`));
  const mine = rows.filter((r) => r.me);
  if (mine.length > 1) {
    const left = mine.filter((r) => !r.in).length;
    box.append(el('p', 'sp-parts__mine', `You have ${mine.length} parts: ${mine.map((r) => r.part).join(' and ')}. Each one is built on its own in step 2.${left ? ` ${left} of yours ${left === 1 ? 'is' : 'are'} not in yet.` : ''}`));
  }
  for (const r of rows) {
    const card = el('div', `sp-part${r.in ? ' sp-part--in' : ''}${r.me ? ' sp-part--mine' : ''}`);
    const label = r.in ? 'In' : r.started ? 'Started' : r.me ? 'Not built yet' : 'Not started';
    const tone = r.in ? 'in' : r.started ? 'started' : 'none';
    const top = el('div', 'sp-part__top');
    top.append(el('strong', '', `${r.part} · ${r.me ? 'you' : r.who}`), el('span', `sp-part__state sp-part__state--${tone}`, label));
    card.append(top);
    if (r.text) card.append(el('p', 'sp-part__text', r.text));
    const links = el('div', 'sp-part__links');
    if (r.link) {
      const a = el('a', '', r.link);
      a.href = r.link;
      a.target = '_blank';
      a.rel = 'noopener';
      links.append(a);
    }
    for (const f of r.files) links.append(button(`Open ${f.name}`, 'ghost', async () => window.open(await ctx.client.fileUrl(f.id), '_blank', 'noopener')));
    if (links.childElementCount) card.append(links);
    box.append(card);
  }
  if (!rows.length) box.append(el('p', 'sprint-note', 'Parts show here once your group has given them out in Decide.'));
  return box;
}

/** Only what changes the form's shape. Groupmates' saves reach the parts list through `update`, so polling never resets the step. */
export const prototypeSignature = (s: SprintStatus) => [(s.parts ?? []).filter((p) => p.mine).map((p) => p.id).join('+'), s.pitch?.file ?? s.pitch?.link ?? '', s.cover?.file ?? '', s.assembler?.key ?? '', s.group_parts ? 'g' : ''].join('|');
