import { appendHubUtilitiesToActions } from '@/teacher/hub-utilities';

export interface PageHeaderConfig {
  eyebrow?: string;
  title?: string;
  supporting?: string;
  actions?: HTMLElement[];
}

export function renderPageHeader(host: HTMLElement, config: PageHeaderConfig): HTMLElement {
  const header = document.createElement('header');
  header.className = 'page-header';

  const hasCopy = Boolean(config.eyebrow || config.title || config.supporting);
  if (hasCopy) {
    const copy = document.createElement('div');
    copy.className = 'page-header__copy';

    if (config.eyebrow) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'page-header__eyebrow';
      eyebrow.textContent = config.eyebrow;
      copy.append(eyebrow);
    }

    if (config.title) {
      const titleRow = document.createElement('div');
      titleRow.className = 'page-header__title-row';

      const title = document.createElement('h1');
      title.className = 'page-header__title hub-kinetic';
      title.textContent = config.title;
      titleRow.append(title);
      copy.append(titleRow);
    }

    if (config.supporting) {
      const supporting = document.createElement('p');
      supporting.className = 'page-header__supporting';
      supporting.textContent = config.supporting;
      copy.append(supporting);
    }

    header.append(copy);
  } else {
    header.classList.add('page-header--actions-only');
  }

  const actions = document.createElement('div');
  actions.className = 'page-header__actions';
  if (config.actions && config.actions.length > 0) {
    actions.append(...config.actions);
  }
  appendHubUtilitiesToActions(actions);
  if (actions.childElementCount > 0) {
    header.append(actions);
  }

  host.prepend(header);
  return header;
}

/** Actions-only header for pages without copy (e.g. home dashboard chrome). */
export function renderPageHeaderUtilities(host: HTMLElement): HTMLElement | null {
  const header = document.createElement('header');
  header.className = 'page-header page-header--actions-only';
  const actions = document.createElement('div');
  actions.className = 'page-header__actions';
  appendHubUtilitiesToActions(actions);
  if (actions.childElementCount === 0) return null;
  header.append(actions);
  host.prepend(header);
  return header;
}
