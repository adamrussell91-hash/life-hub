/**
 * Clare / Hammond productivity OS structured cards (Cotton Glass).
 * Decision UI only — durable writes still go through .confirm-card / confirm handlers.
 */

import {
  TIME_GRID_END_HOUR,
  TIME_GRID_HOUR_PX,
  TIME_GRID_START_HOUR,
  blockStyle,
  layoutTimedBlocks,
  parseTimeHours,
  timeGridHours
} from './time-grid.js';

function createEl(root) {
  return root?.createElement?.bind(root) ?? globalThis.document.createElement.bind(globalThis.document);
}

function shell(create, opts = {}) {
  const card = create('section');
  card.className = `prod-card confirm-card${opts.className ? ` ${opts.className}` : ''}`;
  card.setAttribute('role', opts.role || 'group');
  card.setAttribute('aria-label', opts.ariaLabel || opts.title || 'Productivity card');
  if (opts.cardType) card.dataset.cardType = opts.cardType;

  const eyebrow = create('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = opts.eyebrow || 'Clare';
  card.append(eyebrow);

  if (opts.title) {
    const title = create('h2');
    title.className = 'prod-card__title';
    title.textContent = opts.title;
    card.append(title);
  }
  if (opts.hint) {
    const hint = create('p');
    hint.className = 'prod-card__hint';
    hint.textContent = opts.hint;
    card.append(hint);
  }
  return card;
}

function actionsRow(create, buttons) {
  const actions = create('div');
  actions.className = 'confirm-card__actions';
  for (const spec of buttons) {
    const btn = create('button');
    btn.type = 'button';
    btn.className = spec.className || 'btn btn--ghost';
    btn.textContent = spec.label;
    if (spec.disabled) btn.disabled = true;
    btn.addEventListener('click', () => spec.onClick?.(btn, actions));
    actions.append(btn);
  }
  return actions;
}

function receipt(create, actions, text) {
  const p = create('p');
  p.className = 'prod-card__receipt';
  p.textContent = text;
  actions.replaceChildren(p);
}

function srText(create, text) {
  const p = create('p');
  p.className = 'sr-only';
  p.textContent = text;
  return p;
}

function setCardState(card, state) {
  card.dataset.state = state;
  card.classList.toggle('is-submitting', state === 'submitting');
  card.classList.toggle('is-receipt', state === 'confirmed' || state === 'discarded');
  card.classList.toggle('is-failed', state === 'failed');
}

function showCardFailure(create, card, message) {
  let note = card.querySelector('.prod-card__failure');
  if (!note) {
    note = create('p');
    note.className = 'prod-card__failure';
    note.setAttribute('role', 'alert');
    note.style.whiteSpace = 'pre-wrap';
    card.append(note);
  }
  note.textContent = message || 'Could not save. Try again.';
}

function clearCardFailure(card) {
  card.querySelector('.prod-card__failure')?.remove();
}

/**
 * Run a durable card action without claiming success until the callback resolves.
 * Callbacks may return a Promise. Failure restores controls.
 * Structured errors (e.g. stale_schedule_collision) keep their full message/details on the card.
 */
async function runDurableCardAction(card, create, actions, {
  action,
  successText,
  failureText,
  successState = 'confirmed',
  controls
} = {}) {
  if (card.dataset.state === 'submitting') return false;
  clearCardFailure(card);
  const nodes = [...(controls ?? card.querySelectorAll('button, input, select'))];
  setCardState(card, 'submitting');
  for (const el of nodes) el.disabled = true;
  try {
    await Promise.resolve(typeof action === 'function' ? action() : action);
    setCardState(card, successState);
    receipt(create, actions, successText);
    return true;
  } catch (err) {
    setCardState(card, 'failed');
    for (const el of nodes) el.disabled = false;
    const message =
      err instanceof Error && err.message
        ? err.message
        : failureText || 'Could not save. Try again.';
    showCardFailure(create, card, message);
    return false;
  }
}

const DESTINATIONS = [
  { id: 'next_action', label: 'Next action' },
  { id: 'project', label: 'Project' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'someday', label: 'Someday' },
  { id: 'reference', label: 'Reference' },
  { id: 'trash', label: 'Trash' }
];

/**
 * Clarify Stack — rows with destination select, exclude, Confirm All / Confirm selected.
 */
export function createDecisionStackCard(root, options = {}) {
  const create = createEl(root);
  const items = (options.items ?? []).map((item, i) => ({
    id: item.id || `item_${i + 1}`,
    text: item.text || '',
    destination: item.destination || 'next_action',
    excluded: Boolean(item.excluded),
    selected: item.selected !== false,
    question: item.question || null
  }));

  const card = shell(create, {
    cardType: 'decision-stack',
    eyebrow: options.eyebrow || 'Clarify',
    title: options.title || 'Clarify stack',
    hint: options.hint || 'Edit destinations, then confirm.',
    ariaLabel: 'Clarify stack'
  });

  const list = create('div');
  list.className = 'prod-card__stack';
  list.setAttribute('role', 'list');
  card.append(list);

  const rowState = new Map();

  function snapshot() {
    return items
      .filter((item) => {
        const state = rowState.get(item.id);
        return state && !state.excluded;
      })
      .map((item) => {
        const state = rowState.get(item.id);
        return {
          id: item.id,
          text: item.text,
          destination: state.destination,
          selected: state.selected
        };
      });
  }

  for (const item of items) {
    const row = create('div');
    row.className = 'prod-card__stack-row';
    row.setAttribute('role', 'listitem');
    row.dataset.itemId = item.id;

    const check = create('input');
    check.type = 'checkbox';
    check.checked = item.selected && !item.excluded;
    check.disabled = item.excluded;
    check.setAttribute('aria-label', `Select ${item.text}`);

    const label = create('span');
    label.className = 'prod-card__stack-text';
    label.textContent = item.text;

    const select = create('select');
    select.className = 'prod-card__select';
    select.setAttribute('aria-label', `Destination for ${item.text}`);
    for (const dest of options.destinations ?? DESTINATIONS) {
      const opt = create('option');
      opt.value = dest.id;
      opt.textContent = dest.label;
      if (dest.id === item.destination) opt.selected = true;
      select.append(opt);
    }

    const exclude = create('button');
    exclude.type = 'button';
    exclude.className = 'btn btn--ghost prod-card__exclude';
    exclude.textContent = item.excluded ? 'Restore' : 'Exclude';
    exclude.setAttribute('aria-pressed', item.excluded ? 'true' : 'false');

    const state = {
      destination: item.destination,
      selected: item.selected && !item.excluded,
      excluded: item.excluded
    };
    rowState.set(item.id, state);

    function paintRow() {
      row.classList.toggle('is-excluded', state.excluded);
      check.disabled = state.excluded;
      check.checked = state.selected && !state.excluded;
      select.disabled = state.excluded;
      exclude.textContent = state.excluded ? 'Restore' : 'Exclude';
      exclude.setAttribute('aria-pressed', state.excluded ? 'true' : 'false');
    }

    check.addEventListener('change', () => {
      state.selected = check.checked;
    });
    select.addEventListener('change', () => {
      state.destination = select.value;
      options.onChange?.(snapshot());
    });
    exclude.addEventListener('click', () => {
      state.excluded = !state.excluded;
      if (state.excluded) state.selected = false;
      else state.selected = true;
      paintRow();
      options.onChange?.(snapshot());
    });

    row.append(check, label, select, exclude);
    if (item.question) {
      const q = create('p');
      q.className = 'prod-card__stack-question';
      q.textContent = item.question;
      row.append(q);
    }
    paintRow();
    list.append(row);
  }

  card.append(
    srText(
      create,
      `${items.length} item${items.length === 1 ? '' : 's'} to clarify.`
    )
  );

  setCardState(card, options.pendingId || options.allowUnbound ? 'ready' : 'failed');
  if (!options.pendingId && !options.allowUnbound) {
    showCardFailure(create, card, 'This card has no proposal id. Re-run the protocol.');
  }

  const actions = actionsRow(create, [
    {
      label: 'Confirm selected',
      className: 'btn btn--secondary',
      disabled: !options.pendingId && !options.allowUnbound,
      onClick: (btn, host) => {
        const picks = snapshot().filter((item) => item.selected);
        if (!picks.length) return;
        void runDurableCardAction(card, create, host, {
          action: () => options.onConfirmSelected?.(picks),
          successText: `Confirmed ${picks.length} selected.`,
          controls: card.querySelectorAll('button, input, select')
        });
      }
    },
    {
      label: 'Confirm All',
      className: 'btn btn--primary',
      disabled: !options.pendingId && !options.allowUnbound,
      onClick: (btn, host) => {
        const picks = snapshot();
        if (!picks.length) return;
        void runDurableCardAction(card, create, host, {
          action: () => options.onConfirmAll?.(picks),
          successText: `Confirmed all ${picks.length}.`,
          controls: card.querySelectorAll('button, input, select')
        });
      }
    }
  ]);
  card.append(actions);
  return card;
}

const REVIEW_STAGE_LABELS = {
  capture: 'Capture',
  past_calendar: 'Past calendar',
  upcoming_calendar: 'Upcoming calendar',
  waiting: 'Waiting',
  projects: 'Projects',
  someday: 'Someday',
  build_week: 'Build week',
  confirm: 'Confirm'
};

/** Weekly Review — 8 stages; completed collapse, current open. */
export function createReviewProgressCard(root, options = {}) {
  const create = createEl(root);
  const stages = options.stages ?? Object.keys(REVIEW_STAGE_LABELS);
  const completed = new Set(options.completed ?? []);
  const current = options.current ?? stages[0];

  const card = shell(create, {
    cardType: 'review-progress',
    eyebrow: options.eyebrow || 'Weekly Review',
    title: options.title || 'Review progress',
    hint: options.hint,
    ariaLabel: `Weekly review: ${REVIEW_STAGE_LABELS[current] || current}`
  });

  const list = create('ol');
  list.className = 'prod-card__stages';
  card.append(list);

  for (const stage of stages) {
    const li = create('li');
    li.className = 'prod-card__stage';
    li.dataset.stage = stage;
    const done = completed.has(stage);
    const isCurrent = stage === current;
    if (done && !isCurrent) li.classList.add('is-collapsed', 'is-done');
    if (isCurrent) li.classList.add('is-current', 'is-open');

    const head = create('button');
    head.type = 'button';
    head.className = 'prod-card__stage-head';
    head.textContent = REVIEW_STAGE_LABELS[stage] || stage;
    head.setAttribute('aria-expanded', isCurrent ? 'true' : 'false');

    const body = create('div');
    body.className = 'prod-card__stage-body';
    body.hidden = !isCurrent;
    if (isCurrent && options.currentDetail) {
      body.textContent = options.currentDetail;
    } else if (done) {
      body.textContent = 'Done';
    } else {
      body.textContent = 'Pending';
    }

    head.addEventListener('click', () => {
      options.onSelectStage?.(stage);
      for (const peer of list.children) {
        const open = peer.dataset.stage === stage;
        peer.classList.toggle('is-open', open);
        peer.classList.toggle('is-current', open);
        const peerBody = peer.querySelector('.prod-card__stage-body');
        const peerHead = peer.querySelector('.prod-card__stage-head');
        if (peerBody) peerBody.hidden = !open;
        if (peerHead) peerHead.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    });

    li.append(head, body);
    list.append(li);
  }

  card.append(
    srText(
      create,
      `Current stage ${REVIEW_STAGE_LABELS[current] || current}. ${completed.size} of ${stages.length} complete.`
    )
  );
  return card;
}

/**
 * Schedule Diff — mini time grid; ghost blocks translucent; Confirm Selected / Discard / Preview.
 * Preview does not write — ghost only.
 */
export function createScheduleDiffCard(root, options = {}) {
  const create = createEl(root);
  const blocks = (options.blocks ?? []).map((b, i) => ({
    id: b.id || `block_${i + 1}`,
    title: b.title || 'Block',
    time: b.start_time || b.time || '09:00',
    durationMin: b.duration_minutes ?? b.durationMin ?? 60,
    ghost: b.ghost !== false,
    selected: b.selected !== false,
    date: b.date || null
  }));

  const card = shell(create, {
    cardType: 'schedule-diff',
    eyebrow: options.eyebrow || 'Schedule',
    title: options.title || 'Proposed schedule',
    hint: options.hint || 'Ghost blocks are preview only until confirmed.',
    ariaLabel: 'Schedule diff'
  });

  const selected = new Set(blocks.filter((b) => b.selected).map((b) => b.id));

  const grid = create('div');
  grid.className = 'prod-card__time-grid';
  grid.setAttribute('role', 'img');
  grid.setAttribute(
    'aria-label',
    `Time grid from ${TIME_GRID_START_HOUR}:00 to ${TIME_GRID_END_HOUR}:00 with ${blocks.length} proposed block${blocks.length === 1 ? '' : 's'}`
  );

  const hours = create('div');
  hours.className = 'prod-card__time-hours';
  for (const hour of timeGridHours()) {
    const tick = create('span');
    tick.className = 'prod-card__time-hour';
    tick.style.height = `${TIME_GRID_HOUR_PX}px`;
    tick.textContent = String(hour);
    hours.append(tick);
  }

  const lane = create('div');
  lane.className = 'prod-card__time-lane';
  lane.style.height = `${(TIME_GRID_END_HOUR - TIME_GRID_START_HOUR) * TIME_GRID_HOUR_PX}px`;

  const laid = layoutTimedBlocks(blocks);
  for (const block of laid) {
    const item = block.item;
    const node = create('button');
    node.type = 'button';
    node.className = 'prod-card__ghost-block';
    if (item.ghost) node.classList.add('is-ghost');
    if (selected.has(item.id)) node.classList.add('is-selected');
    node.dataset.blockId = item.id;
    Object.assign(node.style, blockStyle(block));
    node.textContent = item.title;
    node.setAttribute(
      'aria-label',
      `${item.title} at ${item.time} for ${item.durationMin} minutes${item.ghost ? ', ghost proposal' : ''}`
    );
    node.setAttribute('aria-pressed', selected.has(item.id) ? 'true' : 'false');
    node.addEventListener('click', () => {
      if (selected.has(item.id)) selected.delete(item.id);
      else selected.add(item.id);
      node.classList.toggle('is-selected', selected.has(item.id));
      node.setAttribute('aria-pressed', selected.has(item.id) ? 'true' : 'false');
      options.onSelectChange?.(selectedBlocks());
    });
    lane.append(node);
  }

  grid.append(hours, lane);
  card.append(grid);

  const removeRow = create('div');
  removeRow.className = 'prod-card__block-list';
  for (const item of blocks) {
    const row = create('div');
    row.className = 'prod-card__block-row';
    const label = create('span');
    label.textContent = `${item.title} · ${item.time}`;
    const remove = create('button');
    remove.type = 'button';
    remove.className = 'btn btn--ghost';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      selected.delete(item.id);
      row.remove();
      lane.querySelector(`[data-block-id="${item.id}"]`)?.remove();
      options.onRemove?.(item);
      options.onSelectChange?.(selectedBlocks());
    });
    row.append(label, remove);
    removeRow.append(row);
  }
  card.append(removeRow);

  function selectedBlocks() {
    return blocks.filter((b) => selected.has(b.id) && lane.querySelector(`[data-block-id="${b.id}"]`));
  }

  let previewActive = Boolean(options.previewActive);

  setCardState(card, options.pendingId || options.allowUnbound ? 'ready' : 'failed');
  if (!options.pendingId && !options.allowUnbound) {
    showCardFailure(create, card, 'This schedule has no proposal id. Re-run Plan Day.');
  }

  const actions = actionsRow(create, [
    {
      label: 'Discard',
      className: 'btn btn--ghost',
      disabled: !options.pendingId && !options.allowUnbound,
      onClick: (btn, host) => {
        void runDurableCardAction(card, create, host, {
          action: () => options.onDiscard?.(),
          successText: 'Discarded.',
          successState: 'discarded',
          controls: card.querySelectorAll('button, input, select')
        });
      }
    },
    {
      label: previewActive ? 'Hide preview' : 'Preview',
      className: 'btn btn--secondary',
      onClick: (btn) => {
        previewActive = !previewActive;
        btn.textContent = previewActive ? 'Hide preview' : 'Preview';
        card.classList.toggle('is-preview', previewActive);
        // Preview never writes — ghost overlay only.
        options.onPreview?.(previewActive, selectedBlocks());
      }
    },
    {
      label: 'Confirm Selected',
      className: 'btn btn--primary',
      disabled: !options.pendingId && !options.allowUnbound,
      onClick: (btn, host) => {
        const picks = selectedBlocks();
        if (!picks.length) return;
        void runDurableCardAction(card, create, host, {
          action: () => options.onConfirm?.(picks),
          successText: `Confirmed ${picks.length} block${picks.length === 1 ? '' : 's'}.`,
          controls: card.querySelectorAll('button, input, select')
        });
      }
    }
  ]);
  card.append(actions);
  card.append(
    srText(
      create,
      `${blocks.length} proposed work block${blocks.length === 1 ? '' : 's'}. Preview does not save.`
    )
  );
  return { card, getSelected: selectedBlocks, isPreview: () => previewActive };
}

