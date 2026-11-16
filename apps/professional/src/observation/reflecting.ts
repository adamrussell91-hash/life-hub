/**
 * Phase 3 · Reflecting. One row per descriptor: what the observation found, the teacher's reflection
 * (typed by Adam with the teacher), and the supervisor's feedback drafted from the write-up. Then
 * signatures, export, and Mark observation done.
 */
import { openObservationReport } from './export';
import { draftFeedback } from './model';
import type { Decision, Observation, ReflectionRow } from './types';
import { DECISIONS, h, NESA, slotClass, syncValue, type ObsCtx, type ObsView } from './ui';

const emptyReflection = (): ReflectionRow => ({ teacher: '', feedback: '', feedback_edited: false });

function pillClass(decision: Decision | null): string {
  return decision === 'observed' ? 'is-o' : decision === 'partial' ? 'is-p' : decision === 'not' ? 'is-x' : 'is-none';
}

export function mountReflecting(ctx: ObsCtx): ObsView {
  const { doc } = ctx;
  const el = h(doc, 'div', { class: 'obs-view obs-reflecting', 'data-part': 'obs-reflecting' });
  const feedbackBoxes = new Map<string, { ta: HTMLTextAreaElement; src: HTMLElement }>();
  let report: { close(): void } | null = null;

  // Draft feedback for rows that have a decision and haven't been edited.
  {
    const drafted = draftFeedback(ctx.obs());
    if (JSON.stringify(drafted) !== JSON.stringify(ctx.obs().reflection)) ctx.change((o) => ({ ...o, reflection: draftFeedback(o) }), 'later');
  }

  function setRow(code: string, patch: Partial<ReflectionRow>, when: 'later' | 'now'): void {
    ctx.change((o) => ({ ...o, reflection: { ...o.reflection, [code]: { ...(o.reflection[code] ?? emptyReflection()), ...patch } } }), when);
  }

  function srcText(code: string): string {
    const obs = ctx.obs();
    const r = obs.reflection[code];
    const decision = obs.write_up[code]?.decision ?? null;
    if (!decision) return 'Pick a decision to draft this.';
    if (r?.feedback_edited) return 'Edited by you';
    return decision === 'observed' ? '↳ drafted from strengths' : '↳ drafted from strengths and next steps';
  }

  // No decision was made while observing: make it here, then draft the feedback from it.
  function decideHere(code: string, index: number): HTMLElement {
    const host = h(doc, 'div', { class: 'obs-decide', role: 'group', 'aria-label': `Decision for ${code}`, 'data-part': 'obs-decide-here' });
    for (const d of DECISIONS) {
      const b = h(doc, 'button', { type: 'button', class: d.cls }, d.label);
      b.addEventListener('click', () => {
        ctx.change((o) => {
          const prev = o.write_up[code] ?? { practice: '', strengths: '', decision: null, comments: '', edited: [] };
          const next: Observation = { ...o, write_up: { ...o.write_up, [code]: { ...prev, decision: d.value } } };
          return { ...next, reflection: draftFeedback(next) };
        }, 'now');
        const old = el.querySelector(`.obs-refl[data-code="${code}"]`);
        old?.replaceWith(row(code, index));
      });
      host.append(b);
    }
    return host;
  }

  function row(code: string, index: number): HTMLElement {
    const obs = ctx.obs();
    const decision = obs.write_up[code]?.decision ?? null;
    const lines = obs.log.filter((l) => l.descriptor === code);
    const strengths = lines.filter((l) => l.kind === 'strength' && l.text);
    const nexts = lines.filter((l) => l.kind === 'next' && l.text);
    const r = obs.reflection[code] ?? emptyReflection();

    const evid = h(doc, 'div', { class: 'obs-evid' },
      h(doc, 'div', { class: 'obs-row' },
        h(doc, 'span', { class: 'obs-code' }, code),
        decision
          ? h(doc, 'span', { class: `obs-pill ${pillClass(decision)}`, 'data-part': 'obs-decision-pill' },
            DECISIONS.find((d) => d.value === decision)?.full ?? '')
          : decideHere(code, index)),
      strengths.length || nexts.length
        ? h(doc, 'ul', {},
          ...strengths.map((l) => h(doc, 'li', {}, l.text)),
          ...nexts.map((l) => h(doc, 'li', {}, h(doc, 'b', {}, 'Next: '), l.text)))
        : null,
      h(doc, 'span', { class: 'obs-small obs-muted' }, `${lines.length} log ${lines.length === 1 ? 'line' : 'lines'}`));

    const teacher = h(doc, 'textarea', { class: 'obs-input obs-textarea obs-textarea--tall', rows: 6, 'aria-label': `${NESA.p3.teacherHead} for ${code}`, 'data-cell': 'teacher' });
    teacher.value = r.teacher;
    teacher.addEventListener('input', () => setRow(code, { teacher: teacher.value }, 'later'));

    const feedback = h(doc, 'textarea', { class: 'obs-input obs-textarea obs-textarea--tall', rows: 6, 'aria-label': `${NESA.p3.feedbackHead} for ${code}`, 'data-cell': 'feedback' });
    feedback.value = r.feedback;
    if (!r.feedback_edited && r.feedback) feedback.classList.add('is-prefill');
    const src = h(doc, 'span', { class: 'obs-src' }, srcText(code));
    feedback.addEventListener('input', () => {
      feedback.classList.remove('is-prefill');
      setRow(code, { feedback: feedback.value, feedback_edited: true }, 'later');
      src.textContent = srcText(code);
    });
    const redraft = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--xs obs-btn--quiet', 'data-part': 'obs-redraft' }, 'Redraft');
    redraft.addEventListener('click', () => {
      ctx.change((o) => {
        const cleared: Observation = { ...o, reflection: { ...o.reflection, [code]: { ...(o.reflection[code] ?? emptyReflection()), feedback_edited: false } } };
        return { ...cleared, reflection: draftFeedback(cleared) };
      }, 'now');
      const next = ctx.obs().reflection[code];
      feedback.value = next?.feedback ?? '';
      feedback.classList.toggle('is-prefill', !!feedback.value);
      src.textContent = srcText(code);
    });
    feedbackBoxes.set(code, { ta: feedback, src });

    const feedbackQ = decision === 'observed' ? NESA.p3.feedbackShown : decision ? NESA.p3.feedbackAdvice : `${NESA.p3.feedbackShown} ${NESA.p3.feedbackAdvice}`;
    return h(doc, 'article', { class: `obs-refl ${slotClass(index)}`, 'data-code': code },
      evid,
      h(doc, 'label', { class: 'obs-field' },
        h(doc, 'span', { class: 'obs-colh obs-colh--inline' }, NESA.p3.teacherHead),
        h(doc, 'span', { class: 'obs-ask' }, h(doc, 'i', {}, NESA.p3.teacherQs.join(' '))),
        teacher),
      h(doc, 'div', { class: 'obs-field' },
        h(doc, 'span', { class: 'obs-colh obs-colh--inline' }, NESA.p3.feedbackHead),
        h(doc, 'label', { class: 'obs-field' }, h(doc, 'span', { class: 'obs-ask' }, h(doc, 'i', {}, feedbackQ)), feedback),
        h(doc, 'div', { class: 'obs-row' }, src, h(doc, 'span', { class: 'obs-spacer' }), redraft)));
  }

  function signature(who: 'teacher' | 'supervisor', title: string): HTMLElement {
    const sig = ctx.obs().signatures[who];
    const name = h(doc, 'input', { type: 'text', class: 'obs-input', name: `sig-${who}-name`, 'aria-label': `${title} name`, placeholder: 'Type full name to sign', maxlength: 120 });
    name.value = sig.name;
    const date = h(doc, 'input', { type: 'date', class: 'obs-input obs-input--date', name: `sig-${who}-date`, 'aria-label': `${title} date` });
    date.value = sig.date;
    const save = () => ctx.change((o) => ({ ...o, signatures: { ...o.signatures, [who]: { name: name.value, date: date.value } } }), 'later');
    name.addEventListener('input', save);
    date.addEventListener('input', save);
    date.addEventListener('change', save);
    return h(doc, 'div', { class: 'obs-sigbox' }, h(doc, 'b', { class: 'obs-small' }, title), h(doc, 'div', { class: 'obs-row' }, name, date));
  }

  const actions = h(doc, 'div', { class: 'obs-row obs-actions', 'data-part': 'obs-actions' });
  function renderActions(): void {
    const done = ctx.obs().status === 'done';
    const exportBtn = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--primary', 'data-part': 'obs-export' }, 'Export NESA report');
    exportBtn.addEventListener('click', () => {
      report?.close();
      report = openObservationReport(doc, ctx.obs());
    });
    let toggle: HTMLElement;
    if (done) {
      const reopen = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--sm obs-btn--quiet', 'data-part': 'obs-reopen' }, 'Reopen');
      reopen.addEventListener('click', () => { ctx.change((o) => ({ ...o, status: 'open' }), 'now'); renderActions(); });
      toggle = h(doc, 'span', { class: 'obs-row' }, h(doc, 'span', { class: 'obs-pill is-o', 'data-part': 'obs-done' }, 'Done'), reopen);
    } else {
      const mark = h(doc, 'button', { type: 'button', class: 'obs-btn', 'data-part': 'obs-mark-done' }, 'Mark observation done');
      mark.addEventListener('click', () => { ctx.change((o) => ({ ...o, status: 'done' }), 'now'); renderActions(); });
      toggle = mark;
    }
    actions.replaceChildren(
      h(doc, 'span', { class: 'obs-muted obs-small' }, 'Export lays out all four pages of the NESA template; save it as a PDF from the print dialog.'),
      h(doc, 'span', { class: 'obs-spacer' }), toggle, exportBtn);
  }

  const obs = ctx.obs();
  const heads = h(doc, 'div', { class: 'obs-col3h obs-col3h--refl' },
    h(doc, 'div', { class: 'obs-colh' }, 'From the observation'),
    h(doc, 'div', { class: 'obs-colh' }, NESA.p3.teacherHead),
    h(doc, 'div', { class: 'obs-colh' }, NESA.p3.feedbackHead));
  renderActions();
  el.append(
    heads,
    ...(obs.descriptors.length ? obs.descriptors.map((d, i) => row(d.code, i)) : [h(doc, 'p', { class: 'obs-muted' }, 'No descriptors were planned for this observation.')]),
    h(doc, 'div', { class: 'obs-sign' }, signature('teacher', 'Teacher’s signature'), signature('supervisor', 'Accreditation Supervisor’s signature')),
    actions);

  // Keep untouched drafts current if the record changed elsewhere before mount finished.
  for (const [code, box] of feedbackBoxes) syncValue(box.ta, ctx.obs().reflection[code]?.feedback ?? '');

  return { el, destroy() { report?.close(); report = null; } };
}
