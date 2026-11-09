import { createFragrancePhoto, FRAGRANCE_PHOTOS } from './fragrance-photos.js';
import { FRAGRANCES, SOURCE_FRAGRANCES, STYLE_NOTE } from './fragrance-library.js';
import { formatDisplayDate } from '../../../../../packages/design-kit/js/format-display-date.js';

const FIELDS = [
  ['Brand', 'Brand'], ['Perfumer', 'Perfumer'], ['Status', 'Status'], ['Type', 'Concentration'],
  ['Size', 'Size'], ['Price (AUD)', 'Price (AUD)'], ['Rating', 'Rating / 10'], ['Compliments', 'Recorded compliments'],
  ['Season', 'Seasons'], ['Time of Day', 'Time of day'], ['Occasion', 'Occasions'],
  ['Longevity', 'Longevity'], ['Sillage', 'Sillage'],
  ['Top Notes', 'Top notes'], ['Heart Notes', 'Heart notes'], ['Base Notes', 'Base notes'],
  ['date:Date Acquired:start', 'Date acquired'], ['Added', 'Added'], ['Image', 'Images'],
  ['Parfumo URL', 'Parfumo / product link']
];

const STATUS_ORDER = ['Owned', 'Sampling', 'Wishlist', 'Retired'];
const SORTS = [
  ['name', 'Name A–Z'],
  ['rating', 'Rating, highest first'],
  ['added', 'Newest first'],
  ['brand', 'Brand A–Z'],
  ['status', 'Status']
];
const NOTE_MAX = 4000;

/** Library view state survives re-renders within the page. */
const views = new WeakMap();
function viewFor(doc) {
  if (!views.has(doc)) views.set(doc, { filter: 'all', sort: 'name', notes: {}, notesStatus: 'idle', render: null });
  return views.get(doc);
}

/** Open one library record, clearing a filter that hides it. */
export function revealLibraryRecord(doc, id) {
  const view = viewFor(doc);
  let record = doc.querySelector(`#aes-library [data-fragrance-id="${id}"]`);
  if (!record && view.render) {
    view.filter = 'all';
    view.render();
    record = doc.querySelector(`#aes-library [data-fragrance-id="${id}"]`);
  }
  return record;
}

/**
 * Render the complete imported material with native disclosures and safe text nodes.
 * `notesApi` ({ load, save }) adds a personal note box to each record; without it the box is hidden.
 */
