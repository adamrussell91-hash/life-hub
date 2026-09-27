/** Selection panel — opaque paper (S3). */

import { PLACE_MEANINGS, type Community, type Ecotone, type PersonState, type WorldModel } from './model';
import type { MiniworldSelection } from './world-canvas';
import { organisationRoute, personRoute } from '@/app/router';
import { parseSharedRef } from '@/domain/ids';

export function mountPanel(
  host: HTMLElement,
  options: {
    onClose?: () => void;
    onShowTheirWorld?: (personRef: string) => void;
  } = {}
): { render: (sel: MiniworldSelection, model: WorldModel) => void; el: HTMLElement } {
  const el = document.createElement('aside');
  el.className = 'miniworld__panel';
  el.hidden = true;
  el.setAttribute('aria-live', 'polite');
  host.append(el);

  function render(sel: MiniworldSelection, model: WorldModel): void {
    if (!sel) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    el.hidden = false;
    el.replaceChildren();
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'miniworld__panel-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => options.onClose?.());
    el.append(close);

    if (sel.kind === 'community') {
      const c = model.communities.find((x) => x.id === sel.id);
      if (!c) {
        el.hidden = true;
        return;
      }
      appendCommunity(el, c);
    } else if (sel.kind === 'person') {
      const p = model.people.find((x) => x.ref === sel.id);
      if (!p) {
        el.hidden = true;
        return;
      }
      appendPerson(el, p, model, options.onShowTheirWorld);
    } else if (sel.kind === 'ecotone') {
      const eco = model.ecotones.find((x) => x.key === sel.id);
      if (!eco) {
        el.hidden = true;
        return;
      }
      appendEcotone(el, eco, model);
    } else {
      const kicker = document.createElement('p');
      kicker.className = 'miniworld__panel-kicker';
      kicker.textContent = 'Open sea';
      const h2 = document.createElement('h2');
      h2.textContent = `${model.openSea.people.length} people`;
      const body = document.createElement('p');
      body.className = 'body';
      body.textContent = PLACE_MEANINGS['open-sea'];
      el.append(kicker, h2, body);
    }
  }

  return { render, el };
}

function appendCommunity(el: HTMLElement, c: Community): void {
  const kicker = document.createElement('p');
  kicker.className = 'miniworld__panel-kicker';
  kicker.textContent = c.habitat === 'reef' ? 'Coral Reef' : c.habitat[0]!.toUpperCase() + c.habitat.slice(1);
  const h2 = document.createElement('h2');
  h2.textContent = c.label;
  const meaning = document.createElement('p');
  meaning.className = 'role';
  meaning.textContent = c.meaning;
  const whyTitle = document.createElement('h3');
  whyTitle.textContent = 'Why they live here';
  const why = document.createElement('p');
  why.className = 'body';
  why.textContent = c.why;
  const stats = document.createElement('div');
  stats.className = 'miniworld__stats';
  for (const [n, label] of [
    [String(c.stats.memberCount), 'people'],
    [c.stats.density.toFixed(2), 'density'],
    [String(c.stats.bridgeCount), 'bridges'],
    [String(c.stats.quietCount), 'quiet']
  ] as const) {
    const s = document.createElement('div');
    s.className = 'miniworld__stat';
    const b = document.createElement('b');
    b.textContent = n;
    const sp = document.createElement('span');
    sp.textContent = label;
    s.append(b, sp);
    stats.append(s);
  }
  el.append(kicker, h2, meaning, whyTitle, why, stats);

  const parsed = parseSharedRef(c.id);
  if (parsed?.kind === 'organisation') {
    const link = document.createElement('a');
    link.className = 'miniworld__panel-link';
    link.href = organisationRoute(parsed.id);
    link.textContent = 'Open organisation';
    el.append(link);
  }
}

function appendPerson(
  el: HTMLElement,
  p: PersonState,
  model: WorldModel,
  onShowTheirWorld?: (ref: string) => void
): void {
  const kicker = document.createElement('p');
  kicker.className = 'miniworld__panel-kicker';
  kicker.textContent = p.isSelf ? 'You' : p.homeIds.length > 1 ? 'Bridge' : 'Person';
  const h2 = document.createElement('h2');
  h2.textContent = p.displayName;
  el.append(kicker, h2);
  const pills = document.createElement('div');
  pills.className = 'miniworld__pills';
  if (p.quiet) pills.append(pill('Quiet', 'dormant'));
  if (p.homeIds.length > 1) pills.append(pill('Bridge', 'bridge'));
  if (p.isNew) pills.append(pill('New this year', 'new'));
  if (pills.childNodes.length) el.append(pills);
  if (p.homeIds.length) {
    const h3 = document.createElement('h3');
    h3.textContent = 'Homes';
    const ul = document.createElement('ul');
    for (const id of p.homeIds) {
      const c = model.communities.find((x) => x.id === id);
      const li = document.createElement('li');
      li.textContent = c?.label ?? id;
      ul.append(li);
    }
    el.append(h3, ul);
  }
  const parsed = parseSharedRef(p.ref);
  if (parsed?.kind === 'person') {
    const link = document.createElement('a');
    link.className = 'miniworld__panel-link';
    link.href = personRoute(parsed.id);
    link.textContent = 'Open profile';
    el.append(link);
  }
  if (!p.isSelf && onShowTheirWorld) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--secondary';
    btn.textContent = 'Show their world';
    btn.addEventListener('click', () => onShowTheirWorld(p.ref));
    el.append(btn);
  }
}

function appendEcotone(el: HTMLElement, eco: Ecotone, model: WorldModel): void {
  const a = model.communities.find((c) => c.id === eco.a);
  const b = model.communities.find((c) => c.id === eco.b);
  const kicker = document.createElement('p');
  kicker.className = 'miniworld__panel-kicker';
  kicker.textContent = eco.emerging ? 'Emerging ecotone' : 'Mangrove sandbar';
  const h2 = document.createElement('h2');
  h2.textContent = `${a?.label ?? 'A'} ↔ ${b?.label ?? 'B'}`;
  const body = document.createElement('p');
  body.className = 'body';
  body.textContent = PLACE_MEANINGS.mangrove;
  const h3 = document.createElement('h3');
  h3.textContent = `${eco.people.length} bridge ${eco.people.length === 1 ? 'person' : 'people'}`;
  const ul = document.createElement('ul');
  for (const ref of eco.people) {
    const p = model.people.find((x) => x.ref === ref);
    const li = document.createElement('li');
    li.textContent = p?.displayName ?? ref;
    ul.append(li);
  }
  el.append(kicker, h2, body, h3, ul);
}

function pill(text: string, cls: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = `miniworld__pill ${cls}`;
  s.textContent = text;
  return s;
}
