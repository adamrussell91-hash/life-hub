import { button, el } from '@/quiz/dom';
import { prototypeBuildProblems, prototypeRateProblems } from './checks';
import { LATER_GUIDE } from './guidance';
import { draftOf, frameField, submitBar, valueCheckField, type FormContext, type PhaseForm, slidify, stepify } from './form-kit';
import { LEVEL_LABELS, builtSomething, type Level, type PhasePayload, type PrototypeBuild } from './schema';
import type { SprintStatus } from './api';

/**
 * Prototype: build your part (write, upload or link) and check it against the
 * criteria. Everyone sees the group's parts as they come in; the assembler
 * puts them together and uploads the finished prototype for the pitch.
 */
export function mountPrototype(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = draftOf(ctx, 'prototype');
  const state: PhasePayload['prototype'] = { text: mine?.text ?? '', link: mine?.link ?? '', files: [...(mine?.files ?? [])], requirements: { ...(mine?.requirements ?? {}) }, self: { ...(mine?.self ?? {}) }, self_why: { ...(mine?.self_why ?? {}) }, value_answer: mine?.value_answer ?? '', builds: structuredClone(mine?.builds ?? {}) };
  const myParts = (s.parts ?? []).filter((p) => p.mine);
  const root = el('div', 'sprint-prototype');
  root.append(el('h2', '', myParts.length === 1 ? `Your part: ${myParts[0]!.text}` : myParts.length ? 'Your parts' : 'Your part'));
  const brief = el('div', 'sprint-brief-part');
  const line = (into: HTMLElement, k: string, v: string) => { const p = el('p', 'sprint-brief-part__line'); p.append(el('b', '', k), el('span', '', v)); into.append(p); };
  if (!myParts.length) line(brief, 'Your part', 'Your group gives out parts in Decide. Ask them which part is yours.');
  for (const part of myParts) {
    const card = el('section', 'sprint-mypart');
    if (myParts.length > 1) card.append(el('h4', 'sprint-mypart__name', part.text));
    line(card, 'Your part', part.text);
    line(card, 'It must show', part.shows || 'Your group hasn’t said yet. Check with them.');
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
  const err = el('p', 'sprint-submit__err');
  // Two or more parts: each is built and submitted on its own, so nothing is copied across parts.
  if (myParts.length > 1) {
    myParts.forEach((part, i) => {
      const build = (state.builds[part.id] ??= { text: '', link: '', files: [] });
      root.append(buildBox(ctx, build, { title: `Part ${i + 1} of ${myParts.length}: ${part.text}`, label: `Write “${part.text}” here, or upload it below`, changed: () => bar.changed() }));
    });
  } else root.append(buildBox(ctx, state, { label: 'Write your part here, or upload it below', changed: () => bar.changed() }));

  let panel = s.group_parts ? groupPartsPanel(ctx, s) : null;
  if (panel) root.append(panel);
  root.append(s.assemble ? finishedPrototype(ctx) : pitchFromMine(ctx, state, err), err);

  const self = el('div', 'sprint-self');
  self.append(el('h3', '', myParts.length > 1 ? 'Check your parts against the criteria' : 'Check your part against the criteria'));
  for (const c of ctx.sprint.criteria) {
    self.append(el('p', 'sprint-field__label', c.text));
    const levels = el('div', 'sprint-levels');
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
    self.append(levels, frameField({ label: 'Why? Point to the line or part that shows it.', value: state.self_why[c.id] ?? '', max: 300, rows: 2, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.self_why[c.id] = v; bar.changed(); } }));
  }
  for (const r of ctx.sprint.requirements.filter((x) => x.phases.includes('prototype'))) {
    self.append(frameField({ label: `Where does your part meet "${r.text}"?`, value: state.requirements[r.id] ?? '', max: 200, rows: 1, support: 'open', disabled: !ctx.editable, onInput: (v) => { state.requirements[r.id] = v; bar.changed(); } }));
  }
  const value = valueCheckField(ctx, state.value_answer, (v) => { state.value_answer = v; bar.changed(); });
  if (value) self.append(value);
  root.append(self);
  stepify(root, [
    { pick: '.sprint-brief-part', title: myParts.length > 1 ? 'What your parts must do' : 'What your part must do', guide: LATER_GUIDE.part },
    { pick: '.sprint-build', title: myParts.length > 1 ? `Build your ${myParts.length} parts` : 'Build it', guide: LATER_GUIDE.build, lead: myParts.length > 1 ? `You have ${myParts.length} parts. Build each one in its own box below.` : undefined },
    { pick: '.sp-parts, .sprint-pitch, .sprint-submit__err', title: 'Bring the parts together', guide: LATER_GUIDE.share },
    { pick: '.sprint-self', title: myParts.length > 1 ? 'Rate your parts' : 'Rate your part', guide: LATER_GUIDE.check }
  ], 'Prototype');
  slidify(root, ctx.sprint.understand?.layout, ctx.steps?.prototype ?? 0, (i) => { if (ctx.steps) ctx.steps.prototype = i; });
  root.append(bar.el);
  return {
    el: root,
    dispose: bar.dispose,
    // A groupmate's save repaints the parts list where it is, never the whole form.
    update(next) {
      if (!panel || !next.group_parts) return;
      const fresh = groupPartsPanel(ctx, next);
      fresh.open = panel.open;
      panel.replaceWith(fresh);
      panel = fresh;
    }
  };
}

