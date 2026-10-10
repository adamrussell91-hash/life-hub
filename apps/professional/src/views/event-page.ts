import { createMorphingClosedFieldPopover } from '../../design-kit/js/morphing-popover.js';
import { eventOptions } from '@/components/event-options';
import { getEvent, updateEvent, deleteEvent } from '@/api/events';
import { createUniversalLink, listUniversalLinksForEntity, endUniversalLink } from '@/api/universal-links';
import { createPdGroup, getPdGroup } from '@/api/pd-groups';
import { createKnowledgeNote } from '@/api/knowledge-notes';
import { mountBlockPage } from '@/components/block-page';
import { buildEventTaskPanel, buildEventConnections, buildPdFields, renderEventNewView } from '@/views/events';
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
  groupLinkId: string | null;
  members: EventRecord[];
  notedTalks: Map<string, string>;
};

async function loadRelated(record: EventRecord): Promise<Loaded> {
  const id = record.id;
  const eventRef = `professional:event:${id}`;
  const links = await listUniversalLinksForEntity(eventRef);
  const current = links.outgoing.filter((entry) => entry.link.status === 'current');
  const groupEntry = current.find((entry) => entry.link.relationship_type === 'in_pd_group') ?? null;
  const notedTalks = new Map<string, string>();
  for (const entry of current.filter((item) => item.link.relationship_type === 'talk_note')) {
    const talkId = (entry.link as { metadata?: { talk_id?: string } }).metadata?.talk_id;
    if (talkId) notedTalks.set(talkId, entry.endpoint!.href ?? '');
  }
  for (const note of record.knowledge_notes ?? []) {
    if (note.talk_id && !notedTalks.has(note.talk_id)) notedTalks.set(note.talk_id, note.href);
  }
  let group: PdGroupRecord | null = null;
  let members: EventRecord[] = [record];
  if (groupEntry) {
    const groupId = groupEntry.endpoint!.ref.split(':').pop()!;
    const [groupResult, groupLinks] = await Promise.all([getPdGroup(groupId), listUniversalLinksForEntity(groupEntry.endpoint!.ref)]);
    group = groupResult.group;
    const memberRefs = groupLinks.incoming
      .filter((entry) => entry.link.relationship_type === 'in_pd_group' && entry.link.status === 'current')
      .map((entry) => entry.link.source_ref.split(':').pop()!);
    members = await Promise.all(memberRefs.map(async (memberId) => (memberId === id ? record : (await getEvent(memberId)).event)));
  }
  return { record, group, groupLinkId: groupEntry?.link.id ?? null, members, notedTalks };
}

