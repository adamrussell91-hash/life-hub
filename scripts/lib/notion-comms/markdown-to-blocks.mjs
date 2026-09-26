const escapeHtml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function markdownToBlocks(markdown = '') {
  const lines = markdown.replace(/\r/g, '').split('\n'); const todos = []; const html = []; let heading = '';
  for (const raw of lines) { if (/^#\s/.test(raw) || /^[A-Za-z][^:]{0,80}:\s/.test(raw)) continue; const title = raw.match(/^(#{1,3})\s+(.+)/); if (title) { heading = title[2]; html.push(`<h${title[1].length}>${escapeHtml(heading)}</h${title[1].length}>`); continue; } const todo = raw.match(/^- \[([ xX])\]\s+(.+)/); if (todo) { const text = todo[2]; todos.push({ text, checked: todo[1].toLowerCase() === 'x', heading }); html.push(`<p>${todo[1].toLowerCase() === 'x' ? '☑' : '☐'} ${escapeHtml(text)}</p>`); continue; } if (raw.trim()) html.push(`<p>${escapeHtml(raw.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`); }
  const blocks = [{ id: 'notion_0', block_type: 'rich_text', variant: 'medium', content: { html: '<p><em>Imported from Notion</em></p>' } }];
  if (html.length) blocks.push({ id: 'notion_1', block_type: 'rich_text', variant: 'medium', content: { html: html.join('') } });
  return { blocks, todos };
}