/** One build: write it, upload up to three files, or add a link. */
function buildBox(ctx: FormContext, build: PrototypeBuild, o: { title?: string; label: string; changed(): void }): HTMLElement {
  const box = el('div', 'sprint-build');
  if (o.title) box.append(el('h4', 'sprint-build__title', o.title));
  box.append(frameField({ label: o.label, value: build.text, max: 4000, rows: 8, frames: ctx.frames, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { build.text = v; o.changed(); } }));
  const files = el('div', 'sprint-files');
  const fileList = el('ul');
  const upload = el('input');
  const paintFiles = () => {
    fileList.replaceChildren(...build.files.map((_, i) => el('li', '', `File ${i + 1} added`)));
    upload.disabled = !ctx.editable || build.files.length >= 3;
  };
  upload.type = 'file';
  upload.accept = 'application/pdf,image/png,image/jpeg,image/webp';
  upload.setAttribute('aria-label', o.title ? `Upload a PDF or picture for ${o.title}` : 'Upload a PDF or picture');
  paintFiles();
  const err = el('p', 'sprint-submit__err');
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    try {
      const up = await ctx.client.upload('prototype', file);
      build.files.push(up.id);
      paintFiles();
      o.changed();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t upload.';
    }
  });
  const link = el('input', 'qz-input');
  link.placeholder = 'https://… (Canva, Slides, a document)';
  link.value = build.link;
  link.disabled = !ctx.editable;
  link.setAttribute('aria-label', 'Link');
  link.addEventListener('input', () => { build.link = link.value.trim(); o.changed(); });
  files.append(el('label', 'sprint-field__label', 'Upload a PDF or picture (up to 5 MB), or add a link'), upload, fileList, link, err);
  box.append(files);
  return box;
}

/** Sprints published before assemblers: anyone sets the pitch file from their own part. */
function pitchFromMine(ctx: FormContext, state: PhasePayload['prototype'], err: HTMLElement): HTMLElement {
  const s = ctx.status;
  const pitch = el('div', 'sprint-pitch');
  pitch.append(el('h3', '', 'Pitch file'), el('p', 'sprint-note', s.pitch ? `Set: ${s.pitch.kind === 'link' ? s.pitch.link : s.pitch.name}` : 'One person sets what your group will show during the 2-minute pitch.'));
  const usePitch = button('Use my file or link as the pitch file', 'secondary', async () => {
    try {
      const all = [state, ...Object.values(state.builds)];
      const linked = all.find((b) => b.link)?.link;
      const file = all.flatMap((b) => b.files).at(-1);
      const next = linked ? await ctx.client.pitch({ link: linked }) : file ? await ctx.client.pitch({ file_id: file }) : null;
      if (next) ctx.onStatus(next);
      else err.textContent = 'Upload a file or add a link first.';
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t work.';
    }
  });
  usePitch.disabled = !ctx.editable;
  pitch.append(usePitch);
  return pitch;
}

