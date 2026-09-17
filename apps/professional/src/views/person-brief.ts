import { ApiClientError } from '@/api/client';
import { fetchPersonBrief, generatePersonBrief } from '@/api/people-brief';
import { personRoute } from '@/app/router';
import { errorMessage } from '@/views/feedback';
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
 * Renders the synchronous, non-LLM sections `GET /api/people/brief`
 * assembles (header, Who they are, Open loops, Current shared work, Mutual
 * connections) immediately. "Since you last spoke" and "Talking points"
 * (Feature 3.2, LLM-generated) are fetched separately, AFTER the rest of the
 * Brief has already rendered — `POST /api/people/brief?...&action=generate`
 * can be slow (a real model call), so it must never block the synchronous
 * sections. Each LLM section shows a "Generating…" state and updates in
 * place when the generate call resolves, still marked
 * `data-brief-llm-section="since-last-spoke"` /
 * `data-brief-llm-section="talking-points"` (now on the wrapping host div
 * rather than the placeholder `<p>` itself, so the marker survives the
 * loading → populated / error transition). Threads the same
 * `options.isCurrent()` stale-navigation guard through this second fetch,
 * independent of the first — mirrors `observations-tab.ts`'s
 * `renderObservationsTab`, the established pattern in this app for an
 * async section that fetches on its own rather than reusing already-loaded
 * data.
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
 * "Since you last spoke" — Feature 3.2's LLM section. The host div (not the
 * placeholder `<p>` itself) carries `data-brief-llm-section="since-last-
 * spoke"`, so `loadGeneratedSections` below can find it and swap its
 * contents through loading → populated / error without needing to touch
 * anything else in this file.
 */
function buildSinceLastSpoke(): HTMLElement {
  const section = el('div', 'person-brief__section person-brief__since');
  section.append(el('h2', undefined, 'Since you last spoke'));
  const host = el('div');
  host.dataset.briefLlmSection = 'since-last-spoke';
  host.append(el('p', 'empty-state', 'Not yet generated.'));
  section.append(host);
  return section;
}

/**
 * "Talking points" — Feature 3.2's other LLM section. Same host-div
 * contract as `buildSinceLastSpoke` above, marked
 * `data-brief-llm-section="talking-points"`.
 */
function buildTalkingPoints(): HTMLElement {
  const section = el('div', 'person-brief__section');
  section.append(el('h2', undefined, 'Talking points'));
  const host = el('div');
  host.dataset.briefLlmSection = 'talking-points';
  host.append(el('p', 'empty-state', 'Not yet generated.'));
  section.append(host);
  return section;
}

/** `since_last_spoke[0]` is always the server's deterministic opening line
 * ("You last met 3 months ago, at ... . Since then:") — rendered as a lead
 * sentence, with the LLM's own bullets (if any) listed beneath it. */
function renderSinceLastSpoke(host: HTMLElement, items: string[]): void {
  host.replaceChildren();
  if (!items.length) {
    host.append(el('p', 'empty-state', 'Nothing to report.'));
    return;
  }
  const [opening, ...bullets] = items;
  host.append(el('p', undefined, opening));
  if (bullets.length) {
    const list = document.createElement('ul');
    list.className = 'person-brief__list';
    for (const bullet of bullets) {
      const li = document.createElement('li');
      li.textContent = bullet;
      list.append(li);
    }
    host.append(list);
  }
}

function renderTalkingPoints(host: HTMLElement, items: string[]): void {
  host.replaceChildren();
  if (!items.length) {
    host.append(el('p', 'empty-state', 'No talking points generated.'));
    return;
  }
  const wrap = el('div', 'person-brief__talking-points');
  items.forEach((item, index) => {
    const row = el('div', 'person-brief__tp-item');
    row.append(el('span', 'person-brief__tp-num', String(index + 1)));
    row.append(document.createTextNode(item));
    wrap.append(row);
  });
  host.append(wrap);
}

/**
 * Fetches Feature 3.2's LLM sections and populates them in place. Called
 * AFTER the rest of the Brief has already rendered (never awaited by
 * `renderPersonBrief` before it returns) so a slow model call never blocks
 * the synchronous sections. `options.isCurrent()` is checked both before
 * touching the DOM on success and on failure — the exact guard shape
 * `observations-tab.ts`'s `renderObservationsTab` already established for
 * an independent, self-fetching section.
 */
async function loadGeneratedSections(sheet: HTMLElement, personId: string, options: RenderPersonBriefOptions): Promise<void> {
  const sinceHost = sheet.querySelector<HTMLElement>('[data-brief-llm-section="since-last-spoke"]');
  const talkingHost = sheet.querySelector<HTMLElement>('[data-brief-llm-section="talking-points"]');
  if (!sinceHost || !talkingHost) return;

  sinceHost.replaceChildren(el('p', 'empty-state', 'Generating…'));
  talkingHost.replaceChildren(el('p', 'empty-state', 'Generating…'));

  try {
    const generation = await generatePersonBrief(personId);
    if (options.isCurrent && !options.isCurrent()) return;
    renderSinceLastSpoke(sinceHost, generation.since_last_spoke);
    renderTalkingPoints(talkingHost, generation.talking_points);
  } catch (err) {
    if (options.isCurrent && !options.isCurrent()) return;
    // A 503 `people_anthropic_unbound` is an expected, common state in
    // dev/test environments with no API key bound — an honest, calm
    // message, not a scary error or a pointless retry button.
    if (err instanceof ApiClientError && err.code === 'people_anthropic_unbound') {
      const message = 'Brief generation is not configured.';
      sinceHost.replaceChildren(el('p', 'empty-state', message));
      talkingHost.replaceChildren(el('p', 'empty-state', message));
      return;
    }
    const message = errorMessage(err);
    const retry = (): void => void loadGeneratedSections(sheet, personId, options);
    sinceHost.replaceChildren(el('p', 'empty-state', message), retryButton(retry));
    talkingHost.replaceChildren(el('p', 'empty-state', message), retryButton(retry));
  }
}

function retryButton(onRetry: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary';
  button.textContent = 'Retry';
  button.addEventListener('click', onRetry);
  return button;
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

  const sheet = buildSheet(brief, personId);
  wrap.replaceChildren(sheet);

  // Feature 3.2's LLM sections load separately and are NOT awaited here —
  // a real model call can be slow, and the synchronous Brief above must
  // render immediately regardless of how long generation takes.
  void loadGeneratedSections(sheet, personId, options);
}
