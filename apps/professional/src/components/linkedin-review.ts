/**
 * Paste from LinkedIn: a paste box, then a review card of tickable rows
 * (Current roles, Past work, Education, About). The same card serves a new
 * person and "Update from LinkedIn" on an existing one. Saving creates any
 * new Organisations first, then the person if new, then every link at once.
 */

import { ApiClientError } from '@/api/client';
import { createEntity } from '@/api/entities';
import { createObservation } from '@/api/observations';
import { addPersonRole, editPersonRole } from '@/api/people-roles';
import {
  LINKEDIN_TEXT_CAP,
  parseLinkedInPaste,
  type LinkedInParseResult,
  type LinkedInReviewRow
} from '@/api/people-linkedin';
import { formatMonthYear, parseMonthYear } from '@/domain/person-roles';
import type { EntityRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, className: string): HTMLButtonElement {
  const b = el('button', className, text) as HTMLButtonElement;
  b.type = 'button';
  return b;
}

const PARSE_ERRORS: Record<string, string> = {
  linkedin_parse_unconfigured: 'Paste reading is not set up. You can still type it in below.',
  paste_too_long: 'That’s longer than a profile. Paste just the profile page.'
};
const PARSE_FALLBACK = 'Couldn’t read that paste. Try again or type it in.';

/** The paste box. `onParsed` receives the review rows. */
export function mountLinkedInPaste(
  host: HTMLElement,
  options: { personRef?: string | null; onParsed: (result: LinkedInParseResult) => void }
): { focus: () => void; reset: () => void } {
  const box = el('section', 'linkedin-paste');
  box.setAttribute('aria-label', 'Paste from LinkedIn');
  box.append(el('h3', 'linkedin-paste__title', 'Paste from LinkedIn'));
  box.append(el('p', 'linkedin-paste__help', 'Open their profile, select all, copy, and paste it here. Nothing is fetched or kept.'));
  const area = document.createElement('textarea');
  area.className = 'linkedin-paste__area';
  area.rows = 4;
  area.setAttribute('aria-label', 'LinkedIn profile text');
  area.placeholder = 'Paste the profile page…';
  const status = el('p', 'linkedin-paste__status');
  status.setAttribute('role', 'alert');
  status.hidden = true;
  const read = button('Read profile', 'btn btn--secondary');
  read.disabled = true;
  area.addEventListener('input', () => {
    read.disabled = !area.value.trim() || read.dataset.off === '1';
  });
  read.addEventListener('click', () => {
    const text = area.value.trim();
    if (!text) return;
    if (text.length > LINKEDIN_TEXT_CAP) {
      status.hidden = false;
      status.textContent = PARSE_ERRORS.paste_too_long!;
      return;
    }
    status.hidden = true;
    read.disabled = true;
    read.textContent = 'Reading…';
    void parseLinkedInPaste({ text, person_ref: options.personRef ?? null })
      .then((result) => options.onParsed(result))
      .catch((err) => {
        status.hidden = false;
        const code = err instanceof ApiClientError ? err.code : '';
        status.textContent = PARSE_ERRORS[code] ?? PARSE_FALLBACK;
        if (code === 'linkedin_parse_unconfigured') read.dataset.off = '1';
      })
      .finally(() => {
        read.textContent = 'Read profile';
        read.disabled = !area.value.trim() || read.dataset.off === '1';
      });
  });
  const actions = el('div', 'linkedin-paste__actions');
  actions.append(read);
  box.append(area, status, actions);
  host.append(box);
  return {
    focus: () => area.focus(),
    reset: () => {
      area.value = '';
      status.hidden = true;
      read.disabled = true;
    }
  };
}

export interface LinkedInSelection {
  name: string;
  rows: LinkedInReviewRow[];
  about: string | null;
}

export interface LinkedInSaveApi {
  createEntity: typeof createEntity;
  addPersonRole: typeof addPersonRole;
  editPersonRole: typeof editPersonRole;
  createObservation: typeof createObservation;
}

const defaultApi: LinkedInSaveApi = { createEntity, addPersonRole, editPersonRole, createObservation };

export interface LinkedInSaveResult {
  person: EntityRecord | null;
  personRef: string;
  saved: number;
  failed: string[];
  /** The first current role that saved, for the new directory row. */
  role: { organisation: { ref: string; display_label: string }; title: string | null; current: boolean } | null;
}

/**
 * New Organisations first (one per distinct name), then the person if new,
 * then every link and the About observation in parallel. A failed link is
 * reported, never rolled back.
 */