/** Every part of the group's prototype as it comes in: who, what they made, their files and links. Each of your parts is its own row. */
function groupPartsPanel(ctx: FormContext, s: SprintStatus): HTMLDetailsElement {
  const rows = s.group_parts ?? [];
  const box = el('details', 'sp-parts');
  box.open = true;
  const done = rows.filter((r) => r.in).length;
  box.append(el('summary', '', `Your group’s parts · ${done} of ${rows.length} in`));
  const mine = rows.filter((r) => r.me);
  if (mine.length > 1) {
    const left = mine.filter((r) => !r.in).length;
    box.append(el('p', 'sp-parts__mine', `You have ${mine.length} parts: ${mine.map((r) => r.part).join(' and ')}. Each one is built on its own in step 2.${left ? ` ${left} of yours ${left === 1 ? 'is' : 'are'} not in yet.` : ''}`));
  }
  for (const r of rows) {
    const card = el('div', `sp-part${r.in ? ' sp-part--in' : ''}${r.me ? ' sp-part--mine' : ''}`);
    const state = r.in ? 'In' : r.started ? 'Started' : r.me ? 'Not built yet' : 'Not started';
    card.append(el('strong', '', `${r.part} · ${r.me ? 'you' : r.who}`), el('span', 'sp-part__state', state));
    if (r.text) card.append(el('p', 'sp-part__text', r.text));
    if (r.link) {
      const a = el('a', '', r.link);
      a.href = r.link;
      a.target = '_blank';
      a.rel = 'noopener';
      card.append(a);
    }
    for (const f of r.files) card.append(button(`Open ${f.name}`, 'ghost', async () => window.open(await ctx.client.fileUrl(f.id), '_blank', 'noopener')));
    box.append(card);
  }
  if (!rows.length) box.append(el('p', 'sprint-note', 'Parts show here once your group has given them out in Decide.'));
  return box;
}

/** The assembler uploads the put-together prototype for the pitch; everyone else sees where it is up to. */
function finishedPrototype(ctx: FormContext): HTMLElement {
  const s = ctx.status;
  const box = el('div', 'sprint-pitch');
  box.append(el('h3', '', 'The finished prototype'));
  const set = s.pitch ? `In: ${s.pitch.kind === 'link' ? s.pitch.link : s.pitch.name}` : '';
  if (!s.assembler?.me) {
    box.append(el('p', 'sprint-note', set || (s.assembler ? `Waiting for ${s.assembler.initials} to put it together.` : 'Your group hasn’t picked an assembler. Ask your teacher.')));
    return box;
  }
  box.append(el('p', 'sprint-note', set || 'You’re the assembler. Put everyone’s parts together, then upload the finished prototype or add its link. This is what your group shows at the pitch.'));
  const err = el('p', 'sprint-submit__err');
  err.setAttribute('role', 'alert');
  const upload = el('input');
  upload.type = 'file';
  upload.accept = 'application/pdf,image/png,image/jpeg,image/webp';
  upload.disabled = !ctx.editable;
  upload.setAttribute('aria-label', 'Upload the finished prototype');
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    try {
      const up = await ctx.client.upload('prototype', file);
      ctx.onStatus(await ctx.client.pitch({ file_id: up.id }));
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t upload.';
    }
  });
  const link = el('form', 'su-add');
  const input = el('input', 'qz-input');
  input.placeholder = 'https://… (the finished Canva, Slides or document)';
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
  box.append(upload, link, err);
  return box;
}

/** Only what changes the form's shape. Groupmates' saves reach the parts list through `update`, so polling never resets the step. */
export const prototypeSignature = (s: SprintStatus) => [(s.parts ?? []).filter((p) => p.mine).map((p) => p.id).join('+'), s.pitch?.file ?? s.pitch?.link ?? '', s.assembler?.key ?? '', s.group_parts ? 'g' : ''].join('|');