export function renderSourceReference(doc, { notesApi = null } = {}) {
  const view = viewFor(doc);
  const el = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function link(label, value) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) return doc.createTextNode(label);
      const a = el('a', label);
      a.href = url.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return a;
    } catch { return doc.createTextNode(label); }
  }
  // Source Markdown uses bold, links, citation anchors, headings and nested lists.
  // Never interpret imported HTML. Only the source's <br> notation becomes a break.
  function inline(host, text) {
    const pattern = /\*\*([^*]+)\*\*|\[\^(https?:\/\/[^\]]+)\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|<br\s*\/?>/g;
    let end = 0;
    for (const m of String(text).matchAll(pattern)) {
      host.append(doc.createTextNode(text.slice(end, m.index).replace(/\\([\\$\[\]~>])/g, '$1')));
      if (m[1]) host.append(el('strong', m[1]));
      else if (m[2]) host.append(link('Source', m[2]));
      else if (m[3]) host.append(link(m[3], m[4]));
      else host.append(el('br'));
      end = m.index + m[0].length;
    }
    host.append(doc.createTextNode(String(text).slice(end).replace(/\\([\\$\[\]~>])/g, '$1')));
  }
  function markdown(host, text) {
    let lists = [];
    for (const line of String(text).split('\n')) {
      if (!line.trim() || line.trim() === '<empty-block/>') { lists = []; continue; }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (heading) {
        lists = [];
        const node = el('h4');
        inline(node, heading[2]);
        host.append(node);
        continue;
      }
      const item = /^(\s*)-\s+(.+)$/.exec(line);
      if (item) {
        const depth = item[1].replace(/\t/g, '    ').length;
        while (lists.length && lists.at(-1).depth > depth) lists.pop();
        if (!lists.length || lists.at(-1).depth < depth) {
          const list = el('ul');
          (lists.at(-1)?.last ?? host).append(list);
          lists.push({ depth, list, last: null });
        }
        const li = el('li');
        inline(li, item[2]);
        lists.at(-1).list.append(li);
        lists.at(-1).last = li;
      } else {
        lists = [];
        const p = el('p');
        inline(p, line.trim());
        host.append(p);
      }
    }
  }
  function fieldValue(record, key) {
    const p = record.properties;
    const value = p[key];
    const node = el('dd');
    node.dataset.sourceField = key;
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) {
      node.textContent = 'Not recorded';
    } else if (key === 'Price (AUD)') {
      node.textContent = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
    } else if (key === 'Added' || key === 'date:Date Acquired:start') {
      node.textContent = formatDisplayDate(value);
      if (key === 'date:Date Acquired:start' && p['date:Date Acquired:end']) node.append(` – ${formatDisplayDate(p['date:Date Acquired:end'])}`);
      node.title = String(value);
    } else if (key === 'Parfumo URL') {
      node.append(link('Open fragrance reference', value));
    } else {
      inline(node, Array.isArray(value) ? value.join(', ') : String(value));
    }
    return node;
  }
  const library = doc.querySelector('#aes-library');
  const meta = new Map(FRAGRANCES.map(f => [f.id, f]));
  const name = record => record.properties.Fragrance;
  const brand = record => String(record.properties.Brand ?? '').replace(/\\([\[\]])/g, '$1');
  const filters = () => {
    const statuses = [...new Set(SOURCE_FRAGRANCES.map(r => r.properties.Status).filter(Boolean))]
      .sort((a, b) => (STATUS_ORDER.indexOf(a) + 1 || 99) - (STATUS_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
    return [
      ['all', 'All', () => true],
      ...statuses.map(st => [`status:${st}`, st, r => r.properties.Status === st]),
      ['loved', 'Loved', r => meta.get(r.id)?.loved === true],
      ['hated', 'Not for me', r => meta.get(r.id)?.hated === true],
      ['noted', 'With my notes', r => Boolean(view.notes[r.id]?.text)]
    ];
  };
  const comparators = {
    name: (a, b) => name(a).localeCompare(name(b)),
    brand: (a, b) => brand(a).localeCompare(brand(b)) || name(a).localeCompare(name(b)),
    rating: (a, b) => (b.properties.Rating ?? -1) - (a.properties.Rating ?? -1) || name(a).localeCompare(name(b)),
    added: (a, b) => String(b.properties.Added ?? '').localeCompare(String(a.properties.Added ?? '')) || name(a).localeCompare(name(b)),
    status: (a, b) => ((STATUS_ORDER.indexOf(a.properties.Status) + 1 || 99) - (STATUS_ORDER.indexOf(b.properties.Status) + 1 || 99)) || name(a).localeCompare(name(b))
  };

  function noteBox(record) {
    const box = el('div', null, 'aes-note');
    box.dataset.noteFor = record.id;
    const id = `aes-note-${record.id}`;
    const label = el('label', 'My notes', 'aes-note__label');
    label.htmlFor = id;
    const area = el('textarea', null, 'aes-input aes-note__text');
    area.id = id;
    area.rows = 3;
    area.maxLength = NOTE_MAX;
    area.placeholder = 'How it wore, who noticed, what to layer it with…';
    area.value = view.notes[record.id]?.text ?? '';
    const save = el('button', 'Save note', 'aes-btn');
    save.type = 'button';
    const status = el('span', null, 'aes-meta aes-note__status');
    status.setAttribute('aria-live', 'polite');
    const stamp = () => {
      const at = view.notes[record.id]?.updatedAt;
      status.textContent = at ? `Saved ${formatDisplayDate(at)}` : '';
    };
    stamp();
    const sync = () => { save.disabled = area.value.trim() === (view.notes[record.id]?.text ?? ''); };
    sync();
    area.addEventListener('input', () => { area.dataset.dirty = 'true'; sync(); if (status.dataset.state !== 'saving') status.textContent = ''; });
    save.addEventListener('click', async () => {
      save.disabled = true;
      status.dataset.state = 'saving';
      status.textContent = 'Saving…';
      try {
        const note = await notesApi.save(record.id, area.value);
        if (note) view.notes[record.id] = note; else delete view.notes[record.id];
        delete area.dataset.dirty;
        area.value = note?.text ?? '';
        delete status.dataset.state;
        stamp();
        if (!note) status.textContent = 'Note cleared';
        renderControls();
      } catch (error) {
        delete status.dataset.state;
        status.textContent = error?.code === 'write_conflict' ? 'Changed elsewhere. Save again.' : 'Couldn’t save. Try again.';
      }
      sync();
    });
    const row = el('div', null, 'aes-note__row');
    row.append(save, status);
    box.append(label, area, row);
    return box;
  }

  function recordNode(record) {
    const p = record.properties;
    const details = el('details', null, 'aes-record');
    details.dataset.fragranceId = record.id;
    const summary = el('summary');
    summary.className = 'aes-record__summary';
    const label = el('span', null, 'aes-record__label');
    const flags = [meta.get(record.id)?.loved ? 'loved' : null, meta.get(record.id)?.hated ? 'not for me' : null, view.notes[record.id]?.text ? 'noted' : null].filter(Boolean);
    label.append(el('strong', p.Fragrance), el('span', [brand(record), p.Status, ...flags].filter(Boolean).join(' · '), 'aes-meta'));
    summary.append(createFragrancePhoto(doc, p.Fragrance, { width: 48 }), label);
    const body = el('div', null, 'aes-record__body');
    const fields = el('dl', null, 'aes-record__fields');
    for (const [key, label] of FIELDS) fields.append(el('dt', label), fieldValue(record, key));
    const photo = el('div', null, 'aes-record__photo');
    photo.append(createFragrancePhoto(doc, p.Fragrance, { width: 160 }));
    const source = Object.hasOwn(FRAGRANCE_PHOTOS, p.Fragrance) && FRAGRANCE_PHOTOS[p.Fragrance].source;
    if (source) photo.append(link('Photo source', source));
    body.append(photo);
    if (notesApi) body.append(noteBox(record));
    body.append(fields, el('h4', 'Full review'));
    const review = el('div', null, 'aes-source-prose');
    review.dataset.sourceField = 'Review';
    markdown(review, p.Review || 'Not recorded');
    body.append(review);
    if (record.content) {
      body.append(el('h4', 'Page notes'));
      const notes = el('div', null, 'aes-source-prose');
      markdown(notes, record.content);
      body.append(notes);
    }
    const provenance = el('p', null, 'aes-meta');
    provenance.textContent = `Last edited ${formatDisplayDate(record.lastEditedAt)}`;
    provenance.title = record.lastEditedAt;
    body.append(provenance);
    details.append(summary, body);
    return details;
  }

  function renderControls() {
    const host = doc.querySelector('#aes-library-controls');
    if (!host) return;
    const all = filters();
    if (!all.some(([key]) => key === view.filter)) view.filter = 'all';
    const pills = el('div', null, 'hub-pills hub-pills--loose aes-chips');
    pills.setAttribute('role', 'group');
    pills.setAttribute('aria-label', 'Show');
    for (const [key, text, test] of all) {
      const count = SOURCE_FRAGRANCES.filter(test).length;
      if (key === 'noted' && !notesApi) continue;
      if (!count && key !== 'all' && key !== view.filter) continue;
      const b = el('button', `${text} ${count}`, 'hub-pills__btn');
      b.type = 'button';
      b.dataset.libraryFilter = key;
      b.setAttribute('aria-pressed', String(view.filter === key));
      b.addEventListener('click', () => { view.filter = key; renderLibrary(); });
      pills.append(b);
    }
    const sortLabel = el('label', null, 'aes-library__sort');
    sortLabel.append(el('span', 'Sort', 'aes-meta'));
    const select = el('select', null, 'aes-input');
    select.id = 'aes-library-sort';
    for (const [value, text] of SORTS) {
      const o = el('option', text);
      o.value = value;
      select.append(o);
    }
    select.value = view.sort;
    select.addEventListener('change', () => { view.sort = select.value; renderLibrary(); });
    sortLabel.append(select);
    host.replaceChildren(pills, sortLabel);
  }

  function renderLibrary() {
    if (!library) return;
    renderControls();
    const test = filters().find(([key]) => key === view.filter)?.[2] ?? (() => true);
    const shown = SOURCE_FRAGRANCES.filter(test).sort(comparators[view.sort] ?? comparators.name);
    const open = new Set([...library.querySelectorAll('details[open]')].map(d => d.dataset.fragranceId));
    const nodes = shown.map(record => {
      const node = recordNode(record);
      if (open.has(record.id)) node.open = true;
      return node;
    });
    library.replaceChildren(...(nodes.length ? nodes : [el('p', 'Nothing here yet.', 'aes-meta')]));
    const count = doc.querySelector('#aes-library-count');
    if (count) count.textContent = shown.length === SOURCE_FRAGRANCES.length
      ? `All ${SOURCE_FRAGRANCES.length} records, with full reviews, recorded note pyramids, prices, dates and page notes. Unset fields show “Not recorded”.`
      : `Showing ${shown.length} of ${SOURCE_FRAGRANCES.length} records.`;
  }

  view.render = renderLibrary;
  renderLibrary();
  if (library && notesApi && view.notesStatus === 'idle') {
    view.notesStatus = 'loading';
    notesApi.load().then(notes => {
      view.notes = notes ?? {};
      view.notesStatus = 'ready';
      // Fill boxes the user hasn't started typing in; keep everything else as it is.
      for (const box of library.querySelectorAll('[data-note-for]')) {
        const area = box.querySelector('textarea');
        if (area.dataset.dirty) continue;
        box.replaceWith(noteBox({ id: box.dataset.noteFor }));
      }
      renderControls();
      for (const details of library.querySelectorAll('details[data-fragrance-id]')) {
        const record = SOURCE_FRAGRANCES.find(r => r.id === details.dataset.fragranceId);
        const line = details.querySelector('.aes-record__label .aes-meta');
        if (record && line) line.textContent = [brand(record), record.properties.Status, meta.get(record.id)?.loved ? 'loved' : null, meta.get(record.id)?.hated ? 'not for me' : null, view.notes[record.id]?.text ? 'noted' : null].filter(Boolean).join(' · ');
      }
    }, () => { view.notesStatus = 'idle'; });
  }
  const style = doc.querySelector('#aes-style-notes');
  if (style && !STYLE_NOTE) {
    style.replaceChildren(el('p', 'Style notes aren’t available right now.', 'aes-meta'));
  } else if (style) {
    const source = el('p', null, 'aes-meta');
    source.textContent = formatDisplayDate(STYLE_NOTE.date);
    style.replaceChildren(source);
    for (const section of String(STYLE_NOTE.summary ?? '').split(/(?=^### )/m).filter(s => s.trim())) {
      const [heading, ...lines] = section.split('\n');
      const details = el('details', null, 'aes-record');
      details.dataset.styleSection = heading.replace(/^### /, '');
      details.open = true;
      details.append(el('summary', heading.replace(/^### /, '')));
      const body = el('div', null, 'aes-source-prose aes-record__body');
      markdown(body, lines.join('\n'));
      details.append(body);
      style.append(details);
    }
    if (STYLE_NOTE.notes && STYLE_NOTE.notes !== '<empty-block/>') {
      const notes = el('div', null, 'aes-source-prose');
      markdown(notes, STYLE_NOTE.notes);
      style.append(notes);
    }
    const transcript = el('details', null, 'aes-record');
    transcript.append(el('summary', 'Full transcript'));
    const body = el('div', null, 'aes-source-prose aes-record__body');
    body.append(el('p', 'Original transcript wording, including incomplete phrases.', 'aes-meta'));
    markdown(body, STYLE_NOTE.transcript ?? '');
    transcript.append(body);
    style.append(transcript);
  }
}