export async function saveLinkedInSelection(
  selection: LinkedInSelection,
  target: { personRef: string | null },
  api: LinkedInSaveApi = defaultApi
): Promise<LinkedInSaveResult> {
  const newOrgs = new Map<string, string>();
  for (const row of selection.rows) {
    if (row.organisation.status === 'new_organisation' && !newOrgs.has(row.organisation.name)) {
      newOrgs.set(row.organisation.name, '');
    }
  }
  for (const name of newOrgs.keys()) {
    const org = await api.createEntity({ kind: 'organisation', display_name: name });
    newOrgs.set(name, org.ref);
  }

  let person: EntityRecord | null = null;
  let personRef = target.personRef;
  if (!personRef) {
    person = await api.createEntity({ kind: 'person', display_name: selection.name });
    personRef = person.ref;
  }
  const ref = personRef;

  const writes: Array<{ label: string; run: () => Promise<unknown> }> = selection.rows.map((row) => {
    const from = row.start ? parseMonthYear(row.start) ?? null : null;
    const to = row.current ? null : row.end ? parseMonthYear(row.end) ?? null : null;
    const label = [row.title, row.organisation.name].filter(Boolean).join(', ');
    if (row.diff === 'changed' && row.link_id) {
      return { label, run: () => api.editPersonRole({ person_ref: ref, link_id: row.link_id!, valid_from: from, valid_to: to }) };
    }
    const orgRef = row.organisation.ref ?? newOrgs.get(row.organisation.name)!;
    return {
      label,
      run: () => api.addPersonRole({
        person_ref: ref,
        organisation_ref: orgRef,
        relationship_type: row.relationship_type,
        role: row.title,
        valid_from: from,
        valid_to: to
      })
    };
  });
  if (selection.about) {
    const about = selection.about;
    writes.push({
      label: 'About',
      run: () => api.createObservation({
        about_ref: ref,
        text: `LinkedIn paste: ${about}`,
        occurred_at: new Date().toISOString(),
        source: 'imported',
        linked_ref: null
      })
    });
  }
  const settled = await Promise.allSettled(writes.map((w) => w.run()));
  const failed = settled.flatMap((s, i) => (s.status === 'rejected' ? [writes[i]!.label] : []));
  const firstIndex = selection.rows.findIndex((row, i) => row.current && row.section !== 'education' && settled[i]?.status === 'fulfilled');
  const first = firstIndex >= 0 ? selection.rows[firstIndex]! : null;
  const role = first
    ? {
        organisation: { ref: first.organisation.ref ?? newOrgs.get(first.organisation.name)!, display_label: first.organisation.name },
        title: first.title,
        current: true
      }
    : null;
  return { person, personRef: ref, saved: writes.length - failed.length, failed, role };
}

const SECTIONS: Array<{ key: LinkedInReviewRow['section']; title: string }> = [
  { key: 'current', title: 'Current roles' },
  { key: 'past', title: 'Past work' },
  { key: 'education', title: 'Education' }
];

function rowRange(row: LinkedInReviewRow): string {
  const fmt = (v: string | null) => (v ? formatMonthYear(parseMonthYear(v) ?? null) : '');
  const from = fmt(row.start);
  const to = row.current ? 'now' : fmt(row.end);
  if (!from && !to) return '';
  if (!from) return to === 'now' ? '' : `until ${to}`;
  return to && to !== from ? `${from} – ${to}` : from;
}

/**
 * The review card. Every row starts ticked; on an existing person rows that
 * already match are hidden behind "Show unchanged".
 */
