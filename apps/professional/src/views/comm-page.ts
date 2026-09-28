import { mountTagAnythingSection } from '@/views/entity-tagger';
import { createCommunication, getCommunication, updateCommunication } from '@/api/communications';
import {
  createTask,
  createUniversalLink,
  endUniversalLink,
  listUniversalLinksForEntity,
  type UniversalLinkEntry
} from '@/api/universal-links';
import { createLedgerItem, listLedgerForSources, patchLedger } from '@/api/ledger';
import { mountBlockPage, type BlockPageHandle } from '@/components/block-page';
import { buildFollowUpSection } from '@/views/communications';
import { nextSwitchDelayMs, phaseFor, type CommPhase } from '@/lib/comm-phase';
import { blockPlainText, extractInlinePromises, resolvePromiseOwner, type PersonOnPage } from '@/lib/inline-promises';
import { listThreads } from '@/api/threads';
import { pickThreadForComm, type ThreadCandidate } from '@/lib/thread-match';
import { threadRoute } from '@/app/router';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { AgendaItem, CommunicationRecord, LedgerItem } from '@/domain/types';
import { clareBrief, clareDrafts, clareHandwriting, clareProposeNext, clareSummary, type ClareDraft } from '@/api/clare-comms';
import { buildClareContext } from '@/lib/clare-context';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const CHANNEL_LABEL: Record<string, string> = {
  in_person: 'in person', email: 'email', phone: 'call', message: 'text', video: 'video', other: 'other'
};

type PageData = {
  record: CommunicationRecord;
  commRef: string;
  withPeople: PersonOnPage[];
  alsoConcerned: PersonOnPage[];
  thread: { ref: string; label: string; id: string } | null;
  previousRef: string | null;
  memberCount: number;
  ledger: LedgerItem[];
};

function personFrom(entry: UniversalLinkEntry): PersonOnPage {
  return { ref: entry.endpoint!.ref, name: entry.endpoint!.display_label };
}

async function loadPage(id: string): Promise<PageData> {
  const { communication: record } = await getCommunication(id);
  const commRef = `professional:communication:${id}`;
  const links = await listUniversalLinksForEntity(commRef);
  const current = links.outgoing.filter((entry) => entry.link.status === 'current');
  const withPeople = current.filter((entry) => entry.link.relationship_type === 'recipient').map(personFrom);
  const alsoConcerned = current.filter((entry) => entry.link.relationship_type === 'about_person').map(personFrom);
  const threadEntry = current.find((entry) => entry.link.relationship_type === 'in_thread') ?? null;

  let previousRef: string | null = null;
  let memberCount = 0;
  if (threadEntry) {
    const members = (await listUniversalLinksForEntity(threadEntry.endpoint!.ref)).incoming
      .filter((entry) => entry.link.relationship_type === 'in_thread' && entry.link.status === 'current');
    memberCount = members.length;
    const ordered = members
      .map((entry) => ({ ref: entry.link.source_ref, at: String(entry.link.created_at ?? '') }))
      .sort((a, b) => a.at.localeCompare(b.at));
    const index = ordered.findIndex((member) => member.ref === commRef);
    previousRef = index > 0 ? ordered[index - 1]!.ref : null;
  }
  const refs = previousRef ? [commRef, previousRef] : [commRef];
  const { items: ledger } = await listLedgerForSources(refs);
  const thread = threadEntry
    ? { ref: threadEntry.endpoint!.ref, label: threadEntry.endpoint!.display_label, id: threadEntry.endpoint!.ref.split(':').pop()! }
    : null;
  return { record, commRef, withPeople, alsoConcerned, thread, previousRef, memberCount, ledger };
}

