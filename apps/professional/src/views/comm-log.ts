import { createCommunication } from '@/api/communications';
import { createEntity, fetchEntityOverview } from '@/api/entities';
import { createLedgerItem } from '@/api/ledger';
import { fetchPeopleDirectory, type DirectoryPersonRow } from '@/api/people-directory';
import { createUniversalLink } from '@/api/universal-links';
import { errorMessage } from '@/components/entity-field';
import {
  COMM_VERBS,
  FOLLOW_UP_CHOICES,
  WHEN_CHOICES,
  commLogBody,
  dropAts,
  dueLabel,
  followUpDue,
  liveMentions,
  localDate,
  localTime,
  noteLines,
  occurredAt,
  saveSummary,
  subjectFrom,
  verbByKey,
  whenPhrase,
  type FollowUpChoice,
  type Mention,
  type WhenChoice
} from '@/lib/comm-log';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function chip(label: string, icon?: string): HTMLButtonElement {
  const button = el('button', 'comm-log__chip') as HTMLButtonElement;
  button.type = 'button';
  if (icon) button.append(el('span', 'comm-log__chip-icon', icon));
  button.append(label);
  return button;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase();
}

/** "jo smith" → "Jo Smith"; names already capitalised stay as typed. */
function titleCase(name: string): string {
  return name.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

interface PersonPick {
  ref: string;
  name: string;
  line: string;
  isNew: boolean;
  student: boolean;
}

function fromRow(row: DirectoryPersonRow): PersonPick {
  return {
    ref: row.ref,
    name: row.display_name,
    line: row.person_type === 'student' ? 'Student' : row.role_line,
    isNew: false,
    student: row.person_type === 'student'
  };
}

/** People and students whose name has a word starting with each typed word. */
export function matchPeople(rows: readonly DirectoryPersonRow[], query: string, limit = 6): DirectoryPersonRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return rows
    .filter((row) => {
      const nameWords = row.display_name.toLowerCase().split(/\s+/);
      return words.every((word) => nameWords.some((part) => part.startsWith(word)));
    })
    .slice(0, limit);
}

/**
 * A name box over the directory. Picking a row (or "＋ Add …") calls
 * `onPick`; "＋ Add" is only offered when `onAdd` is given.
 */
function personSearch(options: {
  rows: () => DirectoryPersonRow[];
  placeholder: string;
  ariaLabel: string;
  onPick: (pick: PersonPick) => void;
  onAdd?: (name: string) => void;
  recent?: () => DirectoryPersonRow[];
}): { root: HTMLElement; input: HTMLInputElement } {
  const root = el('div', 'comm-log__search');
  const input = el('input', 'comm-log__search-input') as HTMLInputElement;
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = options.placeholder;
  input.setAttribute('aria-label', options.ariaLabel);
  const list = el('div', 'comm-log__results');
  list.hidden = true;
  let active = 0;

  function buttons(): HTMLButtonElement[] {
    return [...list.querySelectorAll<HTMLButtonElement>('button')];
  }

  function paintActive(): void {
    buttons().forEach((b, i) => b.classList.toggle('is-active', i === active));
  }

  function paint(): void {
    const query = input.value.trim();
    list.replaceChildren();
    active = 0;
    const matches = query ? matchPeople(options.rows(), query) : options.recent?.() ?? [];
    if (!query && !matches.length) {
      list.hidden = true;
      return;
    }
    if (!query) list.append(el('p', 'comm-log__results-note', 'Recent'));
    for (const row of matches) {
      const button = el('button', 'comm-log__result') as HTMLButtonElement;
      button.type = 'button';
      button.append(
        el('span', `comm-log__avatar${row.person_type === 'student' ? ' comm-log__avatar--student' : ''}`, row.initials || initials(row.display_name)),
        el('span', 'comm-log__result-name', row.display_name),
        el('span', 'comm-log__result-line', row.person_type === 'student' ? 'Student' : row.role_line)
      );
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        list.hidden = true;
        options.onPick(fromRow(row));
      });
      list.append(button);
    }
    if (query && !matches.length) list.append(el('p', 'comm-log__results-note', `No one called “${query}” in People yet.`));
    if (query && options.onAdd) {
      const add = el('button', 'comm-log__result comm-log__result--add') as HTMLButtonElement;
      add.type = 'button';
      add.textContent = `＋ Add ${query}`;
      add.addEventListener('mousedown', (event) => event.preventDefault());
      add.addEventListener('click', () => {
        list.hidden = true;
        options.onAdd!(query);
      });
      list.append(add);
    }
    list.hidden = false;
    paintActive();
  }

  input.addEventListener('input', paint);
  input.addEventListener('focus', paint);
  input.addEventListener('blur', () => {
    list.hidden = true;
  });
  input.addEventListener('keydown', (event) => {
    const all = buttons();
    if (list.hidden || !all.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length;
      paintActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      all[active]?.click();
    } else if (event.key === 'Escape') {
      list.hidden = true;
    }
  });

  root.append(input, list);
  return { root, input };
}

