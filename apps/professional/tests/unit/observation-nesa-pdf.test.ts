import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, PDFTextField } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { addDescriptor, newObservation } from '@/observation/model';
import { fillNesaTemplate, nesaDate, nesaFieldLabel, nesaFieldValues, nesaFileName, NESA_FIELDS as F } from '@/observation/nesa-pdf';
import type { Observation } from '@/observation/types';

// Invented people only.
const TEMPLATE = readFileSync(resolve(__dirname, '../../src/observation/nesa-observation-template.pdf'));

function record(codes = ['1.1.2', '3.4.2'], extra?: string): Observation {
  let o = newObservation({
    teacher: { person_ref: 'shared:person:p_sam', name: 'Sam Okafor', school: 'Riverbend High' },
    supervisorName: 'Jo Supervisor',
    plannedOn: '2026-11-16',
    meetingId: 'meeting_00000000-0000-4000-8000-000000000001',
    phase: 'planning',
    now: new Date('2026-11-16T01:00:00Z')
  });
  for (const c of codes) {
    const r = addDescriptor(o, c);
    if (!r.ok) throw new Error(r.reason);
    o = r.observation;
  }
  if (extra) {
    const r = addDescriptor(o, extra, { extra: true });
    if (!r.ok) throw new Error(r.reason);
    o = r.observation;
  }
  return {
    ...o,
    teacher: { ...o.teacher, nesa_number: '123456', email: 'sam@example.test' },
    supervisor: { name: 'Jo Supervisor', nesa_number: '654321' },
    lesson: { title: 'Year 9 film editing workshop', link: '', syllabus_link: 'Stage 5 Media outcomes' },
    plan_all_students: 'Steps on the board and spoken.',
    plan_measure: 'Exit ticket.',
    descriptors: o.descriptors.map((d) => ({ ...d, why: `Why ${d.code}`, practice: `Practice ${d.code}`, demonstrate: `Show ${d.code}`, planned_impact: `Impact ${d.code}`, how_know: `Know ${d.code}` })),
    write_up: {
      '1.1.2': { practice: 'Planned: show it.\nLook-fors: A; B.\nGoal on screen.', strengths: 'Planned impact: x.\nHow we will know: y.\nClear goal.\nNext step: pull attention first.', decision: 'observed', comments: 'Ask about peer feedback.', edited: [] },
      '3.4.2': { practice: 'Software listed in Canvas.', strengths: 'Explained each tool.', decision: 'partial', comments: '', edited: [] }
    },
    reflection: {
      '1.1.2': { teacher: 'I set the goal early.', feedback: 'Strong routines.', feedback_edited: true },
      '3.4.2': { teacher: '', feedback: 'Model one tool.', feedback_edited: true }
    },
    signatures: { teacher: { name: 'Sam Okafor', date: '2026-11-20' }, supervisor: { name: '', date: '' } }
  };
}

