/**
 * Export: a print page laid out as the four pages of the NESA Observation Report template. Page 1 is
 * portrait (details, intro, phase descriptions); pages 2–4 are A4 landscape (Planning, Observing,
 * Reflecting). Adam saves it as a PDF from the browser's print dialog. Reads only the record; empty
 * fields print blank.
 */
import { descriptorByCode } from './descriptors';
import { agreedDescriptors } from './model';
import type { Observation } from './types';
import { DECISIONS, h, NESA } from './ui';

export function openObservationReport(doc: Document, obs: Observation): { close(): void } {
  const t = (s: string | undefined | null) => s ?? '';
  const para = (text: string, cls = 'obs-r-answer') => h(doc, 'div', { class: cls }, t(text));
  /** A short label above an answer inside a cell, so each answer stays next to what it answers. */
  const labelled = (label: string, text: string) => h(doc, 'div', { class: 'obs-r-part' }, h(doc, 'span', { class: 'obs-r-label' }, label), para(text));
  const qs = (...questions: string[]) => h(doc, 'ul', { class: 'obs-r-qs' }, ...questions.map((q) => h(doc, 'li', {}, q)));
  const th = (head: string, ...questions: string[]) => h(doc, 'th', { scope: 'col' }, h(doc, 'span', { class: 'obs-r-head' }, head), questions.length ? qs(...questions) : null);
  const descriptorCell = (code: string) => h(doc, 'td', { class: 'obs-r-desc' },
    h(doc, 'b', {}, code), h(doc, 'div', { class: 'obs-r-desc__text' }, descriptorByCode(code)?.text ?? ''));

  // ---------------------------------------------------------------- page 1
  const detail = (label: string, value: string) => h(doc, 'tr', {}, h(doc, 'th', { scope: 'row' }, label), h(doc, 'td', {}, t(value)));
  const page1 = h(doc, 'section', { class: 'obs-page obs-page--portrait', 'data-page': '1' },
    h(doc, 'h1', {}, NESA.title),
    h(doc, 'p', {}, NESA.intro),
    ...(['planning', 'observing', 'reflecting'] as const).map((p) =>
      h(doc, 'p', { class: 'obs-r-phase' }, h(doc, 'b', {}, `${NESA.phases[p].name}: `), NESA.phases[p].about)),
    h(doc, 'h2', {}, NESA.teacherDetails),
    h(doc, 'table', { class: 'obs-r-details' }, h(doc, 'tbody', {},
      detail(NESA.fullName, obs.teacher.name), detail(NESA.nesaNumber, obs.teacher.nesa_number),
      detail(NESA.email, obs.teacher.email), detail(NESA.school, obs.teacher.school))),
    h(doc, 'h2', {}, NESA.supervisorDetails),
    h(doc, 'table', { class: 'obs-r-details' }, h(doc, 'tbody', {},
      detail(NESA.fullName, obs.supervisor.name), detail(NESA.nesaNumber, obs.supervisor.nesa_number))),
    h(doc, 'p', { class: 'obs-r-source' }, NESA.source));

  // ---------------------------------------------------------------- page 2 · Planning
  const p1 = NESA.p1;
  const planRows = agreedDescriptors(obs).map((d) => h(doc, 'tr', {},
    h(doc, 'td', {},
      h(doc, 'div', { class: 'obs-r-desc' }, h(doc, 'b', {}, d.code), h(doc, 'div', { class: 'obs-r-desc__text' }, descriptorByCode(d.code)?.text ?? '')),
      labelled('Why', d.why), labelled('Practice described', d.practice)),
    h(doc, 'td', {}, labelled('What you will do', d.demonstrate)),
    h(doc, 'td', {}, labelled('Planned impact', d.planned_impact), labelled('How you will know', d.how_know))));
  const lessonText = [obs.lesson.title, obs.lesson.link].filter((s) => s.trim()).join('\n');
  const wholeRow = h(doc, 'tr', { class: 'obs-r-whole' },
    h(doc, 'td', {}, h(doc, 'b', {}, 'Whole lesson')),
    h(doc, 'td', {}, labelled('Lesson observed', lessonText), labelled('Syllabus link', obs.lesson.syllabus_link), labelled('All students', obs.plan_all_students)),
    h(doc, 'td', {}, labelled('Assessment / measurement', obs.plan_measure)));
  const page2 = h(doc, 'section', { class: 'obs-page obs-page--landscape', 'data-page': '2' },
    h(doc, 'h2', {}, NESA.phases.planning.name),
    h(doc, 'table', { class: 'obs-r-table obs-r-table--3' },
      h(doc, 'thead', {}, h(doc, 'tr', {},
        th(p1.descriptors.head, p1.descriptors.which, p1.descriptors.why, p1.descriptors.practice),
        th(p1.strategies.head, p1.strategies.demonstrate, p1.strategies.allStudents, p1.strategies.lesson, p1.strategies.syllabus),
        th(p1.impact.head, p1.impact.planned, p1.impact.howKnow, p1.impact.measure))),
      h(doc, 'tbody', {}, ...planRows, wholeRow)));

  // ---------------------------------------------------------------- page 3 · Observing
  const p2 = NESA.p2;
  const obsRows = agreedDescriptors(obs).map((d) => {
    const row = obs.write_up[d.code];
    const choices = h(doc, 'ul', { class: 'obs-r-choices' }, ...DECISIONS.map((c) =>
      h(doc, 'li', { class: row?.decision === c.value ? 'is-on' : '' }, h(doc, 'span', { class: 'obs-r-box', 'aria-hidden': 'true' }, row?.decision === c.value ? '☒' : '☐'), ` ${c.full}`)));
    return h(doc, 'tr', {},
      descriptorCell(d.code),
      h(doc, 'td', {}, para(t(row?.practice))),
      h(doc, 'td', {}, para(t(row?.strengths))),
      h(doc, 'td', {}, choices, labelled(p2.comments, t(row?.comments))));
  });
  const page3 = h(doc, 'section', { class: 'obs-page obs-page--landscape', 'data-page': '3' },
    h(doc, 'h2', {}, NESA.phases.observing.name),
    h(doc, 'table', { class: 'obs-r-table obs-r-table--4' },
      h(doc, 'thead', {}, h(doc, 'tr', {},
        th(p2.descriptor),
        th(p2.practiceHead, ...p2.practiceQs),
        th(p2.strengthsHead, p2.strengthsQ),
        th(p2.decisionHead, p2.decisionQ))),
      h(doc, 'tbody', {}, ...obsRows)));

  // ---------------------------------------------------------------- page 4 · Reflecting
  const p3 = NESA.p3;
  const reflRows = agreedDescriptors(obs).map((d) => {
    const r = obs.reflection[d.code];
    return h(doc, 'tr', {}, descriptorCell(d.code), h(doc, 'td', {}, para(t(r?.teacher))), h(doc, 'td', {}, para(t(r?.feedback))));
  });
  const sig = (label: string, s: { name: string; date: string }) => h(doc, 'div', { class: 'obs-r-sig' },
    h(doc, 'span', { class: 'obs-r-sig__label' }, label), h(doc, 'span', { class: 'obs-r-sig__line' }, t(s.name)),
    h(doc, 'span', { class: 'obs-r-sig__label' }, p3.date), h(doc, 'span', { class: 'obs-r-sig__line obs-r-sig__line--date' }, t(s.date)));
  const page4 = h(doc, 'section', { class: 'obs-page obs-page--landscape', 'data-page': '4' },
    h(doc, 'h2', {}, NESA.phases.reflecting.name),
    h(doc, 'table', { class: 'obs-r-table obs-r-table--3r' },
      h(doc, 'thead', {}, h(doc, 'tr', {},
        th(p3.descriptor),
        th(p3.teacherHead, ...p3.teacherQs),
        th(p3.feedbackHead, p3.feedbackShown, p3.feedbackAdvice))),
      h(doc, 'tbody', {}, ...reflRows)),
    sig(p3.teacherSig, obs.signatures.teacher),
    sig(p3.supervisorSig, obs.signatures.supervisor));

  // ---------------------------------------------------------------- overlay
  const print = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--primary', 'data-part': 'obs-report-print' }, 'Print / Save as PDF');
  const close = h(doc, 'button', { type: 'button', class: 'obs-btn', 'data-part': 'obs-report-close' }, 'Close');
  const overlay = h(doc, 'div', { class: 'obs-report', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'NESA observation report', 'data-part': 'obs-report' },
    h(doc, 'div', { class: 'obs-report__bar' },
      h(doc, 'b', {}, 'NESA observation report'),
      h(doc, 'span', { class: 'obs-muted obs-small' }, ' · pick “Save as PDF” in the print dialog'),
      h(doc, 'span', { class: 'obs-spacer' }), print, close),
    h(doc, 'div', { class: 'obs-report__pages' }, page1, page2, page3, page4));

  const body = doc.body;
  const previousFocus = doc.activeElement as HTMLElement | null;
  let closed = false;
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); doClose(); }
  }
  function doClose(): void {
    if (closed) return;
    closed = true;
    doc.removeEventListener('keydown', onKey, true);
    overlay.remove();
    body.classList.remove('obs-report-open');
    previousFocus?.focus?.();
  }
  print.addEventListener('click', () => doc.defaultView?.print());
  close.addEventListener('click', doClose);
  doc.addEventListener('keydown', onKey, true);
  body.classList.add('obs-report-open');
  body.append(overlay);
  print.focus();
  return { close: doClose };
}
