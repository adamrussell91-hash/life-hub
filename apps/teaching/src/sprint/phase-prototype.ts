import { button, el } from '@/quiz/dom';
import { prototypeProblems } from './checks';
import { draftOf, frameField, submitBar, valueCheckField, type FormContext, type PhaseForm } from './form-kit';
import { LEVEL_LABELS, type Level, type PhasePayload } from './schema';
import type { SprintStatus } from './api';

/**
 * Prototype: build your part (write, upload or link) and check it against the
 * criteria. Everyone sees the group's parts as they come in; the assembler
 * puts them together and uploads the finished prototype for the pitch.
 */
export function mountPrototype(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = draftOf(ctx, 'prototype');
  const state: PhasePayload['prototype'] = { text: mine?.text ?? '', link: mine?.link ?? '', files: [...(mine?.files ?? [])], requirements: { ...(mine?.requirements ?? {}) }, self: { ...(mine?.self ?? {}) }, self_why: { ...(mine?.self_why ?? {}) }, value_answer: mine?.value_answer ?? '' };
  const myPart = (s.parts ?? []).find((p) => p.mine);
  const root = el('div', 'sprint-prototype');
  root.append(el('h2', '', myPart ? `Your part: ${myPart.text}` : 'Your part'));
  const brief = el('div', 'sprint-brief-part');
  brief.append(el('p', '', s.chosen ? `Group idea: ${s.chosen.title}` : ''), el('p', '', myPart?.shows ? `It must show: ${myPart.shows}` : 'Your group gives out parts in Decide.'));
  const serves = ctx.sprint.criteria.find((c) => c.id === myPart?.criterion);
  if (serves) brief.append(el('p', '', `It serves: ${serves.text}`));
  root.append(brief);
  const bar = submitBar(ctx, 'prototype', () => state, () => prototypeProblems(state, ctx.sprint.criteria, ctx.sprint.requirements));
  root.append(frameField({ label: 'Write your part here, or upload it below', value: state.text, max: 4000, rows: 8, frames: ctx.frames, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.text = v; bar.changed(); } }));

  const files = el('div', 'sprint-files');
  const fileList = el('ul');
  const paintFiles = () => fileList.replaceChildren(...state.files.map((id, i) => el('li', '', `File ${i + 1} added`)));
  paintFiles();
  const upload = el('input');
  upload.type = 'file';
  upload.accept = 'application/pdf,image/png,image/jpeg,image/webp';
  upload.disabled = !ctx.editable || state.files.length >= 3;
  upload.setAttribute('aria-label', 'Upload a PDF or picture');
  const err = el('p', 'sprint-submit__err');
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    try {
      const up = await ctx.client.upload('prototype', file);
      state.files.push(up.id);
      paintFiles();
      bar.changed();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t upload.';
    }
  });
  const link = el('input', 'qz-input');
  link.placeholder = 'https://… (Canva, Slides, a document)';
  link.value = state.link;
  link.disabled = !ctx.editable;
  link.setAttribute('aria-label', 'Link');
  link.addEventListener('input', () => { state.link = link.value.trim(); bar.changed(); });
  files.append(el('label', 'sprint-field__label', 'Upload a PDF or picture (up to 5 MB), or add a link'), upload, fileList, link, err);
  root.append(files);

  if (s.group_parts) root.append(groupPartsPanel(ctx));
  root.append(s.assemble ? finishedPrototype(ctx) : pitchFromMine(ctx, state, err));

  const self = el('div', 'sprint-self');
  self.append(el('h3', '', 'Check your part against the criteria'));
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
  root.append(self, bar.el);
  return { el: root, dispose: bar.dispose };
}

/** Sprints published before assemblers: anyone sets the pitch file from their own part. */
function pitchFromMine(ctx: FormContext, state: PhasePayload['prototype'], err: HTMLElement): HTMLElement {
  const s = ctx.status;
  const pitch = el('div', 'sprint-pitch');
  pitch.append(el('h3', '', 'Pitch file'), el('p', 'sprint-note', s.pitch ? `Set: ${s.pitch.kind === 'link' ? s.pitch.link : s.pitch.name}` : 'One person sets what your group will show during the 2-minute pitch.'));
  const usePitch = button('Use my file or link as the pitch file', 'secondary', async () => {
    try {
      const next = state.link ? await ctx.client.pitch({ link: state.link }) : state.files[0] ? await ctx.client.pitch({ file_id: state.files.at(-1)! }) : null;
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

/** Every part of the group's prototype as it comes in: who, what they wrote, their files and links. */
function groupPartsPanel(ctx: FormContext): HTMLElement {
  const rows = ctx.status.group_parts ?? [];
  const box = el('details', 'sp-parts');
  box.open = true;
  const done = rows.filter((r) => r.in).length;
  box.append(el('summary', '', `Your group’s parts · ${done} of ${rows.length} in`));
  for (const r of rows) {
    const card = el('div', `sp-part${r.in ? ' sp-part--in' : ''}`);
    card.append(el('strong', '', `${r.part} · ${r.me ? 'you' : r.who}`), el('span', 'sp-part__state', r.in ? 'In' : r.started ? 'Started' : 'Not started'));
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

export const prototypeSignature = (s: SprintStatus) => [(s.parts ?? []).find((p) => p.mine)?.id ?? '', s.pitch?.file ?? s.pitch?.link ?? '', s.assembler?.key ?? '', (s.group_parts ?? []).map((r) => `${r.part_id}:${r.who}:${r.in ? 1 : r.started ? 0 : '-'}:${r.files.length}:${r.link ? 1 : 0}`).join(',')].join('|');