/** Horizontal Now → Deadline runway segments (DOM/SVG). */
export function createRunwayCard(root, options = {}) {
  const create = createEl(root);
  const segments = options.segments ?? [];
  const card = shell(create, {
    cardType: 'runway',
    eyebrow: options.eyebrow || 'Runway',
    title: options.title || 'Deadline runway',
    hint: options.hint || options.note,
    ariaLabel: `Deadline runway: ${options.risk || 'clear'}`
  });

  const track = create('div');
  track.className = 'prod-card__runway';
  track.setAttribute('role', 'img');
  const labels = segments.map((s) => s.label).join(' → ') || 'No segments';
  track.setAttribute('aria-label', `Now to deadline: ${labels}`);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = globalThis.document?.createElementNS
    ? globalThis.document.createElementNS(svgNS, 'svg')
    : create('div');
  if (svg.setAttribute) {
    svg.setAttribute('viewBox', '0 0 320 48');
    svg.setAttribute('class', 'prod-card__runway-svg');
    svg.setAttribute('aria-hidden', 'true');
    const n = Math.max(segments.length, 1);
    segments.forEach((seg, i) => {
      const x = (i / n) * 300 + 10;
      const w = 300 / n - 4;
      const rect = globalThis.document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', '12');
      rect.setAttribute('width', String(Math.max(w, 8)));
      rect.setAttribute('height', '16');
      rect.setAttribute('rx', '4');
      rect.setAttribute('class', `prod-card__runway-seg prod-card__runway-seg--${seg.kind || 'work'}`);
      svg.appendChild(rect);
      const text = globalThis.document.createElementNS(svgNS, 'text');
      text.setAttribute('x', String(x + 2));
      text.setAttribute('y', '42');
      text.setAttribute('class', 'prod-card__runway-label');
      text.textContent = String(seg.label || '').slice(0, 12);
      svg.appendChild(text);
    });
    if (!segments.length) {
      const text = globalThis.document.createElementNS(svgNS, 'text');
      text.setAttribute('x', '10');
      text.setAttribute('y', '28');
      text.textContent = 'No runway';
      svg.appendChild(text);
    }
  }
  track.append(svg);

  const legend = create('ul');
  legend.className = 'prod-card__legend';
  for (const seg of segments) {
    const li = create('li');
    li.textContent = [
      seg.label,
      seg.minutes != null ? `${seg.minutes}m` : null,
      seg.date
    ]
      .filter(Boolean)
      .join(' · ');
    legend.append(li);
  }
  card.append(track, legend);
  if (options.risk) {
    const risk = create('p');
    risk.className = 'prod-card__meta';
    risk.textContent = `Risk: ${options.risk}`;
    card.append(risk);
  }
  return card;
}

