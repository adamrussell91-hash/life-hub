function clampProgress(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function createElement(root, name) {
  if (typeof root.createElement === 'function') return root.createElement(name);
  const doc = root.ownerDocument ?? globalThis.document;
  return doc.createElement(name);
}

function renderChallengeProgressCard(root, widget) {
  const card = createElement(root, 'article');
  card.className = 'surface-widget-card surface-widget-card--challenge';

  const title = createElement(root, 'h3');
  title.className = 'surface-widget-card__title';
  title.textContent = widget.props?.title ?? widget.title ?? 'Challenge';

  const track = createElement(root, 'div');
  const pct = clampProgress(widget.props?.progress_pct);
  track.className = 'progress-track progress-track--marine surface-widget-card__progress';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', `${title.textContent} progress`);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(pct));
  track.style = track.style ?? {};
  if (typeof track.style.setProperty === 'function') {
    track.style.setProperty('--progress', `${pct}%`);
  } else {
    track.style['--progress'] = `${pct}%`;
  }
  const fill = createElement(root, 'span');
  track.append(fill);

  card.append(title, track);

  const subtitle = widget.props?.subtitle;
  if (typeof subtitle === 'string' && subtitle.trim()) {
    const caption = createElement(root, 'p');
    caption.className = 'metric-caption surface-widget-card__subtitle';
    caption.textContent = subtitle.trim();
    card.append(caption);
  }

  return card;
}

function renderMealPlanWeekCard(root, widget) {
  const card = createElement(root, 'article');
  card.className = 'surface-widget-card surface-widget-card--meal-plan';

  const title = createElement(root, 'h3');
  title.className = 'surface-widget-card__title';
  title.textContent = widget.props?.title ?? widget.title ?? 'Meal plan';
  card.append(title);

  const list = createElement(root, 'ul');
  list.className = 'surface-widget-meal-plan';
  for (const day of widget.props?.days ?? []) {
    const item = createElement(root, 'li');
    item.className = 'surface-widget-meal-plan__day';
    const label = createElement(root, 'span');
    label.className = 'surface-widget-meal-plan__label';
    label.textContent = day.label ?? day.key ?? '';
    const text = createElement(root, 'span');
    text.className = 'surface-widget-meal-plan__text';
    text.textContent = day.text ?? '';
    item.append(label, text);
    list.append(item);
  }
  if (list.children.length) card.append(list);

  const notes = widget.props?.notes;
  if (typeof notes === 'string' && notes.trim()) {
    const caption = createElement(root, 'p');
    caption.className = 'metric-caption surface-widget-card__subtitle';
    caption.textContent = notes.trim();
    card.append(caption);
  }

  return card;
}

function filterWidgets(widgets, templateId) {
  if (!Array.isArray(widgets)) return [];
  return widgets.filter(widget => widget.template_id === templateId);
}

function renderWidgetRail(root, { sectionId, railId, statusId, widgetsState, templateId, renderCard }) {
  const rail = root.querySelector(railId);
  const status = root.querySelector(statusId);
  const section = root.querySelector(sectionId);
  if (!rail || !section) return;

  const state = widgetsState ?? { status: 'idle', widgets: [] };
  if (status) {
    if (state.status === 'loading') status.textContent = 'Loading widgets…';
    else if (state.status === 'error') status.textContent = 'Widgets unavailable right now.';
    else status.textContent = '';
  }

  rail.replaceChildren();
  const widgets = filterWidgets(state.widgets, templateId);
  if (state.status !== 'ready' || widgets.length === 0) {
    section.hidden = state.status === 'ready';
    return;
  }

  section.hidden = false;
  for (const widget of widgets) {
    rail.append(renderCard(root, widget));
  }

  if (!rail.children.length) section.hidden = true;
}

export function renderFitnessSurfaceWidgets(root, widgetsState) {
  renderWidgetRail(root, {
    sectionId: '#fitness-surface-widgets',
    railId: '#fitness-surface-widgets-rail',
    statusId: '#fitness-surface-widgets-status',
    widgetsState,
    templateId: 'challenge-progress',
    renderCard: renderChallengeProgressCard
  });
}

export function renderNutritionSurfaceWidgets(root, widgetsState) {
  renderWidgetRail(root, {
    sectionId: '#nutrition-surface-widgets',
    railId: '#nutrition-surface-widgets-rail',
    statusId: '#nutrition-surface-widgets-status',
    widgetsState,
    templateId: 'meal-plan-week',
    renderCard: renderMealPlanWeekCard
  });
}

/** @deprecated alias — fitness section */
export function renderSurfaceWidgets(root, widgetsState) {
  renderFitnessSurfaceWidgets(root, widgetsState);
}
