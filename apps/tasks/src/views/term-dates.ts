import {
  parseHubPrefs,
  type HubPrefs,
  type SchoolYearTerms
} from '@/domain/hub-prefs';
import type { SchoolTerm } from '@/domain/school-time';
import { tasksApi } from '@/services/client-api';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { createHubField, createHubToolbar, el } from '@/views/hub-kit';

const TERM_NUMBERS = [1, 2, 3, 4] as const;

function yearsToEdit(prefs: HubPrefs): number[] {
  const years = new Set<number>([2026, 2027, ...prefs.school_terms.map((row) => row.year)]);
  return [...years].sort((a, b) => a - b);
}

function termOf(years: SchoolYearTerms[], year: number, term: 1 | 2 | 3 | 4): SchoolTerm | undefined {
  return years.find((row) => row.year === year)?.terms.find((item) => item.term === term);
}

function dateField(label: string, value: string): { el: HTMLLabelElement; input: HTMLInputElement; shown: HTMLElement } {
  const field = createHubField({ ariaLabel: label, type: 'date', value });
  const shown = el('span', 'term-dates__shown', formatDisplayDate(value));
  field.input.addEventListener('input', () => {
    shown.textContent = formatDisplayDate(field.input.value);
  });
  field.el.append(shown);
  return { el: field.el, input: field.input, shown };
}

export async function renderTermDatesView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let prefs: HubPrefs;
  try {
    prefs = parseHubPrefs(await tasksApi.getHubPrefs());
  } catch (err) {
    renderLoadError(canvas, err, () => void renderTermDatesView(canvas), 'Could not load term dates');
    return;
  }

  const statusHost = el('div', 'property-status');
  const form = el('form', 'term-dates');
  form.append(el('h2', 'section-title', 'Term dates'));
  form.append(
    el(
      'p',
      'property-section__lede',
      'NSW public dates, edit to match the College calendar.'
    )
  );

  const fields: Array<{ year: number; term: 1 | 2 | 3 | 4; start: HTMLInputElement; end: HTMLInputElement }> = [];

  for (const year of yearsToEdit(prefs)) {
    const block = el('section', 'property-section');
    block.append(el('h3', 'section-title', String(year)));
    const stored = prefs.school_terms.find((row) => row.year === year);
    if (!stored || stored.terms.length === 0) {
      block.append(el('p', 'property-section__lede', `Fill ${year} to match the College calendar.`));
    }
    for (const term of TERM_NUMBERS) {
      const existing = termOf(prefs.school_terms, year, term);
      const row = el('div', 'term-dates__row');
      const start = dateField(`T${term} ${year} start`, existing?.starts_on ?? '');
      const end = dateField(`T${term} ${year} end`, existing?.ends_on ?? '');
      row.append(start.el, end.el);
      block.append(row);
      fields.push({ year, term, start: start.input, end: end.input });
    }
    form.append(block);
  }

  const minutes = createHubField({
    ariaLabel: 'Minutes per script',
    type: 'number',
    min: '1',
    value: String(prefs.marking_default_minutes_per_script)
  });
  const minutesBlock = el('section', 'property-section');
  minutesBlock.append(el('h3', 'section-title', 'Marking'));
  minutesBlock.append(
    el('p', 'property-section__lede', 'Starting guess for minutes per script, until marking sessions exist.')
  );
  minutesBlock.append(minutes.el);
  form.append(minutesBlock);

  const toolbar = createHubToolbar('property-toolbar');
  const save = el('button', 'btn btn--primary', 'Save term dates');
  save.type = 'submit';
  toolbar.append(save);
  form.append(toolbar);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    statusHost.replaceChildren();
    const school_terms: SchoolYearTerms[] = [];
    for (const year of yearsToEdit(prefs)) {
      const terms: SchoolTerm[] = [];
      for (const term of TERM_NUMBERS) {
        const field = fields.find((item) => item.year === year && item.term === term);
        if (!field) continue;
        const starts = field.start.value;
        const ends = field.end.value;
        if (!starts && !ends) continue;
        if (!starts || !ends) {
          statusHost.append(el('p', 'empty-state', `T${term} ${year} needs a start and an end.`));
          return;
        }
        if (ends < starts) {
          statusHost.append(el('p', 'empty-state', `T${term} ${year} ends before it starts.`));
          return;
        }
        terms.push({ term, starts_on: starts, ends_on: ends });
      }
      school_terms.push({ year, terms });
    }
    const marking = Number(minutes.input.value);
    if (!Number.isFinite(marking) || marking <= 0) {
      statusHost.append(el('p', 'empty-state', 'Minutes per script needs a positive number.'));
      return;
    }
    save.disabled = true;
    void tasksApi
      .updateHubPrefs({ school_terms, marking_default_minutes_per_script: Math.round(marking) })
      .then((saved) => {
        prefs = parseHubPrefs(saved);
        statusHost.append(el('p', 'empty-state', 'Saved.'));
      })
      .catch((err) => {
        statusHost.append(el('p', 'empty-state', errorMessage(err)));
      })
      .finally(() => {
        save.disabled = false;
      });
  });

  canvas.replaceChildren(statusHost, form);
}