/** Stacked bar with labels (not colour-only) + coverage text. */
export function createMetricAuditStripCard(root, options = {}) {
  const create = createEl(root);
  const parts = options.parts ?? [];
  const card = shell(create, {
    cardType: 'metric-audit',
    eyebrow: options.eyebrow || 'Audit',
    title: options.title || 'Work mode audit',
    hint: options.coverage || options.hint,
    ariaLabel: options.coverage || 'Metric audit'
  });

  const bar = create('div');
  bar.className = 'prod-card__stack-bar';
  bar.setAttribute('role', 'img');
  const total = parts.reduce((s, p) => s + (p.pct ?? 0), 0) || 100;
  const summary = parts
    .map((p) => `${p.label} ${p.pct != null ? `${p.pct}%` : 'n/a'}`)
    .join(', ');
  bar.setAttribute('aria-label', summary || 'No classified sessions');

  for (const part of parts) {
    const seg = create('div');
    seg.className = 'prod-card__stack-bar-seg';
    seg.dataset.mode = part.id || part.label;
    const pct = part.pct ?? 0;
    seg.style.flexGrow = String(Math.max(pct, 0));
    seg.style.flexBasis = '0';
    const label = create('span');
    label.className = 'prod-card__stack-bar-label';
    label.textContent = `${part.label} ${pct}%`;
    seg.append(label);
    if (pct <= 0 && total > 0) seg.hidden = true;
    bar.append(seg);
  }
  if (!parts.length) {
    const empty = create('span');
    empty.className = 'prod-card__stack-bar-label';
    empty.textContent = 'No data';
    bar.append(empty);
  }
  card.append(bar);
  void total;
  return card;
}