describe('NESA template field values', () => {
  it('fills details, the three Planning boxes, and one row per agreed descriptor', () => {
    const v = nesaFieldValues(record());
    expect(v[F.teacherName]).toBe('Sam Okafor');
    expect(v[F.teacherNesa]).toBe('123456');
    expect(v[F.supervisorNesa]).toBe('654321');
    expect(v[F.planDescriptors]).toMatch(/^1\.1\.2 – Physical, social and intellectual development/);
    expect(v[F.planDescriptors]).toContain('Why: Why 3.4.2\nPractice: Practice 3.4.2');
    expect(v[F.planStrategies]).toBe('1.1.2: Show 1.1.2\n\n3.4.2: Show 3.4.2\n\nAll students: Steps on the board and spoken.\nLesson observed: Year 9 film editing workshop\nSyllabus link: Stage 5 Media outcomes');
    expect(v[F.planImpact]).toContain('1.1.2: Impact 1.1.2\nHow we will know: Know 1.1.2');
    expect(v[F.planImpact]).toMatch(/Assessment and feedback: Exit ticket\.$/);
    expect(v[F.descriptor(1)]).toBe('1.1.2');
    expect(v[F.descriptor(2)]).toBe('3.4.2');
    expect(v[F.descriptor(3)]).toBeUndefined();
  });

  it('keeps Planning lines off Phase 2 and writes the decision with comments', () => {
    const v = nesaFieldValues(record());
    expect(v[F.practice(1)]).toBe('Goal on screen.');
    expect(v[F.strengths(1)]).toBe('Clear goal.\nNext step: pull attention first.');
    expect(v[F.decision(1)]).toBe('Observed\n\nAsk about peer feedback.');
    expect(v[F.decision(2)]).toBe('Partially observed');
    expect(v[F.reflection(1)]).toBe('I set the goal early.');
    expect(v[F.feedback(2)]).toBe('Model one tool.');
    expect(v[F.teacherDate]).toBe('20/11/26');
    expect(nesaFieldValues(record(), '2026-11-21')[F.supervisorDate]).toBe('21/11/26');
  });

  it('fills a signature date not picked in the app with the day the report is made', () => {
    const v = nesaFieldValues({ ...record(), signatures: { teacher: { name: '', date: '' }, supervisor: { name: '', date: '2026-11-19' } } }, '2026-11-22');
    expect(v[F.teacherDate]).toBe('22/11/26');
    expect(v[F.supervisorDate]).toBe('19/11/26');
  });

  it('leaves extra descriptors off the report', () => {
    const v = nesaFieldValues(record(['1.1.2'], '6.3.2'));
    expect(Object.values(v).join(' ')).not.toContain('6.3.2');
    expect(v[F.descriptor(2)]).toBeUndefined();
  });

  it('formats dates and names the file', () => {
    expect(nesaDate('2026-01-05')).toBe('05/01/26');
    expect(nesaFileName(record())).toBe('NESA observation report – Sam Okafor – 2026-11-16.pdf');
    expect(nesaFieldLabel(record(), F.strengths(2))).toBe('Observation strengths (3.4.2)');
    expect(nesaFieldLabel(record(), F.reflection(1))).toBe('Teacher reflection (1.1.2)');
  });
});

describe('filling the shipped template', () => {
  it('ships blank and keeps every field name the mapping uses', async () => {
    const pdf = await PDFDocument.load(TEMPLATE);
    const fields = pdf.getForm().getFields();
    expect(fields.filter((f) => f instanceof PDFTextField && f.getText()).map((f) => f.getName())).toEqual([]);
    const names = new Set(fields.map((f) => f.getName()));
    const used = Object.keys(nesaFieldValues({ ...record(['1.1.2', '3.4.2', '4.5.2', '7.1.2']) }));
    expect(used.filter((n) => !names.has(n))).toEqual([]);
    expect(used).toHaveLength(35);
  });

  it('writes the values into the PDF, sized to fit, still editable', async () => {
    const { bytes, overflow } = await fillNesaTemplate(TEMPLATE, record(), '2026-11-21');
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getTextField(F.teacherName).getText()).toBe('Sam Okafor');
    expect(form.getTextField(F.supervisorDate).getText()).toBe('21/11/26');
    expect(form.getTextField(F.decision(1)).getText()).toBe('Observed\n\nAsk about peer feedback.');
    expect(form.getTextField(F.teacherDate).getText()).toBe('20/11/26');
    expect(form.getTextField(F.practice(3)).getText() ?? '').toBe('');
    expect(form.getTextField(F.teacherName).isReadOnly()).toBe(false);
    expect(overflow).toEqual([]);
  });

  it('shrinks long text, reports what still overflows, and drops characters Helvetica cannot draw', async () => {
    const long = record();
    long.write_up['1.1.2'] = { ...long.write_up['1.1.2']!, practice: 'Students edited their films → peers gave feedback ✓ 🎬. '.repeat(80) };
    const { bytes, overflow } = await fillNesaTemplate(TEMPLATE, long);
    expect(overflow).toEqual([F.practice(1)]);
    const text = (await PDFDocument.load(bytes)).getForm().getTextField(F.practice(1)).getText() ?? '';
    expect(text).toContain('films -> peers gave feedback Yes .');
    expect(text).not.toContain('🎬');
  });
});
