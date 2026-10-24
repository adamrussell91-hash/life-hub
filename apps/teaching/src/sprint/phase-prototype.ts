import { button, el } from '@/quiz/dom';
import { prototypeProblems } from './checks';
import { frameField, submitBar, valueCheckField, type FormContext, type PhaseForm } from './form-kit';
import { LEVEL_LABELS, type Level, type PhasePayload } from './schema';
import type { SprintStatus } from './api';

/** Prototype: build your part (write, upload or link), set the group's pitch file, then check it against the criteria. */
export function mountPrototype(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = s.mine?.prototype;
  const state: PhasePayload['prototype'] = { text: mine?.text ?? '', link: mine?.link ?? '', files: [...(mine?.files ?? [])], requirements: { ...(mine?.requirements ?? {}) }, self: { ...(mine?.self ?? {}) }, self_why: { ...(mine?.self_why ?? {}) }, value_answer: mine?.value_answer ?? '' };
  const myPart = (s.parts ?? []).find((p) => p.mine);
  const root = el('div', 'sprint-prototype');
  root.append(el('h2', '', myPart ? `Your part: ${myPart.text}` : 'Your part'));
  const brief = el('div', 'sprint-brief-part');
  brief.append(el('p', '', s.chosen ? `Group idea: ${s.chosen.title}` : ''), el('p', '', myPart?.shows ? `It must show: ${myPart.shows}` : 'Claim a part in Decide first.'));
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
  root.append(pitch);

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

export const prototypeSignature = (s: SprintStatus) => [(s.parts ?? []).find((p) => p.mine)?.id ?? '', s.pitch?.file ?? s.pitch?.link ?? ''].join('|');
