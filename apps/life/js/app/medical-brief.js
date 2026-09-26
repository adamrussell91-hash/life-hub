import { formatDisplayDate, daysBetween, isCalendarDate } from '../core/time.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EPISODE_EMOJI = { Acute: '🤧', IBD: '🩺', Liver: '🫀', Mind: '🧠' };

/** Relative / precision-aware label for Next rows and river countdowns. */
export function formatRelativeMedicalDate(date, today, {
  precision = null,
  status = null,
  virtual = false,
  compact = false
} = {}) {
  if (status === 'to_book' || precision === 'tbd') return 'action';
  if (!date || !today || !isCalendarDate(date) || !isCalendarDate(today)) {
    return date ? formatDisplayDate(date) : '';
  }
  if (precision === 'month') {
    const [y, m] = date.split('-').map(Number);
    const mon = MONTHS_SHORT[m - 1] || '';
    const thisYear = Number(today.slice(0, 4));
    if (y === thisYear) return Number(date.slice(8, 10)) <= 10 ? `early ${mon}` : mon;
    return `${mon} ${y}`;
  }
  const days = daysBetween(today, date);
  const prefix = virtual ? '~' : '';
  if (days === 0) return `${prefix}today`;
  if (days === 1) return `${prefix}tomorrow`;
  if (days > 1 && days < 60) {
    return compact ? `${prefix}${days} days` : `${prefix}in ${days} days`;
  }
  if (days < 0 && days > -60) return `${Math.abs(days)}d ago`;
  return `${prefix}${formatDisplayDate(date)}`;
}

/**
 * Health Brief (inverted) + Next card row — Concept C hero composition.
 * @param {object} root document-like with createElement / querySelector
 * @param {object} model buildMedicalModel result
 * @param {object} hooks onAddToTasks, onSelect, onJumpUpcoming, onOpenEpisode
 */
export function renderBriefRow(root, model, hooks = {}) {
  const host = root.querySelector('#medical-brief-row');
  if (!host || !model) return;
  host.replaceChildren();
  host.append(
    healthBriefCard(root, model, hooks),
    nextCard(root, model, hooks)
  );
}

/** One navy card: Active episode · Stelara cycle · Watch (stacked). */
function healthBriefCard(root, model, hooks) {
  const card = root.createElement('article');
  card.className = 'medical-brief-card medical-brief-card--now';
  card.setAttribute('aria-label', 'Health Brief');

  const title = root.createElement('h3');
  title.className = 'medical-brief-card__title medical-brief-card__title--now';
  title.textContent = 'Health Brief';
  card.append(title);

  const body = root.createElement('div');
  body.className = 'medical-brief__now';

  const ep = model.activeEpisode;
  const brief = model.brief || {};
  const hasEpisode = Boolean(ep);
  const hasCycle = Boolean(brief.cycle);
  const hasWatch = Boolean(brief.watch?.length) || Boolean(brief.verdict)
    || Boolean(watchSupportLine(model));

  if (!hasEpisode && !hasCycle && !hasWatch) {
    card.append(emptyLine(root, 'No active episode, cycle meter, or watch items yet.'));
    return card;
  }

  body.append(episodeSection(root, model, hooks));
  if (hasCycle) body.append(cycleSection(root, brief.cycle));
  if (hasWatch) body.append(watchSection(root, model));
  card.append(body);
  return card;
}

function episodeSection(root, model, hooks) {
  const section = root.createElement('div');
  section.className = 'medical-brief__section';

  const kicker = root.createElement('p');
  kicker.className = 'medical-brief__kicker';
  kicker.textContent = 'Active episode';
  section.append(kicker);

  const ep = model.activeEpisode;
  if (!ep) {
    const last = lastResolvedEpisode(model.allVisits || model.visits || []);
    section.append(emptyLine(
      root,
      last
        ? `No active episode · last: ${last.title}, resolved ${formatDisplayDate(last.resolved || last.lastDate)}`
        : 'No active episode.'
    ));
    return section;
  }

  const btn = root.createElement('button');
  btn.type = 'button';
  btn.className = 'medical-brief__hit';
  btn.setAttribute('aria-label', `Open ${ep.title} episode in timeline`);
  btn.addEventListener('click', () => hooks.onOpenEpisode?.(ep.id));

  const value = root.createElement('p');
  value.className = 'medical-brief__value';
  value.textContent = `${EPISODE_EMOJI.Acute} ${ep.title} · day ${ep.dayNumber || 1}`;

  const latest = ep.entries?.[0];
  const note = root.createElement('p');
  note.className = 'medical-brief__support';
  note.textContent = latest
    ? `${truncate(latest.notes || latest.title, 120)}${latest.date ? ` · ${formatDisplayDate(latest.date)}` : ''}`
    : '';

  btn.append(value, note);
  section.append(btn);
  return section;
}