async function autoJoinThread(data: PageData): Promise<{ threadRef: string; label: string; linkId: string } | null> {
  if (data.thread || !data.record.purpose_tag) return null;
  const personRefs = [...data.withPeople, ...data.alsoConcerned].map((person) => person.ref);
  if (!personRefs.length) return null;
  const { threads } = await listThreads();
  const candidates: ThreadCandidate[] = [];
  for (const thread of threads.filter((entry) => entry.status === 'open' && entry.purpose_tag === data.record.purpose_tag)) {
    const threadRef = `professional:thread:${thread.id}`;
    const members = (await listUniversalLinksForEntity(threadRef)).incoming.filter((entry) => entry.link.relationship_type === 'in_thread');
    const latest = members.at(-1);
    const people = latest
      ? (await listUniversalLinksForEntity(latest.link.source_ref)).outgoing
          .filter((entry) => ['recipient', 'about_person'].includes(entry.link.relationship_type))
          .map((entry) => entry.endpoint!.ref)
      : [];
    candidates.push({ id: thread.id, status: thread.status, purpose_tag: thread.purpose_tag, personRefs: people, lastAt: thread.updated_at });
  }
  const pick = pickThreadForComm({ personRefs, purposeTag: data.record.purpose_tag, at: data.record.scheduled_start ?? data.record.occurred_at }, candidates);
  if (!pick.join) return null;
  const threadRef = `professional:thread:${pick.join}`;
  const { link } = await createUniversalLink({ source_ref: data.commRef, target_ref: threadRef, relationship_type: 'in_thread' });
  const label = threads.find((thread) => thread.id === pick.join)!.title;
  return { threadRef, label, linkId: link.id };
}