export async function renderCommLog(
  canvas: HTMLElement,
  options: { now?: () => Date; navigate?: (hash: string) => void } = {}
): Promise<void> {
  const now = options.now ?? (() => new Date());
  const navigate = options.navigate ?? ((hash: string) => { location.hash = hash; });

  let directory: DirectoryPersonRow[] = [];
  const loading = el('p', 'muted', 'Loading people…');
  canvas.replaceChildren(loading);
  try {
    const data = await fetchPeopleDirectory();
    directory = [...data.people, ...(data.students ?? [])].filter((row) => row.lifecycle_status !== 'archived');
  } catch {
    // Search still works for newly added people; the rail just stays thin.
  }
  const recent = () => [...directory].filter((row) => row.person_type !== 'student')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);

  // ---- state
  let person: PersonPick | null = null;
  let verbKey = COMM_VERBS[0]!.key;
  let when: WhenChoice = 'now';
  let follow: FollowUpChoice = 'none';
  let subjectOverride: string | null = null;
  const mentions: Mention[] = [];
  /** People linked without an @ (the new person's child, "＋ Link"). */
  const extraAbout: Mention[] = [];
  const ticked = new Set<string>();
  const extraTodos: string[] = [];

  const page = el('div', 'comm-log');
  const composer = el('section', 'comm-log__composer');
  const rail = el('aside', 'comm-log__rail');
  page.append(composer, rail);

  // ---- 1. who, how, when
  const whoStep = el('div', 'comm-log__step');
  whoStep.append(el('p', 'comm-log__label', 'Who, how, when'));

  const status = el('p', 'comm-log__status');
  status.hidden = true;
  function showStatus(message: string): void {
    status.hidden = false;
    status.textContent = message;
  }

  const addBox = el('div', 'comm-log__add');
  addBox.hidden = true;
  const who = personSearch({
    rows: () => directory,
    placeholder: 'Who was it with?',
    ariaLabel: 'Who was it with?',
    recent,
    onPick: (pick) => setPerson(pick),
    onAdd: (name) => openAdd(name)
  });

  const sentence = el('p', 'comm-log__sentence');
  sentence.hidden = true;

  // The add-a-person box: name, Parent / carer or Someone else, "of" child.
  let addName = '';
  let addRole: 'parent' | 'other' = 'other';
  let addChild: PersonPick | null = null;
  const addTitle = el('strong', 'comm-log__add-title');
  const roleRow = el('div', 'comm-log__chips');
  const parentChip = chip('Parent / carer');
  const otherChip = chip('Someone else');
  roleRow.append(parentChip, otherChip);
  const ofRow = el('div', 'comm-log__of');
  const childPill = el('span', 'comm-log__pill');
  const childSearch = personSearch({
    rows: () => directory,
    placeholder: 'Whose parent? Type a student…',
    ariaLabel: 'Parent of',
    onPick: (pick) => {
      addChild = pick;
      paintAdd();
    },
    onAdd: (name) => {
      void (async () => {
        try {
          const childName = titleCase(name);
          const created = await createEntity({ kind: 'person', display_name: childName });
          addChild = { ref: created.ref, name: childName, line: 'New', isNew: true, student: false };
          paintAdd();
        } catch (err) {
          showStatus(errorMessage(err, `Could not add ${name}.`));
        }
      })();
    }
  });
  ofRow.append(el('span', 'comm-log__of-word', 'of'), childPill, childSearch.root);
  const addGo = el('button', 'btn btn--primary', 'Add and use') as HTMLButtonElement;
  addGo.type = 'button';
  const addCancel = el('button', 'btn btn--ghost', 'Cancel') as HTMLButtonElement;
  addCancel.type = 'button';
  const addActions = el('div', 'comm-log__add-actions');
  addActions.append(addGo, addCancel);
  addBox.append(addTitle, roleRow, ofRow, addActions);

  function paintAdd(): void {
    addTitle.textContent = `＋ Add ${addName}`;
    parentChip.setAttribute('aria-pressed', String(addRole === 'parent'));
    otherChip.setAttribute('aria-pressed', String(addRole === 'other'));
    ofRow.hidden = addRole !== 'parent';
    childPill.hidden = !addChild;
    childSearch.root.hidden = Boolean(addChild);
    if (addChild) {
      childPill.replaceChildren(el('span', 'comm-log__avatar comm-log__avatar--student comm-log__avatar--sm', initials(addChild.name)), addChild.name);
      const clear = el('button', 'comm-log__pill-x', '×') as HTMLButtonElement;
      clear.type = 'button';
      clear.setAttribute('aria-label', `Remove ${addChild.name}`);
      clear.addEventListener('click', () => {
        addChild = null;
        paintAdd();
      });
      childPill.append(clear);
    }
  }
  parentChip.addEventListener('click', () => { addRole = 'parent'; paintAdd(); });
  otherChip.addEventListener('click', () => { addRole = 'other'; paintAdd(); });
  addCancel.addEventListener('click', () => {
    addBox.hidden = true;
    who.root.hidden = false;
    who.input.focus();
  });

  function openAdd(name: string): void {
    addName = titleCase(name);
    addRole = 'other';
    addChild = null;
    who.root.hidden = true;
    addBox.hidden = false;
    paintAdd();
  }

  addGo.addEventListener('click', () => {
    if (addRole === 'parent' && !addChild) {
      showStatus('Pick whose parent they are, or choose Someone else.');
      return;
    }
    addGo.disabled = true;
    status.hidden = true;
    void (async () => {
      try {
        const created = await createEntity({ kind: 'person', display_name: addName });
        let line = 'New';
        if (addRole === 'parent' && addChild) {
          try {
            await createUniversalLink({
              source_ref: created.ref,
              target_ref: addChild.ref,
              relationship_type: 'professional_relationship',
              role: 'parent',
              valid_from: new Date(now()).toISOString()
            });
            line = `Parent of ${addChild.name}`;
          } catch (err) {
            showStatus(`Added ${addName}, but the parent link failed: ${errorMessage(err, 'unknown error')}`);
          }
          if (!extraAbout.some((m) => m.ref === addChild!.ref)) extraAbout.push({ ref: addChild.ref, name: addChild.name });
        }
        addBox.hidden = true;
        setPerson({ ref: created.ref, name: addName, line, isNew: true, student: false });
      } catch (err) {
        showStatus(errorMessage(err, `Could not add ${addName}.`));
      } finally {
        addGo.disabled = false;
      }
    })();
  });

  // Sentence tokens.
  const verbTok = el('span', 'comm-log__tok');
  const personTok = el('button', 'comm-log__tok comm-log__tok--person') as HTMLButtonElement;
  personTok.type = 'button';
  personTok.title = 'Change who';
  const whenTok = el('span', 'comm-log__tok');
  sentence.append(verbTok, ' ', personTok, ' ', whenTok);
  personTok.addEventListener('click', () => {
    person = null;
    who.input.value = '';
    paintAll();
    who.input.focus();
  });

  const verbRow = el('div', 'comm-log__chips comm-log__chips--scroll');
  verbRow.setAttribute('role', 'group');
  verbRow.setAttribute('aria-label', 'How');
  for (const verb of COMM_VERBS) {
    const button = chip(verb.label, verb.icon);
    button.dataset.verb = verb.key;
    button.addEventListener('click', () => {
      verbKey = verb.key;
      paintAll();
    });
    verbRow.append(button);
  }

  const whenRow = el('div', 'comm-log__chips comm-log__chips--scroll');
  whenRow.setAttribute('role', 'group');
  whenRow.setAttribute('aria-label', 'When');
  const timeInput = el('input', 'comm-log__time') as HTMLInputElement;
  timeInput.type = 'time';
  timeInput.setAttribute('aria-label', 'Time');
  const pickInput = el('input', 'comm-log__time') as HTMLInputElement;
  pickInput.type = 'datetime-local';
  pickInput.setAttribute('aria-label', 'Date and time');
  for (const [key, label] of WHEN_CHOICES) {
    const button = chip(label);
    button.dataset.when = key;
    button.addEventListener('click', () => {
      when = key;
      const n = now();
      if (key === 'earlier') {
        const hourAgo = new Date(n.getTime() - 60 * 60 * 1000);
        timeInput.value = localDate(hourAgo) === localDate(n) ? localTime(hourAgo) : '00:00';
      }
      if (key === 'yesterday') timeInput.value = localTime(n);
      if (key === 'pick' && !pickInput.value) pickInput.value = `${localDate(n)}T${localTime(n)}`;
      paintAll();
    });
    whenRow.append(button);
  }
  const whenExtra = el('div', 'comm-log__when-extra');
  whenExtra.append(timeInput, pickInput);
  timeInput.addEventListener('input', () => paintAll());
  pickInput.addEventListener('input', () => paintAll());

  const how = el('div', 'comm-log__how');
  how.append(verbRow, whenRow, whenExtra);
  whoStep.append(who.root, addBox, sentence, how);

  // ---- 2. what was said
  const saidStep = el('div', 'comm-log__step');
  saidStep.append(el('p', 'comm-log__label', 'What was said'));
  const notes = el('textarea', 'comm-log__notes') as HTMLTextAreaElement;
  notes.rows = 6;
  notes.placeholder = '- What it was about\n- What they said\n- What you agreed';
  notes.setAttribute('aria-label', 'What was said');
  const mentionList = el('div', 'comm-log__results comm-log__results--mention');
  mentionList.hidden = true;
  const notesWrap = el('div', 'comm-log__notes-wrap');
  notesWrap.append(notes, mentionList);
  const hint = el('p', 'comm-log__hint');
  hint.append('Type ', el('kbd', undefined, '@'), ' to link a person. The first line becomes the subject.');

  const subjectRow = el('div', 'comm-log__subject');
  const subjectValue = el('span', 'comm-log__subject-value');
  const subjectInput = el('input', 'comm-log__subject-input') as HTMLInputElement;
  subjectInput.type = 'text';
  subjectInput.setAttribute('aria-label', 'Subject');
  subjectInput.hidden = true;
  const subjectEdit = el('button', 'comm-log__text-btn', 'Edit') as HTMLButtonElement;
  subjectEdit.type = 'button';
  subjectRow.append(el('span', 'comm-log__k', 'Subject'), subjectValue, subjectInput, subjectEdit);
  subjectEdit.addEventListener('click', () => {
    subjectOverride = subjectOverride ?? subjectFrom(notes.value);
    subjectInput.value = subjectOverride;
    subjectInput.hidden = false;
    subjectValue.hidden = true;
    subjectEdit.hidden = true;
    subjectInput.focus();
  });
  subjectInput.addEventListener('input', () => {
    subjectOverride = subjectInput.value;
    paintAll();
  });

  const linkedRow = el('div', 'comm-log__linked');
  const linkSearch = personSearch({
    rows: () => directory,
    placeholder: 'Link someone…',
    ariaLabel: 'Link a person',
    onPick: (pick) => {
      if (!extraAbout.some((m) => m.ref === pick.ref)) extraAbout.push({ ref: pick.ref, name: pick.name });
      linkSearch.input.value = '';
      linkSearch.root.hidden = true;
      paintAll();
    }
  });
  linkSearch.root.hidden = true;
  linkSearch.root.classList.add('comm-log__search--inline');
  saidStep.append(notesWrap, hint, subjectRow, linkedRow, linkSearch.root);

  // Notes: bullets on Enter, @ picker.
  let mentionActive = 0;
  function mentionQuery(): { query: string; start: number } | null {
    const before = notes.value.slice(0, notes.selectionStart ?? notes.value.length);
    const match = /(?:^|\s)@([^\s@]*(?: [^\s@]*)?)$/.exec(before);
    if (!match) return null;
    return { query: match[1]!, start: before.length - match[1]!.length - 1 };
  }
  function paintMentions(): void {
    const found = mentionQuery();
    mentionList.replaceChildren();
    const matches = found ? (found.query ? matchPeople(directory, found.query, 5) : recent()) : [];
    if (!found || !matches.length) {
      mentionList.hidden = true;
      return;
    }
    mentionActive = Math.min(mentionActive, matches.length - 1);
    matches.forEach((row, i) => {
      const button = el('button', `comm-log__result${i === mentionActive ? ' is-active' : ''}`) as HTMLButtonElement;
      button.type = 'button';
      button.append(
        el('span', `comm-log__avatar comm-log__avatar--sm${row.person_type === 'student' ? ' comm-log__avatar--student' : ''}`, row.initials || initials(row.display_name)),
        el('span', 'comm-log__result-name', row.display_name),
        el('span', 'comm-log__result-line', row.person_type === 'student' ? 'Student' : row.role_line)
      );
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => insertMention(row, found));
      mentionList.append(button);
    });
    mentionList.hidden = false;
  }
  function insertMention(row: DirectoryPersonRow, found: { query: string; start: number }): void {
    const end = found.start + 1 + found.query.length;
    const text = `@${row.display_name} `;
    notes.value = notes.value.slice(0, found.start) + text + notes.value.slice(end);
    const caret = found.start + text.length;
    notes.setSelectionRange(caret, caret);
    mentions.push({ ref: row.ref, name: row.display_name });
    mentionList.hidden = true;
    notes.focus();
    paintAll();
  }
  notes.addEventListener('focus', () => {
    if (!notes.value) notes.value = '- ';
  });
  notes.addEventListener('blur', () => {
    mentionList.hidden = true;
    if (notes.value.trim() === '-') notes.value = '';
  });
  notes.addEventListener('keydown', (event) => {
    const buttons = [...mentionList.querySelectorAll<HTMLButtonElement>('button')];
    if (!mentionList.hidden && buttons.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        mentionActive = (mentionActive + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
        buttons.forEach((b, i) => b.classList.toggle('is-active', i === mentionActive));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        buttons[mentionActive]?.click();
        return;
      }
      if (event.key === 'Escape') {
        mentionList.hidden = true;
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      const start = notes.selectionStart;
      const lineStart = notes.value.lastIndexOf('\n', start - 1) + 1;
      // Enter on an empty bullet ends the list.
      if (notes.value.slice(lineStart, start).trim() === '-') return;
      event.preventDefault();
      notes.setRangeText('\n- ', start, notes.selectionEnd, 'end');
      paintAll();
    }
  });
  notes.addEventListener('input', () => {
    mentionActive = 0;
    paintMentions();
    paintAll();
  });

  // ---- 3. next
  const nextStep = el('div', 'comm-log__step');
  nextStep.append(el('p', 'comm-log__label', 'Anything to do next?'));
  const todoNote = el('p', 'comm-log__small-caps', 'Tick a line to make it a to-do');
  const todoList = el('div', 'comm-log__todos');
  const addTodo = el('input', 'comm-log__add-todo') as HTMLInputElement;
  addTodo.type = 'text';
  addTodo.placeholder = '＋ Add a to-do';
  addTodo.setAttribute('aria-label', 'Add a to-do');
  addTodo.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !addTodo.value.trim()) return;
    event.preventDefault();
    const text = addTodo.value.trim();
    extraTodos.push(text);
    ticked.add(text);
    addTodo.value = '';
    paintAll();
  });
  const followLabel = el('p', 'comm-log__row-label');
  const followRow = el('div', 'comm-log__chips comm-log__chips--scroll');
  followRow.setAttribute('role', 'group');
  followRow.setAttribute('aria-label', 'Follow up');
  const followPick = el('input', 'comm-log__time') as HTMLInputElement;
  followPick.type = 'date';
  followPick.setAttribute('aria-label', 'Follow-up date');
  for (const [key, label] of FOLLOW_UP_CHOICES) {
    const button = chip(label);
    button.dataset.follow = key;
    button.addEventListener('click', () => {
      follow = key;
      if (key === 'pick' && !followPick.value) followPick.value = followUpDue('tomorrow', now())!;
      paintAll();
    });
    followRow.append(button);
  }
  followPick.addEventListener('input', () => paintAll());
  nextStep.append(todoNote, todoList, addTodo, followLabel, followRow, followPick);

  // ---- save
  const saveBar = el('div', 'comm-log__savebar');
  const save = el('button', 'btn btn--primary comm-log__save', 'Save') as HTMLButtonElement;
  save.type = 'button';
  const another = el('button', 'btn btn--secondary comm-log__another', 'Save and log another') as HTMLButtonElement;
  another.type = 'button';
  const sum = el('p', 'comm-log__sum');
  saveBar.append(save, another, sum);

  const rest = el('div', 'comm-log__rest');
  rest.append(saidStep, nextStep, saveBar);
  composer.append(whoStep, rest, status);

  // ---- rail
  const railToggle = el('button', 'comm-log__rail-toggle') as HTMLButtonElement;
  railToggle.type = 'button';
  railToggle.setAttribute('aria-expanded', 'false');
  railToggle.addEventListener('click', () => {
    const open = rail.classList.toggle('is-open');
    railToggle.setAttribute('aria-expanded', String(open));
  });
  const railCards = el('div', 'comm-log__rail-cards');
  rail.append(railToggle, railCards);
  const overviewCache = new Map<string, Promise<{ label: string; meta: string }[]>>();

  function recentComms(ref: string): Promise<{ label: string; meta: string }[]> {
    if (!overviewCache.has(ref)) {
      overviewCache.set(
        ref,
        fetchEntityOverview(ref)
          .then((overview) =>
            (overview.linked_records.communications ?? []).slice(0, 3).map((comm) => ({
              label: comm.display_label,
              meta: comm.supporting_label ?? ''
            }))
          )
          .catch(() => [])
      );
    }
    return overviewCache.get(ref)!;
  }

  let railPaint = 0;
  function paintRail(): void {
    const people: Array<{ ref: string; name: string; line: string; isNew: boolean; student: boolean; title: string }> = [];
    if (person) people.push({ ...person, title: person.name });
    const about = [...extraAbout, ...liveMentions(notes.value, mentions)].find((m) => m.ref !== person?.ref);
    if (about) {
      const row = directory.find((r) => r.ref === about.ref);
      people.push({
        ref: about.ref,
        name: about.name,
        line: row ? (row.person_type === 'student' ? 'Student' : row.role_line) : '',
        isNew: !row,
        student: row?.person_type === 'student',
        title: `About ${firstName(about.name)}`
      });
    }
    rail.hidden = !people.length;
    const paintId = ++railPaint;
    railCards.replaceChildren();
    let openCount = 0;
    let earlier = 0;
    const done: Promise<void>[] = [];
    for (const p of people) {
      const card = el('section', 'comm-log__card');
      const head = el('div', 'comm-log__card-head');
      const text = el('div');
      text.append(el('h3', undefined, p.title), el('p', 'comm-log__card-sub', p.isNew ? `${p.line} · added just now` : p.line));
      head.append(el('span', `comm-log__avatar${p.student ? ' comm-log__avatar--student' : ''}`, initials(p.name)), text);
      const body = el('div', 'comm-log__card-body');
      card.append(head, body);
      railCards.append(card);
      const row = directory.find((r) => r.ref === p.ref);
      if (row?.next_label && row.open_item_count > 0) {
        openCount += row.open_item_count;
        const open = el('div', 'comm-log__open');
        open.append(el('span', 'comm-log__open-pill', 'OPEN'), row.next_label);
        card.append(open);
      }
      if (p.isNew) {
        body.append(el('p', 'comm-log__empty', `This is your first logged conversation with ${firstName(p.name)}.`));
        continue;
      }
      body.append(el('p', 'comm-log__card-sub', 'Loading…'));
      done.push(
        recentComms(p.ref).then((items) => {
          if (paintId !== railPaint) return;
          earlier += items.length;
          body.replaceChildren();
          if (!items.length) {
            body.append(el('p', 'comm-log__empty', `Nothing logged with ${firstName(p.name)} yet.`));
            return;
          }
          const list = el('ul', 'comm-log__timeline');
          for (const item of items) {
            const li = el('li');
            li.append(el('span', 'comm-log__dot'), el('span', 'comm-log__tl-title', item.label));
            if (item.meta) li.append(el('span', 'comm-log__tl-meta', item.meta));
            list.append(li);
          }
          body.append(list);
        })
      );
    }
    const paintToggle = () => {
      const bits = [];
      const anchor = people[people.length - 1];
      if (anchor) bits.push(`${earlier || 'Nothing'} earlier with ${firstName(anchor.name)}`);
      if (openCount) bits.push(`${openCount} open`);
      railToggle.replaceChildren(el('span', undefined, bits.join(' · ')), el('span', 'comm-log__caret', '▾'));
    };
    paintToggle();
    void Promise.all(done).then(() => {
      if (paintId === railPaint) paintToggle();
    });
  }

  // ---- paint
  let lastRailKey = '';
  function aboutRefs(): Mention[] {
    const all = [...extraAbout, ...liveMentions(notes.value, mentions)];
    return all.filter((m, i) => m.ref !== person?.ref && all.findIndex((x) => x.ref === m.ref) === i);
  }
  function todoTexts(): string[] {
    return [...noteLines(notes.value).map(dropAts), ...extraTodos];
  }
  function chosenTodos(): string[] {
    return [...new Set(todoTexts())].filter((text) => ticked.has(text));
  }
  function due(): string | null {
    return followUpDue(follow, now(), followPick.value);
  }

  function paintAll(): void {
    const verb = verbByKey(verbKey);
    const at = occurredAt(when, now(), when === 'pick' ? pickInput.value : timeInput.value);

    who.root.hidden = Boolean(person) || !addBox.hidden;
    sentence.hidden = !person;
    how.hidden = !person;
    rest.hidden = !person;
    if (person) {
      verbTok.textContent = verb.phrase;
      personTok.replaceChildren(person.name);
      if (person.isNew && person.line !== 'New') personTok.append(el('span', 'comm-log__new', `new · ${person.line.charAt(0).toLowerCase()}${person.line.slice(1)}`));
      else if (person.isNew) personTok.append(el('span', 'comm-log__new', 'new'));
      whenTok.textContent = whenPhrase(when, at);
    }
    for (const b of verbRow.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.verb === verbKey));
    for (const b of whenRow.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.when === when));
    timeInput.hidden = when !== 'earlier' && when !== 'yesterday';
    pickInput.hidden = when !== 'pick';

    // Subject + linked.
    if (subjectOverride === null) {
      const derived = subjectFrom(notes.value);
      subjectValue.textContent = derived || 'From your first line';
      subjectValue.classList.toggle('is-placeholder', !derived);
    }
    linkedRow.replaceChildren(el('span', 'comm-log__k', 'Also files under'));
    for (const m of aboutRefs()) {
      const row = directory.find((r) => r.ref === m.ref);
      const tag = el('span', 'comm-log__tag', m.name);
      tag.append(el('small', undefined, row?.person_type === 'student' ? 'student' : 'person'));
      if (extraAbout.some((x) => x.ref === m.ref)) {
        const x = el('button', 'comm-log__pill-x', '×') as HTMLButtonElement;
        x.type = 'button';
        x.setAttribute('aria-label', `Unlink ${m.name}`);
        x.addEventListener('click', () => {
          extraAbout.splice(extraAbout.findIndex((e) => e.ref === m.ref), 1);
          paintAll();
        });
        tag.append(x);
      }
      linkedRow.append(tag);
    }
    const linkBtn = el('button', 'comm-log__tag comm-log__tag--add', '＋ Link') as HTMLButtonElement;
    linkBtn.type = 'button';
    linkBtn.addEventListener('click', () => {
      linkSearch.root.hidden = false;
      linkSearch.input.focus();
    });
    linkedRow.append(linkBtn);

    // To-dos.
    const texts = [...new Set(todoTexts())];
    for (const t of [...ticked]) if (!texts.includes(t)) ticked.delete(t);
    todoList.replaceChildren();
    todoNote.hidden = !texts.length;
    const dueNow = due();
    for (const text of texts) {
      const on = ticked.has(text);
      const row = el('button', 'comm-log__todo') as HTMLButtonElement;
      row.type = 'button';
      row.setAttribute('role', 'checkbox');
      row.setAttribute('aria-checked', String(on));
      row.append(
        el('span', 'comm-log__box', on ? '✓' : ''),
        el('span', 'comm-log__todo-text', text),
        el('span', 'comm-log__todo-when', on ? (dueNow ? `To-do · due ${dueLabel(dueNow)}` : 'To-do') : 'Make a to-do')
      );
      row.addEventListener('click', () => {
        if (ticked.has(text)) ticked.delete(text);
        else ticked.add(text);
        paintAll();
      });
      todoList.append(row);
    }
    followLabel.textContent = person ? `Follow up with ${firstName(person.name)}` : 'Follow up';
    for (const b of followRow.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.follow === follow));
    followPick.hidden = follow !== 'pick';

    sum.textContent = saveSummary({ verbKey, todoCount: chosenTodos().length, followUpDue: dueNow });
    const names = [person?.name, ...aboutRefs().map((m) => m.name)].filter(Boolean).map((n) => `${firstName(n!)}'s`);
    if (names.length) sum.append(el('br'), `Shows on ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]} timeline${names.length > 1 ? 's' : ''}.`);

    const railKey = [person?.ref, ...aboutRefs().map((m) => m.ref)].join('|');
    if (railKey !== lastRailKey) {
      lastRailKey = railKey;
      paintRail();
    }
  }

  function setPerson(pick: PersonPick): void {
    person = pick;
    status.hidden = true;
    paintAll();
    if (!notes.value) notes.focus();
  }

  function reset(): void {
    person = null;
    verbKey = COMM_VERBS[0]!.key;
    when = 'now';
    follow = 'none';
    subjectOverride = null;
    mentions.length = 0;
    extraAbout.length = 0;
    extraTodos.length = 0;
    ticked.clear();
    notes.value = '';
    who.input.value = '';
    subjectInput.hidden = true;
    subjectValue.hidden = false;
    subjectEdit.hidden = false;
    paintAll();
    who.input.focus();
  }

  async function submit(thenAnother: boolean): Promise<void> {
    if (!person) return;
    if (!noteLines(notes.value).length && subjectOverride === null) {
      showStatus('Write at least one line about what was said.');
      notes.focus();
      return;
    }
    save.disabled = true;
    another.disabled = true;
    status.hidden = true;
    const p = person;
    try {
      const { communication } = await createCommunication(
        commLogBody({
          verbKey,
          personRef: p.ref,
          at: occurredAt(when, now(), when === 'pick' ? pickInput.value : timeInput.value),
          notes: notes.value,
          subject: subjectOverride ?? '',
          aboutRefs: aboutRefs().map((m) => m.ref)
        })
      );
      const commRef = `professional:communication:${communication.id}`;
      const dueDate = due();
      const items = chosenTodos().map((text) => ({ text, due: dueDate }));
      if (dueDate) items.push({ text: `Follow up with ${firstName(p.name)}`, due: dueDate });
      const results = await Promise.allSettled(
        items.map((item) =>
          createLedgerItem({ person_ref: p.ref, direction: 'you_owe', text: item.text, comm_ref: commRef, due: item.due })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) {
        save.disabled = false;
        another.disabled = false;
        showStatus(`Saved the conversation, but ${failed} to-do${failed > 1 ? 's' : ''} did not save. Add ${failed > 1 ? 'them' : 'it'} from the saved page.`);
        const open = el('a', 'comm-log__text-btn', 'Open the saved conversation') as HTMLAnchorElement;
        open.href = `#/communication/${encodeURIComponent(communication.id)}`;
        status.append(' ', open);
        return;
      }
      if (thenAnother) {
        reset();
        showStatus(`Saved. Logged with ${p.name}.`);
        save.disabled = false;
        another.disabled = false;
        return;
      }
      navigate(`#/communication/${encodeURIComponent(communication.id)}`);
    } catch (err) {
      save.disabled = false;
      another.disabled = false;
      showStatus(errorMessage(err, 'Could not save. Try again.'));
    }
  }
  save.addEventListener('click', () => void submit(false));
  another.addEventListener('click', () => void submit(true));

  canvas.replaceChildren(page);
  paintAll();
  who.input.focus();
}
