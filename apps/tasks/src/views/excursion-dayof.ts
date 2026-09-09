import type { ActiveEscalation, MusterStop, Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { ESCALATION_TIERS, currentEscalationTierIndex } from '@/domain/excursion-muster';
import { buildExcursionMarkdown, excursionMarkdownFilename } from '@/domain/excursion-record';
import { createHubField, el } from '@/views/hub-kit';

const LADDER_TICK_MS = 20_000;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Choke-Point Muster + Missing-Student Escalation Ladder — tap a roll-call
 * stop to confirm the count; reporting one short starts a ladder computed
 * from real elapsed time, so it survives a reload mid-incident.
 */
export function renderMusterSection(
  project: Project,
  persist: (patch: Partial<Project>) => void,
  onChange: () => void
): HTMLElement {
  const stops: MusterStop[] = [...(project.day_of_muster ?? [])];
  const log = [...(project.muster_log ?? [])];
  let escalation: ActiveEscalation | null = project.active_escalation ?? null;
  let headcount = project.expected_headcount;
  let tickTimer: number | undefined;

  const host = el('section', 'excursion-tracker excursion-muster');
  host.append(el('p', 'hub-card__eyebrow', 'Choke-Point Muster'));

  const headcountField = createHubField({
    ariaLabel: 'Expected headcount',
    type: 'number',
    value: headcount != null ? String(headcount) : '',
    placeholder: 'Expected headcount',
    className: 'excursion-muster__headcount',
    onChange: (value) => {
      const parsed = Number.parseInt(value, 10);
      headcount = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      persist({ expected_headcount: headcount });
    }
  });
  host.append(headcountField.el);

  const grid = el('div', 'excursion-muster__grid');
  const ladderHost = el('div', 'excursion-muster__ladder-host');
  const logHost = el('div', 'excursion-muster__log');
  host.append(grid, ladderHost, logHost);

  function pushLog(label: string, note: string) {
    log.push({ at: nowIso(), label, note });
    persist({ muster_log: [...log] });
  }

  function stopTicking() {
    if (tickTimer !== undefined) {
      window.clearInterval(tickTimer);
      tickTimer = undefined;
    }
  }

  function confirmStop(stop: MusterStop) {
    stop.status = 'confirmed';
    stop.short_by = null;
    pushLog(stop.label, `confirmed${headcount != null ? ` ${headcount}/${headcount}` : ''} present`);
    persist({ day_of_muster: [...stops] });
    renderAll();
  }

  function reportShort(stop: MusterStop) {
    const raw = window.prompt(`Short by how many at "${stop.label}"?`, '1');
    if (raw == null) return;
    const shortBy = Number.parseInt(raw, 10);
    if (!Number.isFinite(shortBy) || shortBy <= 0) return;
    stop.status = 'short';
    stop.short_by = shortBy;
    pushLog(stop.label, `short by ${shortBy}`);
    escalation = { stop_id: stop.id, started_at: nowIso(), resolved: false };
    persist({ day_of_muster: [...stops], active_escalation: escalation });
    renderAll();
  }

  function resolveEscalation() {
    if (!escalation) return;
    const stop = stops.find((s) => s.id === escalation!.stop_id);
    if (stop) {
      stop.status = 'confirmed';
      stop.short_by = null;
      pushLog(stop.label, 'resolved — student present, ladder stood down');
    }
    escalation = null;
    persist({ day_of_muster: [...stops], active_escalation: null });
    renderAll();
  }

  function addStop(label: string, time: string) {
    stops.push({ id: crypto.randomUUID(), label, time: time || null, status: 'pending', short_by: null });
    persist({ day_of_muster: [...stops] });
    renderAll();
  }

  function renderGrid() {
    grid.replaceChildren();
    if (!stops.length) {
      grid.append(el('p', 'empty-state', 'Add the roll-call points from your running sheet.'));
      return;
    }
    for (const stop of stops) {
      const cell = el('div', `excursion-muster__stop is-${stop.status}`);
      const btn = el('button', 'excursion-muster__stop-btn') as HTMLButtonElement;
      btn.type = 'button';
      const count =
        stop.status === 'confirmed'
          ? String(headcount ?? '✓')
          : stop.status === 'short'
            ? String((headcount ?? stop.short_by ?? 0) - (stop.short_by ?? 0))
            : '·';
      btn.append(el('span', 'excursion-muster__dot', count));
      const lab = el('span', 'excursion-muster__lab', stop.label);
      btn.append(lab);
      if (stop.time) btn.append(el('span', 'excursion-muster__time', stop.time));
      btn.addEventListener('click', () => {
        if (stop.status === 'confirmed') return;
        if (stop.status === 'short') return;
        confirmStop(stop);
      });
      cell.append(btn);
      if (stop.status !== 'confirmed') {
        const shortBtn = el('button', 'excursion-muster__short-btn', 'Report short');
        shortBtn.type = 'button';
        shortBtn.addEventListener('click', () => reportShort(stop));
        cell.append(shortBtn);
      }
      grid.append(cell);
    }
  }

  function renderLadder() {
    ladderHost.replaceChildren();
    stopTicking();
    if (!escalation) return;
    const stop = stops.find((s) => s.id === escalation!.stop_id);
    const card = el('div', 'excursion-ladder');
    card.append(
      el(
        'p',
        'hub-card__eyebrow',
        `Missing-Student Escalation Ladder — ${stop?.label ?? 'unknown stop'}`
      )
    );
    const tierIndex = currentEscalationTierIndex(escalation);
    const list = el('div', 'excursion-ladder__tiers');
    ESCALATION_TIERS.forEach((tier, i) => {
      const row = el(
        'div',
        `excursion-ladder__tier excursion-ladder__tier--${tier.level}${i <= tierIndex ? ' is-active' : ''}`
      );
      row.append(el('span', 'excursion-ladder__tier-label', tier.label), el('span', '', tier.what));
      list.append(row);
    });
    card.append(list);
    const resolve = el('button', 'btn btn--secondary', 'Mark present — resolve');
    resolve.type = 'button';
    resolve.addEventListener('click', resolveEscalation);
    card.append(resolve);
    ladderHost.append(card);
    tickTimer = window.setInterval(renderLadder, LADDER_TICK_MS);
  }

  function renderLog() {
    logHost.replaceChildren();
    if (!log.length) return;
    logHost.append(el('p', 'hub-card__eyebrow', 'Muster log'));
    const list = el('ul', 'excursion-muster__log-list');
    for (const entry of [...log].reverse()) {
      list.append(el('li', '', `${entry.label} — ${entry.note}`));
    }
    logHost.append(list);
  }

  function renderAll() {
    renderGrid();
    renderLadder();
    renderLog();
    onChange();
  }

  const addRow = el('div', 'page-card__fields excursion-muster__add');
  const labelField = createHubField({ ariaLabel: 'Stop label', placeholder: 'e.g. Board 415' });
  const timeField = createHubField({ ariaLabel: 'Stop time', placeholder: 'e.g. 8:32am' });
  const addBtn = el('button', 'btn btn--secondary', 'Add stop');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    const label = labelField.input.value.trim();
    if (!label) return;
    addStop(label, timeField.input.value.trim());
    labelField.input.value = '';
    timeField.input.value = '';
  });
  addRow.append(labelField.el, timeField.el, addBtn);
  host.append(addRow);

  renderAll();
  return host;
}

