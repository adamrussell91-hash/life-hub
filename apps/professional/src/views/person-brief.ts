import { fetchPersonBrief } from '@/api/people-brief';
import { personRoute } from '@/app/router';
import type { PersonBrief, PersonBriefNextInteraction } from '@/domain/types';

/**
 * Person Brief (Phase 3, Feature 3.1 — BUILD-PLAN.md "Phase 3 — Person
 * Brief and Relational Search"). A TOP-LEVEL view, not a mode of
 * `person-page.ts`/`entity-detail.ts`'s tab shell — the mockup
 * (`docs/professional-hub/people-experience/mockups/03-person-brief.html`)
 * is a centred "reading sheet", structurally different from every other
 * People screen's rail+canvas list/detail layout. Ported into
 * `packages/design-kit/person-brief.css`.
 *
 * Renders ONLY the synchronous, non-LLM sections `GET /api/people/brief`
 * assembles (header, Who they are, Open loops, Current shared work, Mutual
 * connections). "Since you last spoke" and "Talking points" (Feature 3.2)
 * are NOT fetched or fabricated here — each renders as its own section with
 * an honest "Not yet generated." placeholder, marked
 * `data-brief-llm-section="since-last-spoke"` /
 * `data-brief-llm-section="talking-points"` so a follow-up task can find
 * and wire a real fetch into exactly these two nodes without re-reading
 * this whole file.
 */
export interface RenderPersonBriefOptions {
  onTitleReady?: (title: string) => void;
  isCurrent?: () => boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(href: string, text: string, className?: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (className) a.className = className;
  return a;
}

const NAME_TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'professor']);

/** Best-effort two-letter avatar initials — skips a leading honorific
 * ("Dr", "Prof", ...) so "Dr Vicky Leighton" reads as "VL", not "DV". */
function initialsFor(name: string): string {
  const words = name
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !NAME_TITLES.has(word.replace(/\.$/, '').toLowerCase()));
  const source = words.length ? words : name.split(/\s+/).filter(Boolean);
  const letters = source
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return letters || '?';
}

function formatInteractionValue(interaction: PersonBriefNextInteraction): string {
  const date = new Date(interaction.start);
  const parts: string[] = [];
  if (!Number.isNaN(date.getTime())) {
    const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
    const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    if (interaction.time_zone) {
      dateOptions.timeZone = interaction.time_zone;
      timeOptions.timeZone = interaction.time_zone;
    }
    parts.push(new Intl.DateTimeFormat('en-AU', dateOptions).format(date));
    parts.push(new Intl.DateTimeFormat('en-AU', timeOptions).format(date).toLowerCase());
  }
  if (interaction.location) parts.push(interaction.location);
  return parts.join(' · ');
}

function buildHeader(brief: PersonBrief): HTMLElement {
  const header = el('div', 'person-brief__header');

  const who = el('div', 'person-brief__who');
  const avatar = el('div', 'person-brief__avatar', initialsFor(brief.header.person.display_name));
  const copy = document.createElement('div');
  copy.append(el('p', 'person-brief__name', brief.header.person.display_name));
  const roleBits = [brief.header.role, brief.header.organisation?.display_name].filter(
    (bit): bit is string => Boolean(bit)
  );
  if (roleBits.length) {
    copy.append(el('p', 'person-brief__role', roleBits.join(' · ')));
  }
  who.append(avatar, copy);

  const meta = el('div', 'person-brief__meta');
  const interaction = brief.header.next_interaction;
  if (interaction) {
    meta.append(el('span', 'eyebrow', interaction.title));
    meta.append(el('span', 'value', formatInteractionValue(interaction)));
  } else {
    // SOURCE-BRIEF.md section 50, "Empty Brief" — verbatim.
    const empty = el('p', 'empty-state');
    empty.append(el('span', undefined, 'No upcoming interaction found.'));
    empty.append(document.createElement('br'));
    empty.append(el('span', undefined, 'Open a person and create a meeting or event first.'));
    meta.append(empty);
  }

  header.append(who, meta);
  return header;
}

function buildWhoTheyAre(brief: PersonBrief): HTMLElement {
  const section = el('div', 'person-brief__section');
  section.append(el('h2', undefined, 'Who they are'));
  section.append(el('p', undefined, brief.who_they_are));
  return section;
}

/**
 * "Since you last spoke" — Feature 3.2's LLM section. This module never
 * fetches or fabricates its content; the placeholder node carries
 * `data-brief-llm-section="since-last-spoke"` so a follow-up task can find
 * it and wire a real fetch in without touching the rest of this file.
 */
function buildSinceLastSpoke(): HTMLElement {
  const section = el('div', 'person-brief__section person-brief__since');
  section.append(el('h2', undefined, 'Since you last spoke'));
  const placeholder = el('p', 'empty-state', 'Not yet generated.');
  placeholder.dataset.briefLlmSection = 'since-last-spoke';
  section.append(placeholder);
  return section;
}

/**
 * "Talking points" — Feature 3.2's other LLM section. Same placeholder
 * contract as `buildSinceLastSpoke` above, marked
 * `data-brief-llm-section="talking-points"`.
 */