/** Purpose → … → Next Action hierarchy trace. */
export function createHierarchyTraceCard(root, options = {}) {
  const create = createEl(root);
  const steps = (
    options.steps ?? [
      { label: 'Purpose', value: options.purpose },
      { label: 'Vision', value: options.vision },
      { label: 'Area', value: options.area },
      { label: 'Goal', value: options.goal },
      { label: 'Project', value: options.project },
      { label: 'Next Action', value: options.nextAction }
    ]
  ).filter((s) => s && s.value);

  const card = shell(create, {
    cardType: 'hierarchy-trace',
    eyebrow: options.eyebrow || 'Horizons',
    title: options.title || 'Hierarchy',
    hint: options.hint,
    ariaLabel: `Hierarchy: ${steps.map((s) => s.label).join(' to ')}`
  });

  const list = create('ol');
  list.className = 'prod-card__trace';
  for (const step of steps) {
    const li = create('li');
    li.className = 'prod-card__trace-step';
    const lab = create('span');
    lab.className = 'prod-card__trace-label';
    lab.textContent = step.label;
    const val = create('span');
    val.className = 'prod-card__trace-value';
    val.textContent = String(step.value);
    li.append(lab, val);
    list.append(li);
  }
  if (!steps.length) {
    list.append(Object.assign(create('li'), { textContent: 'No chain linked yet.', className: 'prod-card__meta' }));
  }
  card.append(list);
  return card;
}

