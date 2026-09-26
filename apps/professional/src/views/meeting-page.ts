import { getMeeting, updateMeeting } from '@/api/meetings';
import { createTask, listUniversalLinksForEntity } from '@/api/universal-links';
import { fetchPeopleDirectory } from '@/api/people-directory';
import { createLedgerItem, listLedgerForSources, patchLedger } from '@/api/ledger';
import { mountBlockPage, type BlockPageHandle } from '@/components/block-page';
import { buildMeetingTaskLinks } from '@/views/meetings';
import { nextSwitchDelayMs, phaseFor, type CommPhase } from '@/lib/comm-phase';
import { blockPlainText, extractInlinePromises, resolvePromiseOwner } from '@/lib/inline-promises';
import { agendaToBlocks, extractDecisions, extractMentions } from '@/lib/meeting-notes';
import { groupRoom, type RoomCluster } from '@/lib/room';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { LedgerItem, MeetingRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function renderMeetingPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  const meetingRef = `professional:meeting:${id}`;
  let record: MeetingRecord;
  let room: RoomCluster[];
  let people: Array<{ ref: string; name: string }>;
  let ledger: LedgerItem[];
  try {
    record = (await getMeeting(id)).meeting;
    const [links, directory, ledgerResult] = await Promise.all([
      listUniversalLinksForEntity(meetingRef),
      fetchPeopleDirectory().catch(() => ({ people: [], organisations: [], counts: { people: 0, organisations: 0 } })),
      listLedgerForSources([meetingRef])
    ]);
    const attendees = links.outgoing
      .filter((entry) => entry.link.relationship_type === 'attendee' && entry.link.status === 'current')
      .map((entry) => ({ ref: entry.endpoint!.ref, role: (entry.link as { role?: string | null }).role ?? null, name: entry.endpoint!.display_label }));
    room = groupRoom(attendees, directory.people, new Date());
    people = attendees.map((attendee) => ({ ref: attendee.ref, name: attendee.name }));
    ledger = ledgerResult.items;
  } catch (err) {
    renderLoadError(canvas, err, () => void renderMeetingPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(record.title);

  const slot = { scheduled_start: record.scheduled_start, scheduled_end: record.scheduled_end };
  let manual = false;
  let blockPage: BlockPageHandle | null = null;

  const root = el('div', 'meeting-page');
  const head = el('header', 'meeting-page__head');
  head.append(el('span', 'chip chip--meet', `● Meeting${record.location_text ? ` · ${record.location_text}` : ''}`));
  const switcher = el('div', 'comm-page__phase');
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
  head.append(switcher);

  const purpose = el('section', 'meeting-page__purpose');
  purpose.dataset.part = 'purpose';
  purpose.append(el('b', undefined, 'Why you’re there'));
  const purposeText = el('textarea', 'meeting-page__purpose-text') as HTMLTextAreaElement;
  purposeText.value = record.purpose ?? '';
  purposeText.placeholder = 'What you want out of this meeting';
  purposeText.setAttribute('aria-label', 'Why you’re there');
  purposeText.addEventListener('change', async () => {
    record = (await updateMeeting(id, { purpose: purposeText.value })).meeting;
  });
  purpose.append(purposeText);

  const main = el('div', 'meeting-page__main');
  const side = el('aside', 'meeting-page__side');
  side.append(roomCard(room));
  const actions = el('section', 'card');
  actions.dataset.part = 'actions';
  const mentions = el('section', 'card');
  mentions.dataset.part = 'mentions';
  side.append(actions, mentions, buildMeetingTaskLinks(record, () => renderMeetingPage(canvas, id, options)));
  const grid = el('div', 'meeting-page__grid');
  grid.append(main, side);
  root.append(head, purpose, grid);
  canvas.replaceChildren(root);
  paintActions();
  paintMentions(record.blocks ?? []);

  function setPhase(next: CommPhase): void {
    root.dataset.phase = next;
    for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-set-phase]')) {
      button.setAttribute('aria-pressed', String(button.dataset.setPhase === next));
    }
    void blockPage?.flush();
    blockPage?.dispose();
    main.replaceChildren();
    const body = el('div', 'meeting-page__notes');
    main.append(body);
    let n = 0;
    const seeded = (record.blocks ?? []).length ? (record.blocks as never[]) : (agendaToBlocks(record.agenda ?? '', () => `block_${++n}`) as never[]);
    blockPage = mountBlockPage(body, {
      blocks: seeded,
      editable: true,
      onSave: async (blocks) => {
        const found = extractDecisions(blocks as Array<{ block_type: string; content?: unknown }>);
        const decisions = found.map((decision, index) => ({ id: `d_${index + 1}`, ...decision }));
        record = (await updateMeeting(id, { blocks, decisions })).meeting;
        await syncPromises(blocks);
        paintActions();
        paintMentions(blocks);
      }
    });
  }

  async function syncPromises(blocks: unknown[]): Promise<void> {
    for (const promise of extractInlinePromises(blockPlainText(blocks))) {
      const owner = resolvePromiseOwner(promise.owner, people);
      if (!owner) continue;
      const { item, created } = await createLedgerItem({ ...owner, text: promise.text, comm_ref: meetingRef });
      if (created) ledger.push(item);
    }
  }

  function paintActions(): void {
    actions.replaceChildren(el('h3', undefined, 'Actions'));
    for (const item of ledger.filter((entry) => entry.status === 'open')) {
      const row = el('div', `meeting-page__action is-${item.direction === 'you_owe' ? 'mine' : 'theirs'}`, item.text);
      if (item.direction === 'you_owe' && !item.task_ref) {
        const make = el('button', 'btn btn--ghost', 'Make task') as HTMLButtonElement;
        make.type = 'button';
        make.addEventListener('click', async () => {
          make.disabled = true;
          const task = await createTask({ title: item.text });
          Object.assign(item, (await patchLedger(item.id, { task_ref: `tasks:task:${task.id}` })).item);
          make.replaceWith(el('span', 'quiet-link', '✓ task linked'));
        });
        row.append(make);
      }
      actions.append(row);
    }
    for (const decision of record.decisions ?? []) {
      actions.append(el('div', 'meeting-page__decision', `✓ ${decision.text}${decision.agenda_heading ? ` · ${decision.agenda_heading}` : ''}`));
    }
  }

  function paintMentions(blocks: unknown[]): void {
    mentions.replaceChildren(el('h3', undefined, 'Who said what'));
    for (const mention of extractMentions(blockPlainText(blocks))) {
      const block = el('div', 'meeting-page__mention');
      block.append(el('b', undefined, mention.name));
      for (const line of mention.lines) block.append(el('p', undefined, line));
      const known = people.some((person) => person.name.toLowerCase().startsWith(mention.name.toLowerCase()));
      if (!known) {
        const add = el('a', 'btn btn--ghost', 'Add to People') as HTMLAnchorElement;
        add.href = '#/people';
        block.append(add);
      }
      mentions.append(block);
    }
  }

  function scheduleClock(): void {
    const delay = nextSwitchDelayMs(slot, new Date());
    if (delay === null) return;
    setTimeout(() => {
      if (!root.isConnected) return;
      if (!manual) setPhase(phaseFor(slot, new Date()));
      scheduleClock();
    }, delay);
  }

  setPhase(phaseFor(slot, new Date()));
  scheduleClock();
}

function roomCard(room: RoomCluster[]): HTMLElement {
  const card = el('section', 'card');
  card.dataset.part = 'room';
  card.append(el('h3', undefined, `The room · ${room.reduce((total, cluster) => total + cluster.people.length, 0)}`));
  for (const cluster of room) {
    const group = el('div', 'room__org');
    group.append(el('p', 'room__org-name', cluster.organisation ?? 'No organisation yet'));
    for (const person of cluster.people) {
      const row = el('div', 'room__person');
      row.dataset.warmth = String(person.warmthDots);
      row.append(el('span', 'room__initials', person.initials), el('span', undefined, person.name));
      if (person.role) row.append(el('span', 'muted', person.role));
      if (person.isNew) row.append(el('span', 'chip chip--warn', 'New to you'));
      const dots = el('span', 'room__warmth');
      dots.setAttribute('aria-label', `Warmth ${person.warmthDots} of 3`);
      for (let i = 1; i <= 3; i += 1) dots.append(el('i', i <= person.warmthDots ? 'is-on' : ''));
      row.append(dots);
      group.append(row);
    }
    card.append(group);
  }
  return card;
}
