/**
 * Tasks → Personal line: pick a year level and subjects, see the student's own line build itself,
 * then publish a snapshot to a public MindWorks link.
 */
import { parseHubPrefs, type SchoolYearTerms } from '@/domain/hub-prefs';
import { schoolTerms, termSpans } from '@/domain/maps-layout';
import type { Program } from '@/schemas/program';
import { tasksApi } from '@/services/client-api';
import { el } from '@/views/hub-kit';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { LINES, LINE_ORDER, SUBJECT_LINES } from '@/personal-line/lines';
import { buildLineSnapshot, type LineSnapshot, type PublishedLineSummary, type TermSpan } from '@/personal-line/model';
import { mountPersonalLine, type PersonalLineHandle } from '@/personal-line/render';
import '@/personal-line/personal-line.css';

const STORAGE_KEY = 'tasks.personal-line.form';

type FormState = { studentYear: number; subjects: string[]; name: string; branches: boolean };

function loadForm(): FormState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<FormState> | null;
    if (raw && typeof raw.studentYear === 'number' && Array.isArray(raw.subjects)) {
      return { studentYear: raw.studentYear, subjects: raw.subjects.filter((s) => s in SUBJECT_LINES), name: '', branches: raw.branches !== false };
    }
  } catch {
    /* first visit */
  }
  return { studentYear: 9, subjects: ['Debating', 'Legal', 'Psychology', 'Philosophy'], name: '', branches: true };
}

function saveForm(state: FormState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ studentYear: state.studentYear, subjects: state.subjects, branches: state.branches }));
  } catch {
    /* private window */
  }
}

/** Term bands for the line, from Settings term dates (start to end, so holidays are gaps). */
export function lineTerms(year: number, years: readonly SchoolYearTerms[] | null): TermSpan[] {
  return termSpans(schoolTerms(year, years)).map((span) => ({ id: span.id, start: span.start, end: span.end }));
}

/** Student-safe host, the same one published lessons use. Never the umbrella. */
export const CLASS_SITE_ORIGIN = 'https://class.adam-russell.com';

/**
 * Public link for a published line. The class host everywhere except local dev,
 * where it would point at production instead of this build.
 */
export function publicLineUrl(
  slug: string,
  current: { hostname: string; origin: string } = location
): string {
  const code = encodeURIComponent(slug);
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(current.hostname)) return `${CLASS_SITE_ORIGIN}/line#${code}`;
  const base = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${current.origin}${base.replace(/\/?$/, '/')}line.html#${code}`;
}

let handle: PersonalLineHandle | null = null;