/** Focus block ready / running / finished. */
export function createFocusBlockCard(root, options = {}) {
  const create = createEl(root);
  const status = options.status || 'ready';
  const spec = options.spec || {};
  const card = shell(create, {
    cardType: 'focus-block',
    eyebrow: options.eyebrow || 'Focus',
    title: options.title || spec.outcome || 'Focus block',
    hint: options.hint || spec.finish_condition,
    ariaLabel: `Focus block ${status}`
  });
  card.dataset.status = status;

  const meta = create('p');
  meta.className = 'prod-card__meta';
  meta.textContent = [
    status,
    spec.planned_duration_minutes != null ? `${spec.planned_duration_minutes}m` : null,
    spec.depth,
    options.elapsed_minutes != null ? `elapsed ${options.elapsed_minutes}m` : null
  ]
    .filter(Boolean)
    .join(' · ');
  card.append(meta);

  const actions = actionsRow(
    create,
    status === 'ready'
      ? [
          {
            label: 'Start',
            className: 'btn btn--primary',
            onClick: () => options.onStart?.()
          }
        ]
      : status === 'running'
        ? [
            {
              label: 'Done',
              className: 'btn btn--primary',
              onClick: () => options.onFinish?.('done')
            },
            {
              label: 'Partial',
              className: 'btn btn--secondary',
              onClick: () => options.onFinish?.('partial')
            },
            {
              label: 'Stop',
              className: 'btn btn--ghost',
              onClick: () => options.onFinish?.('stopped')
            }
          ]
        : [
            {
              label: 'Finished',
              className: 'btn btn--ghost',
              disabled: true,
              onClick: () => {}
            }
          ]
  );
  card.append(actions);
  return card;
}

