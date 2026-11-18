/**
 * Fill the official NESA Observation Report template (June 2026, a fillable PDF) from the record.
 * `nesaFieldValues` maps the record onto the template's form fields; `fillNesaTemplate` writes them
 * into the PDF with pdf-lib, sizing each box's text to fit (10pt down to 6pt). Text that still
 * overflows at 6pt stays whole in the field, so it scrolls in Acrobat; the caller is told which.
 * The form stays editable. Extra descriptors never go on the report.
 */
import { descriptorByCode } from './descriptors';
import { agreedDescriptors, PLANNED_PREFIXES } from './model';
import type { Observation } from './types';
import { DECISIONS } from './ui';

/** Field names exactly as the template has them (note "Teacher's reflection" for 1, "Teacher reflection" for 2–4). */
export const NESA_FIELDS = {
  teacherName: "Teacher's full name",
  teacherNesa: "Teacher's NESA account number",
  teacherEmail: "Teacher's email address",
  school: 'Main school or service',
  supervisorName: "Supervisor's full name",
  supervisorNesa: "Supervisor's NESA account number",
  planDescriptors: 'Standard Descriptors',
  planStrategies: 'Teaching and learning strategies',
  planImpact: 'Impact of practice',
  descriptor: (n: number) => `Standard Descriptor ${n}`,
  practice: (n: number) => `Teaching practice - Standard Descriptor ${n}`,
  strengths: (n: number) => `Observation strengths - Standard Descriptor ${n}`,
  decision: (n: number) => `Record of decision - Standard Descriptor ${n}`,
  reflection: (n: number) => (n === 1 ? "Teacher's reflection - Standard Descriptor 1" : `Teacher reflection - Standard Descriptor ${n}`),
  feedback: (n: number) => `Supervisor's feedback - Standard Descriptor ${n}`,
  teacherDate: 'Teacher signature date',
  supervisorDate: 'Supervisor signature date'
} as const;

/** Lines the write-up gathers from Planning; the report's Phase 2 shows only what was observed. */
const PLANNING_LINE = /^(Planned:|Look-fors:|From Planning notes:)/;
const PLANNED_STRENGTH = (l: string) => PLANNED_PREFIXES.some((p) => l.startsWith(p));

