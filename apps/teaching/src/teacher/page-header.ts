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
      const title = document.createElement('h1');
      title.className = 'page-header__title';
      title.textContent = config.title;
      copy.append(title);
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

  if (config.actions && config.actions.length > 0) {
    const actions = document.createElement('div');
    actions.className = 'page-header__actions';
    actions.append(...config.actions);
    header.append(actions);
  }

  host.prepend(header);
  return header;
}