export function createWaitingCard(root, options = {}) {
  const create = createEl(root);
  const items = options.items ?? [];
  const card = shell(create, {
    cardType: 'waiting',
    eyebrow: options.eyebrow || 'Waiting',
    title: options.title || 'Waiting for',
    hint: options.hint,
    ariaLabel: `${items.length} waiting item${items.length === 1 ? '' : 's'}`
  });
  const list = create('ul');
  list.className = 'prod-card__list';
  for (const item of items) {
    const li = create('li');
    li.className = 'prod-card__list-item';
    if (item.needs_action) li.classList.add('is-action');
    li.textContent = [
      item.title,
      item.waiting_on ? `on ${item.waiting_on}` : null,
      item.age_days != null ? `${item.age_days}d` : null,
      item.needs_action ? 'follow up due' : null
    ]
      .filter(Boolean)
      .join(' · ');
    list.append(li);
  }
  if (!items.length) list.append(Object.assign(create('li'), { textContent: 'Nothing waiting.', className: 'prod-card__meta' }));
  card.append(list);
  return card;
}

export function createShutdownCard(root, options = {}) {
  const create = createEl(root);
  const items = options.items ?? [];
  const decisions = new Map(items.map((item) => [item.id, item.suggested || 'leave']));
  const card = shell(create, {
    cardType: 'shutdown',
    eyebrow: options.eyebrow || 'Shutdown',
    title: options.title || 'Close the day',
    hint: options.hint || options.note,
    ariaLabel: 'Shutdown checklist'
  });

  const list = create('div');
  list.className = 'prod-card__stack';
  for (const item of items) {
    const row = create('div');
    row.className = 'prod-card__stack-row';
    const label = create('span');
    label.className = 'prod-card__stack-text';
    label.textContent = item.title;
    const select = create('select');
    select.className = 'prod-card__select';
    select.setAttribute('aria-label', `Decision for ${item.title}`);
    for (const d of [
      { id: 'carry', label: 'Carry' },
      { id: 'defer', label: 'Defer' },
      { id: 'close', label: 'Close' },
      { id: 'leave', label: 'Leave' }
    ]) {
      const opt = create('option');
      opt.value = d.id;
      opt.textContent = d.label;
      if (d.id === (item.suggested || 'leave')) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => decisions.set(item.id, select.value));
    row.append(label, select);
    list.append(row);
  }
  card.append(list);
  if (options.tomorrow_first_block) {
    const note = create('p');
    note.className = 'prod-card__meta';
    note.textContent = `Tomorrow first: ${options.tomorrow_first_block.title} at ${options.tomorrow_first_block.start_time}`;
    card.append(note);
  }
  card.append(
    actionsRow(create, [
      {
        label: 'Close day',
        className: 'btn btn--primary',
        onClick: (btn, host) => {
          const payload = items.map((item) => ({
            id: item.id,
            decision: decisions.get(item.id) || 'leave'
          }));
          void runDurableCardAction(card, create, host, {
            action: () => options.onClose?.(payload),
            successText: 'Day closed.',
            controls: card.querySelectorAll('button, input, select')
          });
        }
      }
    ])
  );
  return card;
}