/** Folder Builder + export — the actual sixteen-item excursion folder, filed away. */
export function renderFolderSection(project: Project, tasks: Task[], persist: (patch: Partial<Project>) => void): HTMLElement {
  const items = [...(project.folder_items ?? [])];
  const host = el('section', 'excursion-tracker excursion-folder');
  host.append(el('p', 'hub-card__eyebrow', 'Folder Builder'));

  if (!items.length) {
    host.append(el('p', 'empty-state', 'No folder checklist on this excursion yet.'));
    return host;
  }

  const title = el('p', 'excursion-folder__title');
  const track = el('div', 'hub-track');
  const fill = el('div', 'hub-track__fill');
  track.append(fill);
  const list = el('ul', 'excursion-folder__list');

  function refresh() {
    const present = items.filter((item) => item.on).length;
    title.textContent = `${present} / ${items.length} items present`;
    fill.style.width = `${Math.round((present / items.length) * 100)}%`;
  }

  for (const item of items) {
    const row = el('li', `excursion-folder__item${item.on ? ' is-on' : ''}`);
    const label = el('label', 'task-check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.on;
    box.setAttribute('aria-label', item.name);
    box.addEventListener('change', () => {
      item.on = box.checked;
      row.classList.toggle('is-on', item.on);
      refresh();
      persist({ folder_items: [...items] });
    });
    label.append(box, el('span', 'check-box'));
    row.append(label, el('span', 'task-name', item.name));
    list.append(row);
  }

  refresh();
  host.append(title, track, list);

  const exportRow = el('div', 'excursion-folder__export');
  const mdBtn = el('button', 'btn btn--secondary', 'Download Markdown');
  mdBtn.type = 'button';
  mdBtn.addEventListener('click', () => {
    const blob = new Blob([buildExcursionMarkdown(project, tasks)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = excursionMarkdownFilename(project);
    a.click();
    URL.revokeObjectURL(url);
  });
  exportRow.append(mdBtn);
  host.append(exportRow);

  return host;
}
