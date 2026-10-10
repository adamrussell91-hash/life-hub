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
  showCoreyPerspective?: boolean;
  onToggleCoreyPerspective?: (next: boolean) => void;
  hasCoreyMoments?: boolean;
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
  moreBtn.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'journal-toolbar__more-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  const menuItems: { label: string; action?: () => void; disabled?: boolean }[] = [
    { label: 'Import photos', action: options.onImportPhotos, disabled: !options.onImportPhotos },
    { label: 'Search journal', action: options.onSearchJournal, disabled: !options.onSearchJournal },
    { label: 'Souvenirs', action: options.onSouvenirs, disabled: !options.onSouvenirs },
    { label: 'Pattern appearance', disabled: true },
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
    btn.textContent = item.disabled ? `${item.label} — Coming soon` : item.label;
    btn.disabled = Boolean(item.disabled);
    if (item.action) {
      btn.addEventListener('click', () => {
        menu.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
        item.action?.();
      });
    }
    menu.append(btn);
  }

  moreBtn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

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

  if (options.hasCoreyMoments && options.onToggleCoreyPerspective) {
    const coreyToggle = document.createElement('button');
    coreyToggle.type = 'button';
    coreyToggle.className = 'btn btn--secondary journal-toolbar__corey-toggle';
    const visible = options.showCoreyPerspective !== false;
    coreyToggle.setAttribute('aria-pressed', visible ? 'true' : 'false');
    coreyToggle.textContent = visible ? "Hide Corey's lines" : "Show Corey's lines";
    coreyToggle.addEventListener('click', () => {
      const next = coreyToggle.getAttribute('aria-pressed') !== 'true';
      coreyToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
      coreyToggle.textContent = next ? "Hide Corey's lines" : "Show Corey's lines";
      options.onToggleCoreyPerspective?.(next);
    });
    addRow.append(coreyToggle);
  }

  bar.append(row, addRow);
  return bar;
}
