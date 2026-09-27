const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(markdown) {
  let html = escapeHtml(markdown);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function pageBodyLines(markdown) {
  const lines = String(markdown).replace(/\r/g, '').split('\n');
  if (/^#\s+/.test(lines[0] ?? '')) lines.shift();
  while (/^[A-Za-z][^:]{0,80}:\s/.test(lines[0] ?? '')) lines.shift();
  while (!lines[0]?.trim()) lines.shift();
  return lines;
}

export function markdownToBlocks(markdown = '') {
  const blocks = [{ id: 'notion_0', block_type: 'rich_text', variant: 'medium', content: { html: '<p><em>Imported from Notion</em></p>' } }];
  const todos = []; let heading = ''; let nextId = 1; let html = [];
  const flush = () => { if (html.length) { blocks.push({ id: `notion_${nextId++}`, block_type: 'rich_text', variant: 'medium', content: { html: html.join('') } }); html = []; } };
  const lines = pageBodyLines(markdown);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]; const title = raw.match(/^(#{1,3})\s+(.+)$/);
    if (title) { flush(); heading = title[2].trim(); blocks.push({ id: `notion_${nextId++}`, block_type: 'heading', variant: 'section', content: { text: heading } }); continue; }
    const todo = raw.match(/^- \[([ xX])\]\s+(.+)$/);
    if (todo) { const text = todo[2].trim(); todos.push({ text, checked: todo[1].toLowerCase() === 'x', heading }); html.push(`<p>${todo[1].toLowerCase() === 'x' ? '☑' : '☐'} ${inline(text)}</p>`); continue; }
    const list = raw.match(/^\s*([-*+] |\d+\. )(.+)$/);
    if (list) { const ordered = /^\d+\. /.test(list[1]); const items = [inline(list[2])]; while (index + 1 < lines.length) { const next = lines[index + 1].match(/^\s*([-*+] |\d+\. )(.+)$/); if (!next || /^\d+\. /.test(next[1]) !== ordered || /^- \[[ xX]\]/.test(lines[index + 1])) break; items.push(inline(next[2])); index += 1; } html.push(`<${ordered ? 'ol' : 'ul'}>${items.map((item) => `<li>${item}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue; }
    const image = raw.match(/^!\[[^\]]*\]\(([^)]+)\)$/); const attachment = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (image || (attachment && !/^https?:\/\//i.test(attachment[2]))) { const filename = (image?.[1] ?? attachment?.[1] ?? '').split('/').pop(); html.push(`<p>[Attachment kept in Notion: ${escapeHtml(filename)}]</p>`); continue; }
    const aside = raw.match(/^<aside>(.*?)<\/aside>$/i); if (aside) { html.push(`<blockquote>${inline(aside[1].trim())}</blockquote>`); continue; }
    const quote = raw.match(/^>\s?(.*)$/); if (quote) { html.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }
    if (raw.trim()) html.push(`<p>${inline(raw.trim())}</p>`);
  }
  flush(); return { blocks, todos };
}
