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

export function renderSurfaceWidgets(root, widgetsState) {
  const rail = root.querySelector('#fitness-surface-widgets-rail');
  const status = root.querySelector('#fitness-surface-widgets-status');
  const section = root.querySelector('#fitness-surface-widgets');
  if (!rail || !section) return;

  const state = widgetsState ?? { status: 'idle', widgets: [] };
  if (status) {
    if (state.status === 'loading') status.textContent = 'Loading widgets…';
    else if (state.status === 'error') status.textContent = 'Widgets unavailable right now.';
    else status.textContent = '';
  }

  rail.replaceChildren();
  if (state.status !== 'ready' || !Array.isArray(state.widgets) || state.widgets.length === 0) {
    section.hidden = state.status === 'ready';
    return;
  }

  section.hidden = false;
  for (const widget of state.widgets) {
    if (widget.template_id === 'challenge-progress') {
      rail.append(renderChallengeProgressCard(root, widget));
    }
  }

  if (!rail.children.length) section.hidden = true;
}
