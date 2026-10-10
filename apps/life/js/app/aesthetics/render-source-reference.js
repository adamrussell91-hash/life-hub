import { createFragrancePhoto, FRAGRANCE_PHOTOS } from './fragrance-photos.js';
import { SOURCE_FRAGRANCES, STYLE_NOTE } from './notion-aesthetics-source.js';
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

/** Render the complete imported material with native disclosures and safe text nodes. */
export function renderSourceReference(doc) {
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
  if (library) {
    const sorted = [...SOURCE_FRAGRANCES].sort((a, b) => a.properties.Fragrance.localeCompare(b.properties.Fragrance));
    library.replaceChildren(...sorted.map(record => {
      const p = record.properties;
      const details = el('details', null, 'aes-record');
      details.dataset.fragranceId = record.id;
      const summary = el('summary');
      summary.className = 'aes-record__summary';
      const label = el('span', null, 'aes-record__label');
      label.append(el('strong', p.Fragrance), el('span', `${p.Brand.replace(/\\([\[\]])/g, '$1')} · ${p.Status}`, 'aes-meta'));
      summary.append(createFragrancePhoto(doc, p.Fragrance, { width: 48 }), label);
      const body = el('div', null, 'aes-record__body');
      const fields = el('dl', null, 'aes-record__fields');
      for (const [key, label] of FIELDS) fields.append(el('dt', label), fieldValue(record, key));
      const photo = el('div', null, 'aes-record__photo');
      photo.append(createFragrancePhoto(doc, p.Fragrance, { width: 160 }));
      const source = Object.hasOwn(FRAGRANCE_PHOTOS, p.Fragrance) && FRAGRANCE_PHOTOS[p.Fragrance].source;
      if (source) photo.append(link('Photo source', source));
      body.append(photo, fields, el('h4', 'Full review'));
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
    }));
  }
  const style = doc.querySelector('#aes-style-notes');
  if (style) {
    const source = el('p', null, 'aes-meta');
    source.textContent = formatDisplayDate(STYLE_NOTE.date);
    style.replaceChildren(source);
    for (const section of STYLE_NOTE.summary.split(/(?=^### )/m).filter(s => s.trim())) {
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
    markdown(body, STYLE_NOTE.transcript);
    transcript.append(body);
    style.append(transcript);
  }
}
