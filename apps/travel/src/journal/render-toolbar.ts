export interface RenderToolbarOptions {
  title: string;
  onChapter: () => void;
  onAddMoment: () => void;
}

export function renderToolbar(options: RenderToolbarOptions): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'journal-toolbar';
  bar.setAttribute('data-journal-toolbar', '');

  const row = document.createElement('div');
  row.className = 'journal-toolbar__row journal-toolbar__row--primary';

  const title = document.createElement('h2');
  title.className = 'journal-toolbar__title';
  title.textContent = options.title;

  const chapterBtn = document.createElement('button');
  chapterBtn.type = 'button';
  chapterBtn.className = 'btn btn--secondary journal-toolbar__chapter';
  chapterBtn.textContent = 'Chapter';
  chapterBtn.addEventListener('click', options.onChapter);

  row.append(title, chapterBtn);

  const addRow = document.createElement('div');
  addRow.className = 'journal-toolbar__row journal-toolbar__row--add';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--primary journal-toolbar__add';
  addBtn.textContent = 'Add moment';
  addBtn.addEventListener('click', options.onAddMoment);
  addRow.append(addBtn);

  bar.append(row, addRow);
  return bar;
}
