import { bindDismissableMenu } from '@/journal/menu-dismiss';
export interface RenderToolbarOptions {
  title: string;
  onChapter: () => void;
  onImportPhotos?: () => void;
  onSearchJournal?: () => void;
  onSouvenirs?: () => void;
  onExportJournal?: () => void;
  onPrintJournal?: () => void;
  onShareJournal?: () => void;
  onAddMoment?: () => void;
  onTrash?: () => void;
  showPartnerPerspective?: boolean;
  onTogglePartnerPerspective?: (next: boolean) => void;
  hasPartnerMoments?: boolean;
}

export function renderToolbar(options: RenderToolbarOptions): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'journal-toolbar';
  bar.setAttribute('data-journal-toolbar', '');

  const row = document.createElement('div');
  row.className = 'journal-toolbar__row journal-toolbar__row--primary';

  const title = document.createElement('h1');
  title.className = 'journal-toolbar__title';
  title.textContent = options.title;

  const actions = document.createElement('div');
  actions.className = 'journal-toolbar__actions';

  const chapterBtn = document.createElement('button');
  chapterBtn.type = 'button';
  chapterBtn.className = 'btn btn--secondary journal-toolbar__chapter';
  chapterBtn.textContent = 'Chapter';
  chapterBtn.addEventListener('click', options.onChapter);

  const moreWrap = document.createElement('div');
  moreWrap.className = 'journal-toolbar__more-wrap';
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'btn btn--secondary journal-toolbar__more';
  moreBtn.textContent = 'More';
  moreBtn.setAttribute('aria-haspopup', 'menu');
  const menu = document.createElement('div');
  menu.className = 'journal-toolbar__more-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  const menuItems: { label: string; action?: () => void; disabled?: boolean }[] = [
    { label: 'Import photos', action: options.onImportPhotos, disabled: !options.onImportPhotos },
    { label: 'Search journal', action: options.onSearchJournal, disabled: !options.onSearchJournal },
    { label: 'Souvenirs', action: options.onSouvenirs, disabled: !options.onSouvenirs },
    { label: 'Print', action: options.onPrintJournal, disabled: !options.onPrintJournal },
    { label: 'Export', action: options.onExportJournal, disabled: !options.onExportJournal },
    { label: 'Share', action: options.onShareJournal, disabled: !options.onShareJournal },
    { label: 'Trash', action: options.onTrash, disabled: !options.onTrash },
  ];

  for (const item of menuItems) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'journal-toolbar__more-item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = item.label;
    btn.disabled = Boolean(item.disabled);
    if (item.action) {
      btn.addEventListener('click', () => {
        moreMenu.close();
        item.action?.();
      });
    }
    menu.append(btn);
  }

  const moreMenu = bindDismissableMenu(moreBtn, menu);

  moreWrap.append(moreBtn, menu);
  actions.append(chapterBtn, moreWrap);
  row.append(title, actions);

  const addRow = document.createElement('div');
  addRow.className = 'journal-toolbar__row journal-toolbar__row--add';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--primary journal-toolbar__add';
  addBtn.textContent = 'Add moment';
  addBtn.disabled = !options.onAddMoment;
  addBtn.setAttribute('aria-label', 'Add moment');
  if (options.onAddMoment) {
    addBtn.addEventListener('click', options.onAddMoment);
  }
  addRow.append(addBtn);

  if (options.hasPartnerMoments && options.onTogglePartnerPerspective) {
    const partnerToggle = document.createElement('button');
    partnerToggle.type = 'button';
    partnerToggle.className = 'btn btn--secondary journal-toolbar__partner-toggle';
    const visible = options.showPartnerPerspective !== false;
    partnerToggle.setAttribute('aria-pressed', visible ? 'true' : 'false');
    partnerToggle.textContent = visible ? "Hide Partner's lines" : "Show Partner's lines";
    partnerToggle.addEventListener('click', () => {
      const next = partnerToggle.getAttribute('aria-pressed') !== 'true';
      partnerToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
      partnerToggle.textContent = next ? "Hide Partner's lines" : "Show Partner's lines";
      options.onTogglePartnerPerspective?.(next);
    });
    addRow.append(partnerToggle);
  }

  bar.append(row, addRow);
  return bar;
}
