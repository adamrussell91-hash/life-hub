import { getEvent, updateEvent } from '@/api/events';
import { createUniversalLink, listUniversalLinksForEntity } from '@/api/universal-links';
import { createPdGroup, getPdGroup } from '@/api/pd-groups';
import { createKnowledgeNote } from '@/api/knowledge-notes';
import { mountBlockPage } from '@/components/block-page';
import { buildLearningTaskPanel, buildPdFields } from '@/views/events';
import { groupTotals, talkHoursNote } from '@/lib/pd-totals';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { EventRecord, EventTalk, PdGroupRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const PD = 'professional_development';

type Loaded = {
  record: EventRecord;
  group: PdGroupRecord | null;
  members: EventRecord[];
  notedTalks: Map<string, string>;
};

async function load(id: string): Promise<Loaded> {
  const record = (await getEvent(id)).event;
  const eventRef = `professional:event:${id}`;
  const links = await listUniversalLinksForEntity(eventRef);
  const current = links.outgoing.filter((entry) => entry.link.status === 'current');
  const groupEntry = current.find((entry) => entry.link.relationship_type === 'in_pd_group') ?? null;
  const notedTalks = new Map<string, string>();
  for (const entry of current.filter((item) => item.link.relationship_type === 'talk_note')) {
    const talkId = (entry.link as { metadata?: { talk_id?: string } }).metadata?.talk_id;
    if (talkId) notedTalks.set(talkId, entry.endpoint!.href ?? '');
  }
  let group: PdGroupRecord | null = null;
  let members: EventRecord[] = [record];
  if (groupEntry) {
    const groupId = groupEntry.endpoint!.ref.split(':').pop()!;
    group = (await getPdGroup(groupId)).group;
    const memberRefs = (await listUniversalLinksForEntity(groupEntry.endpoint!.ref)).incoming
      .filter((entry) => entry.link.relationship_type === 'in_pd_group' && entry.link.status === 'current')
      .map((entry) => entry.link.source_ref.split(':').pop()!);
    members = await Promise.all(memberRefs.map(async (memberId) => (memberId === id ? record : (await getEvent(memberId)).event)));
  }
  return { record, group, members, notedTalks };
}

export async function renderEventPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  let data: Loaded;
  try {
    data = await load(id);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderEventPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(data.record.title);
  const eventRef = `professional:event:${id}`;
  const rerender = () => renderEventPage(canvas, id, options);

  const root = el('div', 'event-page');
  const isPd = data.record.event_type === PD;
  root.dataset.pd = String(isPd);

  const toggleRow = el('div', 'pd-toggle');
  const toggle = el('button', 'switch') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(isPd));
  toggle.setAttribute('aria-label', 'Counts as PD');
  toggle.dataset.part = 'pd-switch';
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    await updateEvent(id, { event_type: isPd ? 'general' : PD });
    await rerender();
  });
  toggleRow.append(toggle, el('b', undefined, 'Counts as PD'),
    el('span', 'muted', isPd ? 'Feeds the PD dashboard' : 'Off. No hours or evidence.'));
  root.append(toggleRow);

  if (isPd) {
    root.append(shapePicker(), talksCard(), buildPdFields(data.record, (next) => { data.record = next; }), buildLearningTaskPanel(data.record, rerender));
    if (data.group) root.append(seriesStrip(data.group));
  }

  const notes = el('section', 'event-page__notes');
  notes.append(el('h3', undefined, isPd ? 'Reflection and notes' : 'Notes'));
  const body = el('div');
  notes.append(body);
  root.append(notes);
  mountBlockPage(body, {
    blocks: (data.record.blocks ?? []) as never[],
    editable: true,
    onSave: async (blocks) => {
      data.record = (await updateEvent(id, { blocks })).event;
    }
  });
  canvas.replaceChildren(root);

  function shapePicker(): HTMLElement {
    const group = el('div', 'shape');
    group.dataset.part = 'shape';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'PD shape');
    const currentShape = data.group?.shape ?? 'one_off';
    const shapeOptions: Array<[string, string, string]> = [
      ['one_off', 'One-off', 'One Zoom, one day, one session'],
      ['series', 'Series', 'Sessions weeks apart, one program'],
      ['program', 'Program', 'Multi-day seminar, one event per day']
    ];
    for (const [value, label, help] of shapeOptions) {
      const button = el('button', `shape__opt${value === currentShape ? ' is-on' : ''}`) as HTMLButtonElement;
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(value === currentShape));
      button.append(el('b', undefined, label), el('small', undefined, help));
      button.addEventListener('click', async () => {
        if (value === currentShape || value === 'one_off') return;
        const { group: created } = await createPdGroup({ shape: value as 'series' | 'program', title: data.record.title });
        await createUniversalLink({ source_ref: eventRef, target_ref: `professional:pd_group:${created.id}`, relationship_type: 'in_pd_group' });
        await rerender();
      });
      group.append(button);
    }
    return group;
  }

  function seriesStrip(group: PdGroupRecord): HTMLElement {
    const totals = groupTotals(data.members);
    const card = el('section', 'card');
    card.dataset.part = 'series';
    const title = el('h3', undefined, `${group.shape === 'series' ? 'The series' : 'The program'} · ${totals.hoursDone}/${totals.hoursTotal} h`);
    const open = el('a', 'btn btn--ghost', 'Open') as HTMLAnchorElement;
    open.href = `#/pd-group/${encodeURIComponent(group.id)}`;
    card.append(title, open);
    const strip = el('div', 'series');
    for (const session of totals.sessions) {
      const cell = el('a', `series__session${session.id === id ? ' is-current' : ''}${session.done ? '' : ' is-future'}`) as HTMLAnchorElement;
      cell.href = `#/event/${encodeURIComponent(session.id)}`;
      cell.append(el('span', 'series__date', session.label), el('span', 'series__hours', session.hours == null ? '' : `${session.hours} h`));
      if (session.gapAfter) cell.append(el('span', 'series__gap', session.gapAfter));
      strip.append(cell);
    }
    card.append(strip);
    const add = el('a', 'btn btn--ghost', group.shape === 'program' ? '＋ Next day' : '＋ Next session') as HTMLAnchorElement;
    add.href = `#/event/new?pd_group=${encodeURIComponent(group.id)}`;
    card.append(add);
    return card;
  }

  function talksCard(): HTMLElement {
    const card = el('section', 'card');
    card.dataset.part = 'talks';
    card.append(el('h3', undefined, 'Talks and activities'));
    const list = el('div', 'prog');
    for (const talk of data.record.talks ?? []) list.append(talkRow(talk));
    card.append(list);
    const note = talkHoursNote(data.record.talks ?? [], data.record.hours);
    if (note) card.append(el('p', 'muted', note));
    const form = el('form', 'talk-add');
    const time = el('input') as HTMLInputElement;
    time.type = 'time';
    time.setAttribute('aria-label', 'Talk time');
    const title = el('input') as HTMLInputElement;
    title.placeholder = 'Talk or activity';
    title.setAttribute('aria-label', 'Talk title');
    const hours = el('input') as HTMLInputElement;
    hours.type = 'number';
    hours.step = '0.25';
    hours.min = '0';
    hours.placeholder = 'h';
    hours.setAttribute('aria-label', 'Talk hours');
    const add = el('button', 'btn btn--ghost', '＋ Add') as HTMLButtonElement;
    add.type = 'submit';
    form.append(time, title, hours, add);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!title.value.trim()) return;
      const talks: EventTalk[] = [...(data.record.talks ?? []), {
        id: `t_${Date.now()}`, time: time.value || null, title: title.value.trim(), presenter: null, hours: hours.value ? Number(hours.value) : null
      }];
      data.record = (await updateEvent(id, { talks })).event;
      await rerender();
    });
    card.append(form);
    return card;
  }

  function talkRow(talk: EventTalk): HTMLElement {
    const row = el('div', 'pi');
    row.append(el('span', 'pi__time', talk.time ?? ''), el('span', 'pi__title', talk.title),
      el('span', 'pi__who', [talk.presenter, talk.hours != null ? `${talk.hours} h` : null].filter(Boolean).join(' · ')));
    const href = data.notedTalks.get(talk.id);
    if (href !== undefined) {
      const link = el('a', 'kn', '✓ Knowledge note') as HTMLAnchorElement;
      if (href) link.href = href;
      row.append(link);
    } else {
      const make = el('button', 'kn is-draft', '＋ Make note') as HTMLButtonElement;
      make.type = 'button';
      make.dataset.talkNote = talk.id;
      make.addEventListener('click', async () => {
        make.disabled = true;
        const page = await createKnowledgeNote({
          title: talk.title,
          body: [talk.presenter, data.record.title, data.record.location_text].filter(Boolean).join(' · '),
          tags: ['pd']
        });
        await createUniversalLink({ source_ref: eventRef, target_ref: `knowledge:page:${page.id}`, relationship_type: 'talk_note', metadata: { talk_id: talk.id } });
        make.replaceWith(el('span', 'kn', '✓ Knowledge note'));
      });
      row.append(make);
    }
    return row;
  }
}