export async function renderCommPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  let data: PageData;
  try {
    data = await loadPage(id);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderCommPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(data.record.subject || 'Comm');

  let phase: CommPhase = phaseFor(data.record, new Date());
  let manual = false;
  let clock: ReturnType<typeof setTimeout> | null = null;
  let blockPage: BlockPageHandle | null = null;

  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
  const clareContext = () => buildClareContext({
    title: data.record.subject || 'Comm',
    kind: 'comm',
    when: whenLabel(data.record),
    withPeople: data.withPeople,
    alsoConcerned: data.alsoConcerned,
    previousSummaries: [],
    ledger: data.ledger,
    blocks: data.record.blocks ?? [],
    summary: data.record.summary || null,
    todayKey,
    extra: {
      time_zone: data.record.time_zone ?? 'Australia/Sydney',
      purpose_tag: data.record.purpose_tag ?? null,
      thread_ref: data.thread?.ref ?? null,
      channel: data.record.channel
    }
  });

  function clareCard(part: string, title: string): { card: HTMLElement; body: HTMLElement } {
    const card = el('section', 'card clare');
    card.dataset.part = part;
    const head = el('p', 'clare__who', `✦ Clare · ${title}`);
    const body = el('div', 'clare__body');
    card.append(head, body);
    return { card, body };
  }

  function showClareError(body: HTMLElement, err: unknown, retry: () => void): void {
    body.replaceChildren(el('p', 'muted', err instanceof Error ? err.message : 'Clare could not finish.'));
    const again = el('button', 'btn btn--ghost', 'Try again') as HTMLButtonElement;
    again.type = 'button';
    again.addEventListener('click', retry);
    body.append(again);
  }

  const root = el('div', 'comm-page');
  const head = el('header', 'comm-page__head');
  const chips = el('div', 'comm-page__chips');
  chips.append(el('span', 'chip chip--comm', `● Comm · ${CHANNEL_LABEL[data.record.channel] ?? data.record.channel}`));
  if (data.record.purpose_tag) chips.append(el('span', 'chip', data.record.purpose_tag));
  const when = el('p', 'comm-page__when', whenLabel(data.record));
  const switcher = el('div', 'comm-page__phase');
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Page phase');
  const note = el('p', 'comm-page__phase-note');
  for (const value of ['before', 'during', 'after'] as const) {
    const button = el('button', 'comm-page__phase-btn', value[0]!.toUpperCase() + value.slice(1)) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.setPhase = value;
    button.addEventListener('click', () => {
      manual = true;
      setPhase(value);
    });
    switcher.append(button);
  }
  head.append(chips, when, switcher, note);

  const threadStrip = el('p', 'comm-page__thread');
  if (data.thread) {
    const link = el('a', undefined, data.thread.label) as HTMLAnchorElement;
    link.href = threadRoute(data.thread.id);
    threadStrip.append(el('span', 'eyebrow', 'Thread'), link, el('span', 'muted', ` · ${data.memberCount} in thread`));
  } else {
    threadStrip.hidden = true;
  }

  const main = el('div', 'comm-page__main');
  const rail = buildPeopleRail(data);
  const tagCard = el('section', 'card comm-page__tags');
  mountTagAnythingSection(tagCard, `professional:communication:${data.record.id}`);
  rail.append(tagCard);
  const grid = el('div', 'comm-page__grid');
  grid.append(main, rail);
  root.append(head, threadStrip, grid);
  canvas.replaceChildren(root);

  void autoJoinThread(data).then((joined) => {
    if (!joined || !root.isConnected) return;
    threadStrip.hidden = false;
    threadStrip.replaceChildren(el('span', 'eyebrow', 'Thread'), el('span', undefined, `Added to ${joined.label}`));
    const undo = el('button', 'btn btn--ghost', 'Undo') as HTMLButtonElement;
    undo.type = 'button';
    undo.dataset.part = 'thread-undo';
    undo.addEventListener('click', async () => {
      await endUniversalLink(joined.linkId);
      threadStrip.hidden = true;
    });
    threadStrip.append(undo);
  });

  function setPhase(next: CommPhase): void {
    phase = next;
    root.dataset.phase = next;
    for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-set-phase]')) {
      button.setAttribute('aria-pressed', String(button.dataset.setPhase === next));
    }
    note.textContent = manual ? 'Switched by hand' : autoNote(data.record, next);
    void blockPage?.flush();
    blockPage?.dispose();
    blockPage = null;
    main.replaceChildren();
    if (next === 'before') paintBefore();
    else if (next === 'during') paintDuring();
    else paintAfter();
  }

  function scheduleClock(): void {
    if (clock !== null) clearTimeout(clock);
    const delay = nextSwitchDelayMs(data.record, new Date());
    if (delay === null) return;
    clock = setTimeout(() => {
      if (!root.isConnected) return;
      if (!manual) setPhase(phaseFor(data.record, new Date()));
      scheduleClock();
    }, delay);
  }

  function carriedCard(): HTMLElement {
    const card = el('section', 'card comm-page__carried');
    card.dataset.part = 'carried';
    card.append(el('h3', undefined, 'Carried from last time'));
    const carried = data.ledger.filter((item) => item.comm_ref === data.previousRef);
    if (!carried.length) card.append(el('p', 'muted', 'Nothing carried.'));
    for (const item of carried) card.append(tickRow(item));
    return card;
  }

  function tickRow(item: LedgerItem): HTMLElement {
    const row = el('button', `tick${item.status === 'done' ? ' is-done' : ''}`) as HTMLButtonElement;
    row.type = 'button';
    row.dataset.ledgerId = item.id;
    row.dataset.owner = item.direction === 'you_owe' ? 'you' : 'them';
    row.append(el('span', 'tick__box', item.status === 'done' ? '✓' : ''), el('span', 'tick__text', item.text),
      el('span', `who-tag ${item.direction === 'you_owe' ? 'who-me' : 'who-them'}`, item.direction === 'you_owe' ? 'You' : 'Them'));
    row.addEventListener('click', async () => {
      const done = item.status !== 'done';
      const { item: next } = await patchLedger(item.id, done ? { status: 'done', checked_in_ref: data.commRef } : { status: 'open', checked_in_ref: null });
      Object.assign(item, next);
      row.classList.toggle('is-done', done);
      row.querySelector('.tick__box')!.textContent = done ? '✓' : '';
    });
    return row;
  }

  function agendaCard(): HTMLElement {
    const card = el('section', 'card comm-page__agenda');
    card.append(el('h3', undefined, 'Agenda'));
    const list = el('ol', 'agenda');
    const render = () => {
      list.replaceChildren();
      for (const item of data.record.agenda ?? []) {
        const li = el('li', `agenda__item${item.done ? ' is-done' : ''}`, item.text);
        li.append(el('span', 'agenda__from', item.source));
        list.append(li);
      }
    };
    const input = el('input', 'agenda__add') as HTMLInputElement;
    input.placeholder = 'Add an item…';
    input.setAttribute('aria-label', 'Add agenda item');
    input.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' || !input.value.trim()) return;
      const agenda: AgendaItem[] = [...(data.record.agenda ?? []), { id: `ag_${Date.now()}`, text: input.value.trim(), source: 'you' }];
      input.value = '';
      data.record = (await updateCommunication(data.record.id, { agenda })).communication;
      render();
    });
    render();
    card.append(list, input);
    return card;
  }

  function paintBefore(): void {
    const { card, body } = clareCard('clare-brief', 'brief');
    const load = () => {
      body.replaceChildren(el('p', 'muted', 'Clare is reading the thread…'));
      clareBrief(clareContext()).then((brief) => {
        body.replaceChildren();
        const list = el('ol');
        for (const point of brief.points) {
          const li = el('li', undefined, point.text);
          li.append(el('span', 'src', ` · ${point.source}`));
          list.append(li);
        }
        body.append(list);
        if (brief.owed_line) body.append(el('p', 'muted', brief.owed_line));
        const refresh = el('button', 'btn btn--ghost', 'Refresh') as HTMLButtonElement;
        refresh.type = 'button';
        refresh.addEventListener('click', load);
        body.append(refresh);
      }, (err) => showClareError(body, err, load));
    };
    load();
    main.append(card, carriedCard(), agendaCard());
  }

  function paintDuring(): void {
    const strip = el('div', 'live-strip');
    const end = el('button', 'btn btn--ghost', 'End ›') as HTMLButtonElement;
    end.type = 'button';
    end.addEventListener('click', async () => {
      const nowIso = new Date().toISOString();
      data.record = (await updateCommunication(data.record.id, {
        scheduled_start: data.record.scheduled_start ?? nowIso,
        scheduled_end: nowIso,
        time_zone: data.record.time_zone ?? 'Australia/Sydney'
      })).communication;
      manual = false;
      setPhase('after');
    });
    strip.append(el('span', 'live-strip__rec', 'Live'), end);
    const photo = el('label', 'btn btn--ghost', '✎ Read a photo');
    const file = el('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = 'image/jpeg,image/png,image/webp';
    file.hidden = true;
    photo.append(file);
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      if (!picked || !blockPage) return;
      photo.firstChild!.textContent = 'Reading…';
      try {
        const { text } = await clareHandwriting(picked);
        const stamp = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).format(new Date());
        const html = `<p><em>From your handwriting · ${stamp}</em></p>` + text.split('\n').map((lineText) => `<p>${lineText.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]!)}</p>`).join('');
        blockPage.append([{ id: `hand_${Date.now()}`, block_type: 'rich_text', variant: 'medium', content: { html } }]);
      } catch (err) {
        strip.append(el('span', 'muted', err instanceof Error ? err.message : 'Clare could not read that photo.'));
      } finally {
        photo.firstChild!.textContent = '✎ Read a photo';
        file.value = '';
      }
    });
    strip.append(photo);
    const body = el('div', 'comm-page__body');
    main.append(strip, body);
    blockPage = mountBlockPage(body, {
      blocks: (data.record.blocks ?? []) as never[],
      onSave: async (blocks) => {
        data.record = (await updateCommunication(data.record.id, { blocks })).communication;
        await syncInlinePromises(blocks);
      }
    });
  }

  async function syncInlinePromises(blocks: unknown[]): Promise<void> {
    const people = [...data.withPeople, ...data.alsoConcerned];
    for (const promise of extractInlinePromises(blockPlainText(blocks))) {
      const owner = resolvePromiseOwner(promise.owner, people);
      if (!owner) continue;
      // The ledger dedupes by person + direction + text + source, so re-saving never duplicates.
      const { item, created } = await createLedgerItem({ ...owner, text: promise.text, comm_ref: data.commRef });
      if (created) data.ledger.push(item);
    }
  }

  function paintAfter(): void {
    const summary = el('section', 'card comm-page__summary');
    summary.append(el('h3', undefined, 'Summary'));
    const text = el('textarea', 'comm-page__summary-text') as HTMLTextAreaElement;
    text.value = data.record.summary;
    text.setAttribute('aria-label', 'Summary');
    text.addEventListener('change', async () => {
      data.record = (await updateCommunication(data.record.id, { summary: text.value })).communication;
    });
    summary.append(text);

    const clareRow = el('div', 'clare-row');
    const summarise = el('button', 'btn btn--secondary', '✦ Summarise') as HTMLButtonElement;
    summarise.type = 'button';
    summarise.dataset.part = 'clare-summarise';
    const draftsBtn = el('button', 'btn btn--secondary', '✦ Draft follow-ups') as HTMLButtonElement;
    draftsBtn.type = 'button';
    draftsBtn.dataset.part = 'clare-drafts';
    const nextBtn = el('button', 'btn btn--ghost', '✦ Suggest next session') as HTMLButtonElement;
    nextBtn.type = 'button';
    nextBtn.hidden = !data.thread;
    clareRow.append(summarise, draftsBtn, nextBtn);
    const found = el('div', 'clare-found');
    const draftsHost = el('div', 'clare-drafts');

    summarise.addEventListener('click', async () => {
      summarise.disabled = true;
      try {
        const out = await clareSummary(clareContext());
        text.value = out.summary;
        data.record = (await updateCommunication(data.record.id, { summary: out.summary })).communication;
        found.replaceChildren(el('h4', undefined, 'Promises Clare found'));
        const boxes: Array<[HTMLInputElement, (typeof out.promises)[number]]> = [];
        for (const promise of out.promises) {
          const label = el('label', 'clare-found__item');
          const box = el('input') as HTMLInputElement;
          box.type = 'checkbox';
          box.checked = true;
          label.append(box, document.createTextNode(` ${promise.direction === 'you_owe' ? 'You' : 'They'}: ${promise.text}${promise.due ? ` · ${promise.due.split('-').reverse().join('/')}` : ''}`));
          found.append(label);
          boxes.push([box, promise]);
        }
        const add = el('button', 'btn btn--primary', 'Add to the ledger') as HTMLButtonElement;
        add.type = 'button';
        add.dataset.part = 'clare-add-promises';
        add.addEventListener('click', async () => {
          add.disabled = true;
          for (const [box, promise] of boxes) {
            if (!box.checked) continue;
            const { item, created } = await createLedgerItem({ ...promise, comm_ref: data.commRef });
            if (created) data.ledger.push(item);
          }
          setPhase('after');
        });
        found.append(add);
      } catch (err) {
        showClareError(found, err, () => summarise.click());
      } finally {
        summarise.disabled = false;
      }
    });

    draftsBtn.addEventListener('click', async () => {
      draftsBtn.disabled = true;
      try {
        const { drafts } = await clareDrafts(clareContext());
        draftsHost.replaceChildren();
        for (const draft of drafts) draftsHost.append(draftCard(draft));
        if (!drafts.length) draftsHost.append(el('p', 'muted', 'Nobody on this page needs a follow-up.'));
      } catch (err) {
        showClareError(draftsHost, err, () => draftsBtn.click());
      } finally {
        draftsBtn.disabled = false;
      }
    });

    nextBtn.addEventListener('click', async () => {
      nextBtn.disabled = true;
      try {
        const next = await clareProposeNext(clareContext());
        nextBtn.replaceWith(el('span', 'muted', `Proposed on your calendar: ${next.date.split('-').reverse().join('/')} at ${next.time}. Accept or dismiss it there.`));
      } catch (err) {
        nextBtn.disabled = false;
        clareRow.append(el('span', 'muted', err instanceof Error ? err.message : 'Clare could not suggest a time.'));
      }
    });

    const ledger = el('section', 'card comm-page__ledger');
    ledger.dataset.part = 'ledger';
    ledger.append(el('h3', undefined, 'Promise ledger'));
    const cols = el('div', 'ledger');
    const mine = el('div', 'ledger__col');
    const theirs = el('div', 'ledger__col');
    mine.append(el('p', 'ledger__head is-me', 'I owe'));
    theirs.append(el('p', 'ledger__head is-them', 'They owe · checked next time'));
    for (const item of data.ledger.filter((entry) => entry.comm_ref === data.commRef && entry.status === 'open')) {
      const row = el('div', 'ledger__row', item.text);
      if (item.direction === 'you_owe') {
        const toggle = el('button', 'switch') as HTMLButtonElement;
        toggle.type = 'button';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-label', 'Make task');
        toggle.setAttribute('aria-checked', String(Boolean(item.task_ref)));
        toggle.disabled = Boolean(item.task_ref);
        toggle.addEventListener('click', async () => {
          toggle.disabled = true;
          const task = await createTask({ title: item.text });
          const { item: next } = await patchLedger(item.id, { task_ref: `tasks:task:${task.id}` });
          Object.assign(item, next);
          toggle.setAttribute('aria-checked', 'true');
        });
        row.append(toggle);
        mine.append(row);
      } else {
        theirs.append(row);
      }
    }
    cols.append(mine, theirs);
    ledger.append(cols);
    const follow = buildFollowUpSection(data.record, (next) => { data.record = next; }, async () => {
      await renderCommPage(canvas, id, options);
    });
    main.append(clareRow, found, summary, ledger, draftsHost, follow);
  }

  function draftCard(draft: ClareDraft): HTMLElement {
    const card = el('section', 'draft');
    card.append(el('p', 'draft__to', `To ${draft.to} · ${draft.subject}`));
    const body = el('textarea', 'draft__body') as HTMLTextAreaElement;
    body.value = draft.body;
    body.setAttribute('aria-label', `Draft to ${draft.to}`);
    const copy = el('button', 'btn btn--primary', 'Copy') as HTMLButtonElement;
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(body.value);
        copy.textContent = 'Copied';
      } catch {
        body.select();
      }
    });
    const sent = el('button', 'btn btn--secondary', 'Mark as sent') as HTMLButtonElement;
    sent.type = 'button';
    sent.dataset.part = 'mark-sent';
    sent.addEventListener('click', async () => {
      sent.disabled = true;
      const { communication } = await createCommunication({
        direction: 'outbound', channel: 'email', occurred_at: new Date().toISOString(),
        subject: draft.subject, summary: body.value,
        links: [{ relationship_type: 'recipient', target_ref: draft.person_ref }]
      });
      if (data.thread) {
        await createUniversalLink({ source_ref: `professional:communication:${communication.id}`, target_ref: data.thread.ref, relationship_type: 'in_thread' });
      }
      const owed = data.ledger.find((item) => item.status === 'open' && item.direction === 'you_owe' && item.person_ref === draft.person_ref);
      if (owed) Object.assign(owed, (await patchLedger(owed.id, { status: 'done', checked_in_ref: `professional:communication:${communication.id}` })).item);
      sent.replaceWith(el('span', 'quiet-link', '✓ Logged as sent'));
    });
    card.append(body, copy, sent);
    return card;
  }

  function buildPeopleRail(page: PageData): HTMLElement {
    const aside = el('aside', 'comm-page__rail');
    const card = el('section', 'card');
    card.append(el('h3', undefined, 'With'));
    for (const person of page.withPeople) card.append(el('div', 'pcard', person.name));
    for (const person of page.alsoConcerned) {
      const row = el('div', 'pcard is-ghost', person.name);
      row.append(el('span', 'pcard__role', 'Also concerned, not here'));
      card.append(row);
    }
    if (!page.withPeople.length && !page.alsoConcerned.length) card.append(el('p', 'muted', 'No people linked yet.'));
    aside.append(card);
    return aside;
  }

  setPhase(phase);
  scheduleClock();
}

function whenLabel(record: CommunicationRecord): string {
  const zone = record.time_zone ?? 'Australia/Sydney';
  const start = record.scheduled_start ?? record.occurred_at;
  const fmt = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit', hour: 'numeric', minute: '2-digit' });
  const startText = fmt.format(new Date(start));
  if (!record.scheduled_end) return startText;
  const endText = new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(record.scheduled_end));
  return `${startText} – ${endText}`;
}

function autoNote(record: CommunicationRecord, phase: CommPhase): string {
  if (!record.scheduled_start) return 'Logged';
  if (phase === 'before') return 'Switches to During by itself at the start time';
  if (phase === 'during') return 'Switches to After by itself at the end, or when you tap End';
  return 'Wrap-up';
}