export function renderLinkedInReview(
  host: HTMLElement,
  options: {
    result: LinkedInParseResult;
    existing: { name: string } | null;
    crest: (orgRef: string | null, orgName: string) => HTMLElement;
    onBack: () => void;
    onSave: (selection: LinkedInSelection) => Promise<void>;
  }
): void {
  host.replaceChildren();
  const card = el('section', 'linkedin-review');
  card.setAttribute('aria-label', 'Review LinkedIn details');
  const { result, existing } = options;
  const checks = new Map<string, HTMLInputElement>();

  const head = el('div', 'linkedin-review__head');
  let nameInput: HTMLInputElement | null = null;
  if (existing) {
    head.append(el('h3', 'linkedin-review__title', `Update ${existing.name} from LinkedIn`));
  } else {
    head.append(el('h3', 'linkedin-review__title', 'Check what we found'));
    nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'linkedin-review__name';
    nameInput.setAttribute('aria-label', 'Name');
    nameInput.value = result.name ?? '';
    head.append(nameInput);
  }
  if (result.headline) head.append(el('p', 'linkedin-review__headline', result.headline));
  card.append(head);

  const hiddenSame = result.rows.filter((r) => r.diff === 'same');
  const unchanged: HTMLElement[] = [];

  for (const section of SECTIONS) {
    const rows = result.rows.filter((r) => r.section === section.key);
    if (!rows.length) continue;
    const group = el('div', 'linkedin-review__group');
    group.append(el('div', 'linkedin-review__h', section.title));
    for (const row of rows) {
      const line = el('label', `linkedin-review__row${row.diff === 'same' ? ' is-same' : ''}`);
      line.dataset.rowId = row.id;
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = row.diff !== 'same';
      check.setAttribute('aria-label', `Include ${[row.title, row.organisation.name].filter(Boolean).join(', ')}`);
      checks.set(row.id, check);
      const crest = options.crest(row.organisation.ref, row.organisation.name);
      const text = el('span', 'linkedin-review__text');
      text.append(el('span', 'linkedin-review__label', [row.title, row.organisation.name].filter(Boolean).join(', ')));
      const range = rowRange(row);
      const sub = [range, row.diff === 'changed' ? 'dates differ from the profile' : row.diff === 'same' ? 'already saved' : '']
        .filter(Boolean)
        .join(' · ');
      if (sub) text.append(el('span', 'linkedin-review__sub', sub));
      const pill = el(
        'span',
        `linkedin-review__pill linkedin-review__pill--${row.organisation.status === 'matched' ? 'matched' : 'new'}`,
        row.organisation.status === 'matched' ? 'matched' : 'new organisation'
      );
      line.append(check, crest, text, pill);
      if (row.diff === 'same') {
        line.hidden = true;
        unchanged.push(line);
      }
      group.append(line);
    }
    card.append(group);
  }

  let aboutCheck: HTMLInputElement | null = null;
  if (result.about) {
    const group = el('div', 'linkedin-review__group');
    group.append(el('div', 'linkedin-review__h', 'About'));
    const line = el('label', 'linkedin-review__row linkedin-review__row--about');
    aboutCheck = document.createElement('input');
    aboutCheck.type = 'checkbox';
    aboutCheck.checked = true;
    aboutCheck.setAttribute('aria-label', 'Include About');
    line.append(aboutCheck, el('span', 'linkedin-review__about', result.about));
    group.append(line);
    card.append(group);
  }

  if (hiddenSame.length) {
    const toggle = button(`Show ${hiddenSame.length} unchanged`, 'linkedin-review__toggle');
    toggle.addEventListener('click', () => {
      const showing = unchanged[0]?.hidden === false;
      for (const line of unchanged) line.hidden = showing;
      toggle.textContent = showing ? `Show ${hiddenSame.length} unchanged` : 'Hide unchanged';
    });
    card.append(toggle);
  }

  if (!result.rows.length && !result.about) {
    card.append(el('p', 'people-pane__empty', 'No roles, education or About found in that paste.'));
  }

  const status = el('p', 'linkedin-review__status');
  status.setAttribute('role', 'alert');
  status.hidden = true;
  const back = button('Back to paste', 'btn btn--ghost');
  back.addEventListener('click', options.onBack);
  const save = button('', 'btn btn--primary');
  const actions = el('div', 'linkedin-review__actions');
  actions.append(back, save);
  card.append(status, actions);

  function selected(): LinkedInReviewRow[] {
    return result.rows.filter((r) => checks.get(r.id)?.checked);
  }
  function count(): number {
    return selected().length + (aboutCheck?.checked ? 1 : 0);
  }
  function syncLabel(): void {
    const n = count();
    const first = (nameInput?.value.trim() || 'them').split(/\s+/)[0];
    save.textContent = existing
      ? `Save ${n} change${n === 1 ? '' : 's'}`
      : `Add ${first} with ${n} item${n === 1 ? '' : 's'}`;
    save.disabled = existing ? n === 0 : !nameInput?.value.trim();
  }
  card.addEventListener('change', syncLabel);
  nameInput?.addEventListener('input', syncLabel);
  syncLabel();

  save.addEventListener('click', () => {
    const name = nameInput ? nameInput.value.trim() : existing!.name;
    if (!name) return;
    save.disabled = true;
    back.disabled = true;
    status.hidden = true;
    const label = save.textContent;
    save.textContent = 'Saving…';
    void options
      .onSave({ name, rows: selected(), about: aboutCheck?.checked ? result.about : null })
      .catch((err) => {
        status.hidden = false;
        status.textContent = err instanceof Error ? err.message : 'That didn’t save.';
        save.textContent = label;
        save.disabled = false;
        back.disabled = false;
      });
  });

  host.append(card);
}