export function createGoodFitsCard(root, options = {}) {
  const create = createEl(root);
  const matches = options.matches ?? [];
  const card = shell(create, {
    cardType: 'good-fits',
    eyebrow: options.eyebrow || 'Now',
    title: options.title || 'Good fits',
    hint: options.hint || options.note,
    ariaLabel: 'Good fits for now'
  });
  const list = create('ul');
  list.className = 'prod-card__list';
  for (const m of matches) {
    const li = create('li');
    li.className = 'prod-card__list-item';
    li.textContent = `${m.title}${m.reason ? ` — ${m.reason}` : ''}`;
    list.append(li);
  }
  if (!matches.length) list.append(Object.assign(create('li'), { textContent: 'No matches for current constraints.', className: 'prod-card__meta' }));
  card.append(list);
  return card;
}

export function createDepthBudgetCard(root, options = {}) {
  const create = createEl(root);
  const budget = options.budget || { available_slots: [], allocations: [], unallocated: 0, note: '' };
  const card = shell(create, {
    cardType: 'depth-budget',
    eyebrow: options.eyebrow || 'Depth',
    title: options.title || 'Deep work budget',
    hint: budget.note || options.hint,
    ariaLabel: budget.note || 'Depth budget'
  });
  const list = create('ul');
  list.className = 'prod-card__list';
  for (const slot of budget.available_slots ?? []) {
    const li = create('li');
    li.className = 'prod-card__list-item';
    li.textContent = `${slot.date} ${slot.start_time} · ${slot.minutes}m · ${
      slot.project_title || 'Unallocated'
    }`;
    list.append(li);
  }
  if (!(budget.available_slots ?? []).length) {
    list.append(Object.assign(create('li'), { textContent: 'No deep windows listed.', className: 'prod-card__meta' }));
  }
  card.append(list);
  return card;
}

export function createActiveProjectsMeter(root, options = {}) {
  const create = createEl(root);
  const meter = options.meter || {
    active_count: 0,
    limit: null,
    status: 'unset',
    message: 'Limit not set.'
  };
  const card = shell(create, {
    cardType: 'active-projects-meter',
    eyebrow: options.eyebrow || 'Portfolio',
    title: options.title || 'Active projects',
    hint: meter.message,
    ariaLabel: meter.message
  });
  const meterEl = create('div');
  meterEl.className = 'prod-card__meter';
  meterEl.dataset.status = meter.status;
  const fill = create('div');
  fill.className = 'prod-card__meter-fill';
  const pct =
    meter.limit != null && meter.limit > 0
      ? Math.min(100, Math.round((meter.active_count / meter.limit) * 100))
      : 0;
  fill.style.width = meter.limit == null ? '0%' : `${pct}%`;
  meterEl.append(fill);
  const label = create('p');
  label.className = 'prod-card__meta';
  label.textContent =
    meter.limit == null
      ? `${meter.active_count} active · Limit not set`
      : `${meter.active_count} of ${meter.limit}`;
  card.append(meterEl, label);
  return card;
}

export function createStrategicReviewCard(root, options = {}) {
  const create = createEl(root);
  const card = shell(create, {
    cardType: 'strategic-review',
    eyebrow: options.eyebrow || 'Strategy',
    title: options.title || 'Strategic review',
    hint: options.hint,
    ariaLabel: options.title || 'Strategic review'
  });
  const list = create('ul');
  list.className = 'prod-card__list';
  for (const line of options.lines ?? []) {
    const li = create('li');
    li.className = 'prod-card__list-item';
    li.textContent = line;
    list.append(li);
  }
  if (!(options.lines ?? []).length) {
    list.append(Object.assign(create('li'), { textContent: 'No strategic notes yet.', className: 'prod-card__meta' }));
  }
  card.append(list);
  return card;
}