function cycleSection(root, cycle) {
  const section = root.createElement('div');
  section.className = 'medical-brief__section';

  const kicker = root.createElement('p');
  kicker.className = 'medical-brief__kicker';
  kicker.textContent = `${cycle.label} cycle`;

  const value = root.createElement('p');
  value.className = 'medical-brief__value';
  value.textContent = `Week ${cycle.week} of ${cycle.of}`;

  const meter = root.createElement('div');
  meter.className = 'medical-brief__meter';
  meter.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= cycle.of; i += 1) {
    const seg = root.createElement('i');
    if (i <= cycle.week) seg.className = 'is-filled';
    meter.append(seg);
  }

  section.append(kicker, value, meter);

  if (cycle.nextDate && isCalendarDate(cycle.nextDate)) {
    const support = root.createElement('p');
    support.className = 'medical-brief__support';
    support.textContent = `Next dose ~${formatShortDayMonth(cycle.nextDate)}`;
    section.append(support);
  }
  return section;
}

function watchSection(root, model) {
  const section = root.createElement('div');
  section.className = 'medical-brief__section';

  const kicker = root.createElement('p');
  kicker.className = 'medical-brief__kicker';
  kicker.textContent = 'Watch';
  section.append(kicker);

  const watch = model.brief?.watch || [];
  if (watch.length) {
    const primary = watch[0];
    const value = root.createElement('p');
    value.className = 'medical-brief__value medical-brief__value--watch';
    value.dataset.status = primary.status === 'High' || primary.status === 'Low' ? 'flag' : 'ok';
    value.textContent = `${primary.label} ${primary.value ?? ''} ${primary.arrow || ''}`.trim();
    section.append(value);
    if (watch[1]) {
      const second = root.createElement('p');
      second.className = 'medical-brief__watch-secondary';
      second.dataset.status = watch[1].status === 'High' || watch[1].status === 'Low' ? 'flag' : 'ok';
      second.textContent = `${watch[1].label} ${watch[1].value ?? ''} ${watch[1].arrow || ''}`.trim();
      section.append(second);
    }
  }

  const supportText = watchSupportLine(model) || model.brief?.verdict;
  if (supportText) {
    const support = root.createElement('p');
    support.className = 'medical-brief__support';
    support.textContent = supportText;
    section.append(support);
  } else if (!watch.length) {
    section.append(emptyLine(root, 'Nothing on watch.'));
  }
  return section;
}

/** Prefer a to_book / MRI-style support line under Watch (Concept C). */
function watchSupportLine(model) {
  const action = (model.nextItems || []).find(visit =>
    visit.status === 'to_book' || visit.date_precision === 'tbd'
  );
  if (!action) return null;
  const short = shortBookTitle(action.title);
  return `${short} ordered — not booked yet`;
}

function nextCard(root, model, hooks) {
  const card = surfaceCard(root, 'Next');
  card.classList.add('medical-brief-card--next');
  const items = model.nextItems || [];
  if (!items.length) {
    card.append(emptyLine(root, 'Nothing planned.'));
    return card;
  }

  const list = root.createElement('ul');
  list.className = 'medical-brief__next';
  const shown = items.slice(0, 5);
  for (const visit of shown) list.append(buildNextRow(root, visit, model, hooks));
  card.append(list);

  const more = (model.nextItems?.length || 0) - shown.length;
  if (more > 0) {
    const moreBtn = root.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'btn btn--ghost medical-brief__more';
    moreBtn.textContent = `+${more} more`;
    moreBtn.addEventListener('click', () => hooks.onJumpUpcoming?.());
    card.append(moreBtn);
  }
  return card;
}