const clean = (s: string | undefined | null): string => (s ?? '').trim();
const keepLines = (text: string, drop: (l: string) => boolean): string =>
  text.split('\n').filter((l) => !drop(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const block = (...parts: string[]): string => parts.filter(Boolean).join('\n\n');
const labelled = (label: string, text: string): string => (clean(text) ? `${label}: ${clean(text)}` : '');

/** '2026-11-17' → '17/11/26', the template's date format. */
export function nesaDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]!.slice(2)}` : clean(iso);
}

/** Today as 'YYYY-MM-DD' in local time. */
export function localIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Every template field this record fills, keyed by field name. Empty answers leave the field blank,
 * except the two signature dates: a date not picked in the app takes `today` (the day the report is made).
 */
export function nesaFieldValues(obs: Observation, today: string = localIsoDate()): Record<string, string> {
  const F = NESA_FIELDS;
  const agreed = agreedDescriptors(obs).slice(0, 4);
  const out: Record<string, string> = {
    [F.teacherName]: clean(obs.teacher.name),
    [F.teacherNesa]: clean(obs.teacher.nesa_number),
    [F.teacherEmail]: clean(obs.teacher.email),
    [F.school]: clean(obs.teacher.school),
    [F.supervisorName]: clean(obs.supervisor.name),
    [F.supervisorNesa]: clean(obs.supervisor.nesa_number)
  };

  // Phase 1 · one box per column, a paragraph per descriptor, then the whole-lesson answers.
  out[F.planDescriptors] = block(...agreed.map((d) => {
    const focus = descriptorByCode(d.code)?.focus;
    return [focus ? `${d.code} – ${focus}` : d.code, labelled('Why', d.why), labelled('Practice', d.practice)].filter(Boolean).join('\n');
  }));
  const lesson = [clean(obs.lesson.title), clean(obs.lesson.link)].filter(Boolean).join(' ');
  out[F.planStrategies] = block(
    ...agreed.map((d) => labelled(d.code, d.demonstrate)),
    [labelled('All students', obs.plan_all_students), labelled('Lesson observed', lesson), labelled('Syllabus link', obs.lesson.syllabus_link)].filter(Boolean).join('\n')
  );
  out[F.planImpact] = block(
    ...agreed.map((d) => [labelled(d.code, d.planned_impact), labelled(clean(d.planned_impact) ? 'How we will know' : `${d.code} – how we will know`, d.how_know)].filter(Boolean).join('\n')),
    labelled('Assessment and feedback', obs.plan_measure)
  );

  // Phases 2 and 3 · one row per agreed descriptor, in order.
  agreed.forEach((d, i) => {
    const n = i + 1;
    const row = obs.write_up[d.code];
    const refl = obs.reflection[d.code];
    const decision = DECISIONS.find((c) => c.value === row?.decision)?.full ?? '';
    out[F.descriptor(n)] = d.code;
    out[F.practice(n)] = keepLines(clean(row?.practice), (l) => PLANNING_LINE.test(l));
    out[F.strengths(n)] = keepLines(clean(row?.strengths), PLANNED_STRENGTH);
    out[F.decision(n)] = block(decision, clean(row?.comments));
    out[F.reflection(n)] = clean(refl?.teacher);
    out[F.feedback(n)] = clean(refl?.feedback);
  });

  out[F.teacherDate] = nesaDate(clean(obs.signatures.teacher.date) || today);
  out[F.supervisorDate] = nesaDate(clean(obs.signatures.supervisor.date) || today);
  return out;
}

export interface FilledReport {
  bytes: Uint8Array;
  /** Fields whose text overflows its box even at the smallest size. */
  overflow: string[];
}

const MAX_SIZE = 10;
/** One-line boxes (names, numbers, dates) read better a little larger, as typed in Acrobat. */
const MAX_SIZE_ONE_LINE = 12;
const MIN_SIZE = 6;
/** pdf-lib insets its text by border + padding (1 + 1) on each side. */
const PAD = 2;
/** pdf-lib's line spacing: the font's height plus 20%. */
const LINE = 1.2;

/** Fill a copy of the template. Pure apart from pdf-lib, which loads on demand. */
export async function fillNesaTemplate(template: ArrayBuffer | Uint8Array, obs: Observation, today?: string): Promise<FilledReport> {
  const { PDFDocument, PDFHexString, PDFTextField, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.load(template);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();

  // Helvetica (WinAnsi) can't draw every character; swap the common ones, drop the rest.
  const known = new Map<string, boolean>();
  const drawable = (ch: string): boolean => {
    if (!known.has(ch)) { try { font.encodeText(ch); known.set(ch, true); } catch { known.set(ch, false); } }
    return known.get(ch)!;
  };
  const SWAP: Record<string, string> = { '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '✓': 'Yes', '✔': 'Yes', '×': 'x', '\t': ' ', ' ': ' ' };
  const encodable = (text: string): string =>
    [...text.replace(/\r\n?/g, '\n')].map((ch) => (ch === '\n' || drawable(ch) ? ch : SWAP[ch] ?? '')).join('');

  /** Lines the text wraps to at this size and width (words, then hard breaks inside long words). */
  const wrap = (text: string, size: number, width: number): number => {
    let lines = 0;
    for (const para of text.split('\n')) {
      let line = '';
      lines++;
      for (const word of para.split(/ +/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) lines++;
        line = word;
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
          line = line.slice(cut);
          lines++;
        }
      }
    }
    return lines;
  };

  const overflow: string[] = [];
  for (const [name, raw] of Object.entries(nesaFieldValues(obs, today))) {
    const field = form.getFieldMaybe(name);
    if (!(field instanceof PDFTextField)) continue;
    const text = encodable(raw);
    // A field can sit on two pages (descriptor codes on Phases 2 and 3): fit the smaller box.
    const boxes = field.acroField.getWidgets().map((w) => w.getRectangle());
    const width = Math.min(...boxes.map((b) => b.width)) - PAD * 2;
    const height = Math.min(...boxes.map((b) => b.height)) - PAD * 2;
    const multiline = field.isMultiline();
    let size = multiline ? MAX_SIZE : MAX_SIZE_ONE_LINE;
    let shown = text;
    if (text) {
      const fits = (t: string, s: number) => (multiline
        ? wrap(t, s, width * 0.97) * font.heightAtSize(s) * LINE <= height
        : font.widthOfTextAtSize(t, s) <= width);
      while (size > MIN_SIZE && !fits(text, size)) size -= 0.5;
      if (!fits(text, size)) {
        overflow.push(name);
        // Draw only what fits (pdf-lib lays out long text very slowly); the field keeps the whole text.
        const words = text.split(' ');
        let lo = 0;
        let hi = words.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (fits(`${words.slice(0, mid).join(' ')} …`, size)) lo = mid; else hi = mid - 1;
        }
        shown = `${words.slice(0, lo).join(' ')} …`;
      }
    }
    field.setFontSize(size);
    // Widgets with their own auto-size entry would override the field's size; give them the same one.
    const da = field.acroField.getDefaultAppearance();
    for (const w of field.acroField.getWidgets()) if (da && w.getDefaultAppearance()) w.setDefaultAppearance(da);
    field.setText(shown);
    field.updateAppearances(font);
    if (shown !== text) field.acroField.setValue(PDFHexString.fromText(text));
  }
  return { bytes: await pdf.save({ updateFieldAppearances: false }), overflow };
}

/** "NESA observation report – Sam Okafor – 2026-11-16.pdf" */
export function nesaFileName(obs: Observation): string {
  const name = clean(obs.teacher.name).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return ['NESA observation report', name, obs.planned_on].filter(Boolean).join(' – ') + '.pdf';
}

/** Readable labels for the overflow message. */
export function nesaFieldLabel(obs: Observation, field: string): string {
  const m = /Standard Descriptor (\d)$/.exec(field);
  const code = m ? agreedDescriptors(obs)[Number(m[1]) - 1]?.code : undefined;
  const part = field.replace(/ - Standard Descriptor \d$/, '').replace(/^Teacher's reflection$/, 'Teacher reflection');
  return code ? `${part} (${code})` : part;
}