export function createProductivityFunnelCard(root, options = {}) {
  const create = createEl(root);
  const funnel = options.funnel || { selected: [], organised: [], scheduled: [], overload_at: null };
  const card = shell(create, {
    cardType: 'productivity-funnel',
    eyebrow: options.eyebrow || 'Funnel',
    title: options.title || 'Selected → Organised → Scheduled',
    hint: funnel.overload_at ? `Pressure at ${funnel.overload_at}` : options.hint,
    ariaLabel: 'Productivity funnel'
  });
  const row = create('div');
  row.className = 'prod-card__funnel';
  for (const key of ['selected', 'organised', 'scheduled']) {
    const col = create('div');
    col.className = 'prod-card__funnel-col';
    if (funnel.overload_at === key) col.classList.add('is-overload');
    const h = create('h3');
    h.className = 'prod-card__funnel-title';
    h.textContent = `${key[0].toUpperCase()}${key.slice(1)} (${funnel[key]?.length ?? 0})`;
    col.append(h);
    const ul = create('ul');
    ul.className = 'prod-card__list';
    for (const item of funnel[key] ?? []) {
      const li = create('li');
      li.textContent = item.title || item.id;
      ul.append(li);
    }
    col.append(ul);
    row.append(col);
  }
  card.append(row);
  return card;
}

export function createAttentionAuditCard(root, options = {}) {
  const create = createEl(root);
  const patterns = options.patterns ?? [];
  const card = shell(create, {
    cardType: 'attention-audit',
    eyebrow: options.eyebrow || 'Attention',
    title: options.title || 'Attention audit',
    hint: options.note || options.hint,
    ariaLabel: options.note || 'Attention audit'
  });
  const list = create('ul');
  list.className = 'prod-card__list';
  for (const p of patterns) {
    const li = create('li');
    li.className = 'prod-card__list-item';
    li.textContent = `${p.pattern} (${p.evidence_count}) — ${p.proposed_protocol}`;
    list.append(li);
  }
  if (!patterns.length) {
    list.append(
      Object.assign(create('li'), {
        textContent: options.note || 'Insufficient evidence.',
        className: 'prod-card__meta'
      })
    );
  }
  card.append(list);
  return card;
}

export function createPlanningStackCard(root, options = {}) {
  const create = createEl(root);
  const stages = options.stages ?? ['purpose', 'desired_outcome', 'brainstorm', 'organise', 'next_action'];
  const current = options.current || stages[0];
  const completed = new Set(options.completed ?? []);
  const card = shell(create, {
    cardType: 'planning-stack',
    eyebrow: options.eyebrow || 'Project plan',
    title: options.title || options.project_title || 'Project planning',
    hint: options.hint,
    ariaLabel: `Project plan: ${current}`
  });
  const list = create('ol');
  list.className = 'prod-card__stages';
  for (const stage of stages) {
    const li = create('li');
    li.className = 'prod-card__stage';
    if (completed.has(stage)) li.classList.add('is-done');
    if (stage === current) li.classList.add('is-current', 'is-open');
    const head = create('span');
    head.className = 'prod-card__stage-head';
    head.textContent = String(stage).replace(/_/g, ' ');
    li.append(head);
    list.append(li);
  }
  card.append(list);
  if (options.detail) {
    const detail = create('p');
    detail.className = 'prod-card__hint';
    detail.textContent = options.detail;
    card.append(detail);
  }
  return card;
}

/** Dispatch helper for structured chat payloads. */
export function createProductivityCard(root, type, options = {}) {
  switch (type) {
    case 'decision-stack':
    case 'clarify-stack':
      return createDecisionStackCard(root, options);
    case 'review-progress':
      return createReviewProgressCard(root, options);
    case 'schedule-diff':
      return createScheduleDiffCard(root, options).card;
    case 'runway':
      return createRunwayCard(root, options);
    case 'metric-audit':
      return createMetricAuditStripCard(root, options);
    case 'hierarchy-trace':
      return createHierarchyTraceCard(root, options);
    case 'focus-block':
      return createFocusBlockCard(root, options);
    case 'waiting':
      return createWaitingCard(root, options);
    case 'shutdown':
      return createShutdownCard(root, options);
    case 'good-fits':
      return createGoodFitsCard(root, options);
    case 'depth-budget':
      return createDepthBudgetCard(root, options);
    case 'active-projects-meter':
      return createActiveProjectsMeter(root, options);
    case 'strategic-review':
      return createStrategicReviewCard(root, options);
    case 'productivity-funnel':
      return createProductivityFunnelCard(root, options);
    case 'attention-audit':
      return createAttentionAuditCard(root, options);
    case 'planning-stack':
      return createPlanningStackCard(root, options);
    default:
      return null;
  }
}