function buildNextRow(root, visit, model, hooks) {
  const li = root.createElement('li');
  li.className = 'medical-brief__next-row';

  const titleBtn = root.createElement('button');
  titleBtn.type = 'button';
  titleBtn.className = 'medical-brief__next-open';

  const emoji = root.createElement('span');
  emoji.className = 'medical-brief__next-emoji';
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = nextEmoji(visit);

  const title = root.createElement('span');
  title.className = 'medical-brief__next-title';
  title.textContent = nextTitle(visit);

  const when = root.createElement('span');
  when.className = 'medical-brief__next-when';
  const label = formatRelativeMedicalDate(visit.date, model.today, {
    precision: visit.date_precision,
    status: visit.status,
    virtual: false,
    compact: true
  });
  when.textContent = label;
  if (label === 'action') when.dataset.tone = 'action';

  titleBtn.append(emoji, title, when);
  titleBtn.addEventListener('click', () => hooks.onSelect?.(visit.id));
  li.append(titleBtn);

  const eligible = visit.status === 'to_book' || visit.date_precision === 'tbd';
  if (eligible || visit.task_id) {
    const taskBtn = root.createElement('button');
    taskBtn.type = 'button';
    taskBtn.className = 'btn btn--ghost medical-brief__task';
    taskBtn.setAttribute('aria-label', visit.task_id ? 'Already in Tasks' : 'Add to Tasks');
    if (visit.task_id) {
      taskBtn.textContent = 'In Tasks ✓';
      taskBtn.disabled = true;
    } else {
      taskBtn.textContent = 'Add to Tasks';
      taskBtn.addEventListener('click', () => hooks.onAddToTasks?.(visit));
    }
    li.append(taskBtn);
  }
  return li;
}

function nextEmoji(visit) {
  const title = String(visit.title || '');
  if (visit.status === 'to_book' || visit.date_precision === 'tbd') return '📞';
  if (/stelara|ustekinumab/i.test(title)) return '💉';
  if (/blood/i.test(title) || visit.lane === 'lab' || visit.record_type === 'Lab Work') return '🩸';
  if (/colonoscop/i.test(title)) return '🔬';
  if (/gastro|review|consult/i.test(title) || visit.record_type === 'Consultation') return '🩺';
  if (visit.lane === 'imaging' || visit.record_type === 'Imaging') return '🔬';
  if (visit.lane === 'therapy') return '🧠';
  return '🗓️';
}

function nextTitle(visit) {
  const raw = String(visit.title || '').trim();
  if (visit.status === 'to_book' || visit.date_precision === 'tbd') {
    return `Book ${shortBookTitle(raw)}`;
  }
  return raw;
}

function shortBookTitle(title) {
  const raw = String(title || '').trim();
  if (!raw) return 'appointment';
  const head = raw.split(/\s*[—–-]\s*/)[0].trim();
  return head || raw;
}

function formatShortDayMonth(dateKey) {
  if (!isCalendarDate(dateKey)) return formatDisplayDate(dateKey);
  const [, m, d] = dateKey.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1] || ''}`.trim();
}

function surfaceCard(root, heading) {
  const card = root.createElement('article');
  card.className = 'medical-brief-card';
  const h = root.createElement('h3');
  h.className = 'medical-brief-card__title';
  h.textContent = heading;
  card.append(h);
  return card;
}

function emptyLine(root, text) {
  const p = root.createElement('p');
  p.className = 'medical-brief__empty';
  p.textContent = text;
  return p;
}

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function lastResolvedEpisode(visits) {
  const byId = new Map();
  for (const visit of visits) {
    const ep = visit.episode;
    if (!ep?.id) continue;
    const status = ep.status || 'active';
    if (status !== 'resolved' && status !== 'resolved?') continue;
    const existing = byId.get(ep.id);
    if (!existing || visit.date > existing.lastDate) {
      byId.set(ep.id, {
        id: ep.id,
        title: ep.title,
        resolved: ep.resolved || visit.date,
        lastDate: visit.date
      });
    }
  }
  let best = null;
  for (const ep of byId.values()) {
    if (!best || ep.lastDate > best.lastDate) best = ep;
  }
  return best;
}