export async function renderEventPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void; onActionsReady?: (actions: HTMLElement) => void }
): Promise<void> {
  if (!options.isCurrent()) return;
  showViewLoading(canvas, 'Loading…');
  let data: Loaded;
  try {
    const record = (await getEvent(id)).event;
    data = {record, group:null, groupLinkId:null, members:[record], notedTalks:new Map((record.knowledge_notes ?? []).map(note => [note.talk_id, note.href]))};
  } catch (err) {
    if (!options.isCurrent()) return;
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

  const settings = el('div', 'event-page__settings');
  const toggleRow = el('div', 'event-page__pd');
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
  toggleRow.append(toggle, el('span', undefined, 'Counts as PD'));
  settings.append(toggleRow);
  root.append(settings);
  const editEvent = () => {
    if (!options.isCurrent()) return;
    options.onActionsReady?.(el('div'));
    void renderEventNewView(canvas, {
    isCurrent: options.isCurrent,
    draft: {
      title: data.record.title, start: data.record.start, end: data.record.end,
      timeZone: data.record.time_zone, allDay: data.record.all_day,
      location: data.record.location_text, hours: data.record.hours,
      accreditation: data.record.accreditation_category, priorityArea: data.record.priority_area,
      certificate: data.record.certificate
    },
    onCancel: () => void rerender(),
    onSave: async (payload) => {
      await updateEvent(id, {
        title: payload.title, location_text: payload.location, all_day: payload.allDay,
        hours: payload.hours, accreditation_category: payload.accreditation,
        priority_area: payload.priorityArea, certificate: payload.certificate,
        start: payload.startIso, end: payload.endIso, time_zone: payload.timeZone
      });
      for (const link of payload.pendingLinks) await createUniversalLink({ source_ref: eventRef, ...link });
      await rerender();
    }
    });
  };
  const confirmation = el('section', 'confirm-card');
  confirmation.hidden = true;
  confirmation.style.display = 'none';
  confirmation.setAttribute('aria-label', 'Delete event');
  confirmation.append(el('h3', undefined, 'Delete this event?'),
    el('p', undefined, 'This removes the event from Professional Hub and the calendar. Linked Knowledge notes stay in Knowledge.'));
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Keep event');
  discard.type = 'button';
  discard.addEventListener('click', () => { confirmation.hidden = true; confirmation.style.display = 'none'; pageActions.querySelector('button')?.focus(); });
  const confirm = el('button', 'btn btn--primary', 'Delete event');
  confirm.type = 'button';
  confirm.dataset.part = 'confirm-delete';
  const status = el('p', 'event-form__status');
  status.setAttribute('role', 'status');
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    status.textContent = '';
    try {
      await deleteEvent(id);
      window.location.hash = '#/events';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Could not delete the event. Try again.';
      confirm.disabled = false;
    }
  });
  const pageActions = eventOptions(editEvent, () => { confirmation.hidden = false; confirmation.style.removeProperty('display'); discard.focus(); });
  options.onActionsReady?.(pageActions);
  if (!options.onActionsReady) { const toolbar = el('div', 'event-page__toolbar'); toolbar.append(pageActions); root.prepend(toolbar); }
  actions.append(discard, confirm);
  confirmation.append(actions, status);
  root.append(confirmation);

  let relationsReady = false;
  let formatPicker: ReturnType<typeof createMorphingClosedFieldPopover> | null = null;
  const shapeHost = el('div');
  const seriesHost = el('div');
  const relatedStatus = el('div', 'canvas-status', 'Loading linked records…');
  relatedStatus.setAttribute('role', 'status');
  if (isPd) {
    shapeHost.append(shapePicker());
    settings.append(shapeHost);
    root.append(talksCard());
    const evidence = el('section', 'card');
    evidence.append(buildPdFields(data.record, (next) => { data.record = next; }));
    root.append(evidence);
    root.append(seriesHost);
  }

  const links = el('div', 'event-page__links');
  links.append(buildEventTaskPanel(data.record, rerender), buildEventConnections(data.record, rerender));
  root.append(links);
  const notes = el('section', 'card event-page__notes');
  notes.append(el('h3', undefined, isPd ? 'Reflection and notes' : 'Notes'));
  const body = el('div');
  notes.append(body);
  root.append(relatedStatus, notes);
  mountBlockPage(body, {
    blocks: (data.record.blocks ?? []) as never[],
    editable: true,
    onSave: async (blocks) => {
      data.record = (await updateEvent(id, { blocks })).event;
    }
  });
  canvas.replaceChildren(root);
  const removal = new MutationObserver(() => {
    if (canvas.contains(root)) return;
    formatPicker?.destroy();
    removal.disconnect();
  });
  removal.observe(canvas, {childList:true});
  await enrich();

  async function enrich(): Promise<void> {
    try {
      const related = await loadRelated(data.record);
      if (!options.isCurrent() || !canvas.contains(root)) return;
      data.group = related.group; data.groupLinkId = related.groupLinkId;
      data.members = related.members; data.notedTalks = related.notedTalks;
      relationsReady = true; relatedStatus.replaceChildren();
      if (isPd) {
        shapeHost.replaceChildren(shapePicker());
        if (data.group) seriesHost.replaceChildren(seriesStrip(data.group));
        for (const row of root.querySelectorAll<HTMLElement>('[data-talk-id]')) {
          const href = data.notedTalks.get(row.dataset.talkId!);
          const existing = row.querySelector<HTMLElement>('.kn');
          if (href !== undefined) {
            const link = el('a', 'kn', '✓ Knowledge note');
            if (href) link.href = href;
            existing?.replaceWith(link);
          } else if (existing instanceof HTMLButtonElement) existing.disabled = false;
        }
      }
    } catch {
      if (!options.isCurrent() || !canvas.contains(root)) return;
      const retry = el('button', 'btn btn--secondary', 'Retry links');
      retry.type = 'button';
      retry.addEventListener('click', () => {relatedStatus.textContent = 'Loading linked records…'; void enrich();});
      relatedStatus.replaceChildren(el('p', undefined, 'Linked records could not load.'), retry);
    }
  }

  function shapePicker(): HTMLElement {
    const field = el('div', 'event-page__format');
    field.dataset.part = 'shape';
    const currentShape = data.group?.shape ?? 'one_off';
    const error = el('p', 'hub-field__error');
    error.setAttribute('role', 'status');
    formatPicker?.destroy();
    const picker = createMorphingClosedFieldPopover({
      root: document, title: 'Event format', supporting: '', value: currentShape, className: 'event-format-editor',
      options: [{value:'one_off',label:'One-off'}, {value:'series',label:'Series'}, {value:'program',label:'Program'}],
      onSave: (value) => { void saveFormat(value); }
    });
    picker.content.classList.add('event-format-editor');
    formatPicker = picker;
    const trigger = picker.trigger;
    trigger.setAttribute('aria-label', 'Event format');
    trigger.disabled = !relationsReady;
    async function saveFormat(value: string): Promise<void> {
      if (value === currentShape || !options.isCurrent()) return;
      trigger.disabled = true;
      try {
        if (value !== 'one_off') {
          const {group} = await createPdGroup({shape:value as 'series' | 'program', title:data.record.title});
          await createUniversalLink({source_ref:eventRef, target_ref:`professional:pd_group:${group.id}`, relationship_type:'in_pd_group'});
        }
        if (data.groupLinkId) await endUniversalLink(data.groupLinkId);
        await rerender();
      } catch (err) {
        if (!options.isCurrent()) return;
        error.textContent = err instanceof Error ? err.message : 'Could not change the event format.';
        picker.setValue(currentShape); trigger.disabled = false;
      }
    }
    field.append(el('span', 'event-detail__kicker', 'Event format'), picker.el, error);
    return field;
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
    const time = el('input', 'hub-input') as HTMLInputElement;
    time.type = 'time';
    time.setAttribute('aria-label', 'Talk time');
    const title = el('input', 'hub-input') as HTMLInputElement;
    title.placeholder = 'Talk or activity';
    title.setAttribute('aria-label', 'Talk title');
    const hours = el('input', 'hub-input') as HTMLInputElement;
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
    row.dataset.talkId = talk.id;
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
      make.disabled = !relationsReady;
      make.dataset.talkNote = talk.id;
      make.addEventListener('click', async () => {
        make.disabled = true;
        await updateEvent(id, { event_type: data.record.event_type });
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