export async function renderPersonalLineView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading the catalogue…', '.pl-builder');
  let programs: Program[];
  let termYears: readonly SchoolYearTerms[] | null = null;
  try {
    const [list, prefs] = await Promise.all([
      tasksApi.listPrograms(),
      tasksApi.getHubPrefs().then(parseHubPrefs).catch(() => null)
    ]);
    programs = list;
    termYears = prefs?.school_terms ?? null;
  } catch (err) {
    renderLoadError(canvas, err, () => void renderPersonalLineView(canvas), 'Could not load the Programs catalogue');
    return;
  }

  const state = loadForm();
  const year = new Date().getFullYear();
  const page = el('div', 'pl-builder');
  const form = el('form', 'pl-form');
  form.setAttribute('aria-label', 'Build a personal line');

  const yearsField = el('fieldset', 'pl-field');
  yearsField.append(el('legend', '', 'Year level'));
  const yearChips = el('div', 'pl-chips');
  for (let y = 7; y <= 12; y += 1) {
    const id = `pl-year-${y}`;
    const chip = el('span', 'pl-chip');
    const input = el('input');
    input.type = 'radio';
    input.name = 'pl-year';
    input.id = id;
    input.value = String(y);
    input.checked = y === state.studentYear;
    const label = el('label', '', `Year ${y}`);
    label.htmlFor = id;
    chip.append(input, label);
    yearChips.append(chip);
  }
  yearsField.append(yearChips);

  const subjectsField = el('fieldset', 'pl-field');
  subjectsField.append(el('legend', '', 'Interests'));
  subjectsField.append(el('p', 'pl-hint', 'Subjects from the catalogue, grouped by line. A small roundel means it is on that line too.'));
  for (const line of LINE_ORDER) {
    const group = el('div', 'pl-group');
    const head = el('span', 'pl-group__head');
    const rd = el('span', 'pl-rd pl-rd--sm', line);
    rd.style.background = LINES[line].color;
    rd.style.color = LINES[line].ink;
    head.append(rd, document.createTextNode(LINES[line].name));
    const chips = el('div', 'pl-chips');
    for (const [subject, lines] of Object.entries(SUBJECT_LINES)) {
      if (lines[0] !== line) continue;
      const id = `pl-sub-${subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const chip = el('span', 'pl-chip pl-chip--sm');
      const input = el('input');
      input.type = 'checkbox';
      input.id = id;
      input.value = subject;
      input.checked = state.subjects.includes(subject);
      const label = el('label', '', subject);
      label.htmlFor = id;
      label.style.setProperty('--pl-line', LINES[line].color);
      label.style.setProperty('--pl-line-ink', LINES[line].ink);
      for (const also of lines.slice(1)) {
        const extra = el('span', 'pl-rd pl-rd--sm pl-rd--also', also);
        extra.style.background = LINES[also].color;
        extra.style.color = LINES[also].ink;
        extra.title = `Also on ${LINES[also].name}`;
        label.append(extra);
      }
      chip.append(input, label);
      chips.append(chip);
    }
    group.append(head, chips);
    subjectsField.append(group);
  }

  const nameField = el('label', 'pl-field pl-name-field');
  nameField.append(el('span', '', 'First name (optional)'));
  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.id = 'pl-student-name';
  nameInput.maxLength = 24;
  nameInput.autocomplete = 'off';
  nameInput.placeholder = 'First name only';
  nameField.append(nameInput);

  const branchField = el('label', 'pl-check');
  const branchInput = el('input');
  branchInput.type = 'checkbox';
  branchInput.id = 'pl-branches';
  branchInput.checked = state.branches;
  branchField.append(branchInput, el('span', '', 'Split each line into branches (Exam, Speaking, Civics…)'));
  branchInput.addEventListener('change', () => build(false));

  const actions = el('div', 'pl-actions');
  const buildBtn = el('button', 'pl-btn pl-btn--go', 'Build line');
  buildBtn.type = 'submit';
  const publishBtn = el('button', 'pl-btn', 'Publish');
  publishBtn.type = 'button';
  actions.append(buildBtn, publishBtn);
  const status = el('div', 'pl-status');
  status.setAttribute('role', 'status');
  form.append(yearsField, subjectsField, nameField, branchField, actions, status);

  const preview = el('div', 'pl-preview');
  const published = el('section', 'pl-published');
  page.append(form, preview, published);
  canvas.replaceChildren(page);

  let snapshot: LineSnapshot;
  const readForm = (): FormState => ({
    studentYear: Number((form.querySelector('input[name="pl-year"]:checked') as HTMLInputElement | null)?.value ?? 9),
    subjects: [...form.querySelectorAll<HTMLInputElement>('.pl-group input:checked')].map((input) => input.value),
    name: nameInput.value,
    branches: branchInput.checked
  });
  const build = (animate: boolean) => {
    const next = readForm();
    saveForm(next);
    snapshot = buildLineSnapshot(programs, {
      studentYear: next.studentYear,
      subjects: next.subjects,
      studentName: next.name,
      year,
      terms: lineTerms(year, termYears)
    });
    snapshot.branches = next.branches;
    handle?.destroy();
    handle = mountPersonalLine(preview, snapshot, { animate, stamp: 'Preview, not published', branches: next.branches });
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    status.replaceChildren();
    build(true);
  });

  publishBtn.addEventListener('click', () => {
    build(false);
    if (!snapshot.items.length && !snapshot.undated.length) {
      status.replaceChildren(el('p', '', 'Nothing to publish yet. Pick a year level and at least one subject.'));
      return;
    }
    publishBtn.disabled = true;
    status.replaceChildren(el('p', '', 'Publishing…'));
    void tasksApi
      .publishPersonalLine(snapshot)
      .then((saved) => {
        status.replaceChildren(linkRow(saved, 'Published. Anyone with this link can open the line:'));
        void refreshPublished();
      })
      .catch((err) => status.replaceChildren(el('p', 'pl-error', `Could not publish: ${errorMessage(err)}`)))
      .finally(() => {
        publishBtn.disabled = false;
      });
  });

  async function refreshPublished(): Promise<void> {
    let lines: PublishedLineSummary[];
    try {
      lines = await tasksApi.listPersonalLines();
    } catch (err) {
      published.replaceChildren(el('p', 'pl-error', `Could not load published lines: ${errorMessage(err)}`));
      return;
    }
    published.replaceChildren(el('h2', '', 'Published lines'));
    if (!lines.length) {
      published.append(el('p', 'pl-hint', 'None yet. Publish a line to get a link you can send.'));
      return;
    }
    const list = el('ul', '');
    for (const line of lines.sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const li = el('li', '');
      li.append(linkRow(line, `${line.student_name ?? 'No name'} · Year ${line.student_year} · ${line.subjects.join(', ')}`));
      const remove = el('button', 'pl-btn pl-btn--quiet', 'Unpublish');
      remove.type = 'button';
      let armed = false;
      remove.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          remove.textContent = 'Unpublish: click again';
          return;
        }
        remove.disabled = true;
        void tasksApi
          .unpublishPersonalLine(line.slug)
          .then(() => refreshPublished())
          .catch((err) => li.append(el('p', 'pl-error', errorMessage(err))));
      });
      li.append(remove);
      list.append(li);
    }
    published.append(list);
  }

  build(true);
  void refreshPublished();
}

function linkRow(line: PublishedLineSummary, caption: string): HTMLElement {
  const row = el('div', 'pl-link');
  const url = publicLineUrl(line.slug);
  row.append(el('span', '', caption));
  const code = el('a', 'pl-link__url', url);
  code.href = url;
  code.target = '_blank';
  code.rel = 'noopener';
  const copy = el('button', 'pl-btn pl-btn--quiet', 'Copy link');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        copy.textContent = 'Copied';
      })
      .catch(() => {
        const range = document.createRange();
        range.selectNodeContents(code);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      });
  });
  row.append(code, copy);
  return row;
}