function buildTalkingPoints(): HTMLElement {
  const section = el('div', 'person-brief__section');
  section.append(el('h2', undefined, 'Talking points'));
  const placeholder = el('p', 'empty-state', 'Not yet generated.');
  placeholder.dataset.briefLlmSection = 'talking-points';
  section.append(placeholder);
  return section;
}

function buildOpenLoops(brief: PersonBrief): HTMLElement {
  const section = el('div', 'person-brief__section');
  section.append(el('h2', undefined, 'Open loops'));
  if (!brief.open_loops.length) {
    section.append(el('p', 'empty-state', 'No open loops recorded.'));
    return section;
  }
  for (const loop of brief.open_loops) {
    const row = el('div', 'person-brief__open-loop');
    row.append(el('span', 'dot'));
    if (loop.href) {
      row.append(link(loop.href, loop.label));
    } else {
      row.append(document.createTextNode(loop.label));
    }
    section.append(row);
  }
  return section;
}

function buildCurrentSharedWork(brief: PersonBrief): HTMLElement {
  const section = el('div', 'person-brief__section');
  section.append(el('h2', undefined, 'Current shared work'));
  if (!brief.current_shared_work.length) {
    section.append(el('p', 'empty-state', 'No current shared work recorded.'));
    return section;
  }
  const list = el('ul', 'person-brief__list');
  for (const item of brief.current_shared_work) {
    const li = document.createElement('li');
    const label = item.status ? `${item.label} (${item.status})` : item.label;
    if (item.href) {
      li.append(link(item.href, label));
    } else {
      li.textContent = label;
    }
    list.append(li);
  }
  section.append(list);
  return section;
}

function buildMutualConnections(brief: PersonBrief): HTMLElement {
  const section = el('div', 'person-brief__section');
  section.append(el('h2', undefined, 'Mutual connections'));
  if (!brief.mutual_connections.length) {
    section.append(el('p', 'empty-state', 'No mutual connections found.'));
    return section;
  }
  const list = el('ul', 'person-brief__list');
  for (const person of brief.mutual_connections) {
    const li = document.createElement('li');
    if (person.href) {
      li.append(link(person.href, person.display_label));
    } else {
      li.textContent = person.display_label;
    }
    list.append(li);
  }
  section.append(list);
  return section;
}

/**
 * Actions row. "Open full profile" is a real link to the Person Profile
 * route. "Snooze" has no persisted per-brief state anywhere in this app
 * (no "which brief, snoozed until when" storage exists) — mirrors the exact
 * honest-disclosure pattern `apps/professional/src/views/people-home.ts`'s
 * "Add person" button already established, rather than fabricating a
 * working snooze.
 */
function buildActions(personId: string): HTMLElement {
  const row = el('div', 'person-brief__actions');
  const statusId = 'person-brief-snooze-status';
  const status = el('p', 'person-brief__snooze-status');
  status.id = statusId;
  status.hidden = true;

  const snooze = document.createElement('button');
  snooze.type = 'button';
  snooze.className = 'btn btn--secondary';
  snooze.textContent = 'Snooze';
  snooze.setAttribute('aria-describedby', statusId);
  snooze.addEventListener('click', () => {
    status.hidden = false;
    status.textContent =
      'Snoozing a Brief is not built yet — there is no persisted per-brief snooze state in this phase.';
  });

  const openProfile = link(personRoute(personId), 'Open full profile', 'btn btn--primary');

  row.append(snooze, openProfile, status);
  return row;
}

function buildSheet(brief: PersonBrief, personId: string): HTMLElement {
  const sheet = el('div', 'person-brief__sheet');
  sheet.append(
    link(personRoute(personId), 'Close brief ×', 'person-brief__close'),
    buildHeader(brief),
    buildWhoTheyAre(brief),
    buildSinceLastSpoke(),
    (() => {
      const row = el('div', 'person-brief__two-col');
      row.append(buildOpenLoops(brief), buildCurrentSharedWork(brief));
      return row;
    })(),
    (() => {
      const row = el('div', 'person-brief__two-col');
      row.append(buildTalkingPoints(), buildMutualConnections(brief));
      return row;
    })(),
    buildActions(personId)
  );
  return sheet;
}

export async function renderPersonBrief(
  canvas: HTMLElement,
  personId: string,
  options: RenderPersonBriefOptions = {}
): Promise<void> {
  canvas.replaceChildren();
  const wrap = el('div', 'person-brief');
  wrap.append(el('p', 'empty-state', 'Loading brief…'));
  canvas.append(wrap);

  let brief: PersonBrief;
  try {
    brief = await fetchPersonBrief(personId);
  } catch (err) {
    if (options.isCurrent && !options.isCurrent()) return;
    const message = err instanceof Error ? err.message : 'Could not load this brief.';
    wrap.replaceChildren(el('p', 'empty-state', message));
    return;
  }

  if (options.isCurrent && !options.isCurrent()) return;
  options.onTitleReady?.(brief.header.person.display_name);

  wrap.replaceChildren(buildSheet(brief, personId));
}
