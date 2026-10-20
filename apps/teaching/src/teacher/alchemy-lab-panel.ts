import { alchemyModeLabel, knowledgeHubPageUrl, type AlchemyConnection, type AlchemyMode } from '@/alchemy/connections';
import { knowledgeHubOrigin, runAlchemyLab } from '@/alchemy/client';
import { ApiClientError } from '@/api/client';

export type AlchemyLabHandle = {
  open(prefill: string): void;
  setSelectionText(text: string, hasSelection: boolean): void;
  isOpen(): boolean;
  dispose(): void;
};

export type MountAlchemyLabOptions = {
  onHide?: () => void;
};

const PLACEHOLDER = 'Paste a lesson outline, learning intention, or topic…';

export function mountAlchemyLabPanel(
  host: HTMLElement,
  options: MountAlchemyLabOptions = {}
): AlchemyLabHandle {
  host.classList.add('alchemy-lab');

  const header = document.createElement('header');
  header.className = 'page-header alchemy-lab__header';
  header.innerHTML = `<div class="page-header__copy">
    <p class="eyebrow page-header__eyebrow">Alchemy Lab</p>
    <h1 class="page-header__title">Cross-domain connections</h1>
  </div>`;

  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'btn btn--ghost alchemy-lab__hide';
  hideBtn.textContent = 'Hide';
  hideBtn.setAttribute('aria-label', 'Hide Alchemy Lab');
  hideBtn.addEventListener('click', () => options.onHide?.());
  const actions = document.createElement('div');
  actions.className = 'page-header__actions';
  actions.append(hideBtn);
  header.append(actions);

  const form = document.createElement('form');
  form.className = 'alchemy-lab__form glass-panel';

  const textarea = document.createElement('textarea');
  textarea.id = 'alchemy-lab-input';
  textarea.rows = 8;
  textarea.placeholder = PLACEHOLDER;
  textarea.setAttribute('aria-label', 'Lesson text');

  const useSelection = document.createElement('button');
  useSelection.type = 'button';
  useSelection.className = 'btn btn--ghost alchemy-lab__use-selection';
  useSelection.textContent = 'Use selected block';
  useSelection.disabled = true;

  const findBtn = document.createElement('button');
  findBtn.type = 'submit';
  findBtn.className = 'btn btn--primary';
  findBtn.textContent = 'Find connections';

  const modeLine = document.createElement('p');
  modeLine.className = 'alchemy-lab__mode';

  const errorLine = document.createElement('p');
  errorLine.className = 'alchemy-lab__error';
  errorLine.hidden = true;

  const actionsRow = document.createElement('div');
  actionsRow.className = 'alchemy-lab__actions';
  actionsRow.append(findBtn, modeLine);

  form.append(textarea, useSelection, actionsRow, errorLine);

  const results = document.createElement('div');
  results.className = 'alchemy-lab__results';
  results.setAttribute('aria-live', 'polite');
  results.innerHTML = '<p class="empty">Connections will appear here.</p>';

  host.replaceChildren(header, form, results);

  let busy = false;
  let hasRun = false;
  let selectionText = '';
  let hasSelection = false;
  const origin = knowledgeHubOrigin();

  function syncButtons(): void {
    findBtn.disabled = busy || !textarea.value.trim();
    findBtn.textContent = busy ? 'Finding links…' : 'Find connections';
    useSelection.disabled = !hasSelection;
  }

  function paintCards(connections: AlchemyConnection[]): void {
    if (!connections.length) {
      results.innerHTML = hasRun
        ? '<p class="empty">No archive connections for this text.</p>'
        : '<p class="empty">Connections will appear here.</p>';
      return;
    }
    results.replaceChildren(
      ...connections.map((item) => {
        const card = document.createElement('article');
        card.className = 'alchemy-lab-card glass-panel';
        const icon = document.createElement('p');
        icon.className = 'alchemy-lab-card__icon';
        icon.textContent = item.icon;
        const title = document.createElement('h2');
        title.textContent = item.summary;
        const why = document.createElement('p');
        why.className = 'alchemy-lab-card__why';
        why.textContent = item.whyNonObvious;
        const excerpt = document.createElement('p');
        excerpt.className = 'alchemy-lab-card__excerpt';
        excerpt.textContent = item.sourceExcerpt;
        const link = document.createElement('a');
        link.className = 'btn btn--ghost';
        link.href = knowledgeHubPageUrl(origin, item.sourcePageId);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `Open “${item.sourcePageTitle || item.sourcePageId}”`;
        card.append(icon, title, why, excerpt, link);
        return card;
      })
    );
  }

  useSelection.addEventListener('click', () => {
    textarea.value = selectionText;
    syncButtons();
    textarea.focus();
  });

  textarea.addEventListener('input', syncButtons);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const lessonText = textarea.value.trim();
    if (!lessonText || busy) return;
    busy = true;
    errorLine.hidden = true;
    errorLine.textContent = '';
    syncButtons();
    void runAlchemyLab(lessonText)
      .then((result) => {
        hasRun = true;
        modeLine.textContent = alchemyModeLabel(result.mode as AlchemyMode);
        paintCards(result.connections);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiClientError && error.code === 'unauthorized') {
          errorLine.textContent = 'Your session expired. Sign in again to keep using Alchemy Lab.';
        } else {
          const message =
            error instanceof Error && error.message.trim()
              ? error.message.replace(/[.!?]?$/, '.')
              : "Alchemy Lab couldn't reach the archive.";
          errorLine.textContent = `${message} You can try again.`;
        }
        errorLine.hidden = false;
      })
      .finally(() => {
        busy = false;
        syncButtons();
      });
  });

  syncButtons();

  return {
    open(prefill: string) {
      textarea.value = prefill;
      syncButtons();
      textarea.focus();
    },
    setSelectionText(text: string, selected: boolean) {
      selectionText = text;
      hasSelection = selected;
      syncButtons();
    },
    isOpen() {
      return !host.hidden;
    },
    dispose() {
      host.replaceChildren();
    }
  };
}
