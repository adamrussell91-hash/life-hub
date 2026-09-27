import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToBlocks } from '../../scripts/lib/notion-comms/markdown-to-blocks.mjs';

test('markdownToBlocks preserves headings and extracts action-item checkboxes safely', () => {
  const result = markdownToBlocks('# Sample\nDate: today\n\n## Action Items\n- [ ] I will send <notes>\n- [x] Sam K. will reply');
  assert.equal(result.blocks[0].content.html, '<p><em>Imported from Notion</em></p>');
  assert.deepEqual(result.blocks[1], { id: 'notion_1', block_type: 'heading', variant: 'section', content: { text: 'Action Items' } });
  assert.deepEqual(result.todos, [{ text: 'I will send <notes>', checked: false, heading: 'Action Items' }, { text: 'Sam K. will reply', checked: true, heading: 'Action Items' }]);
});

test('markdownToBlocks creates hub-shaped blocks for lists, links, callouts, and attachments', () => {
  const result = markdownToBlocks(`# Sample\nDate: today\n\n## Next Steps\n- [ ] Sam K. to reply\n- first\n- second\n\n> Keep this\n<aside>Remember this</aside>\n[Plan](https://example.test/plan)\n![photo](photo.png)`);
  assert.deepEqual(result.blocks.slice(0, 2), [
    { id: 'notion_0', block_type: 'rich_text', variant: 'medium', content: { html: '<p><em>Imported from Notion</em></p>' } },
    { id: 'notion_1', block_type: 'heading', variant: 'section', content: { text: 'Next Steps' } }
  ]);
  assert.match(result.blocks.map((block) => block.content.html ?? '').join(''), /<ul><li>first<\/li><li>second<\/li><\/ul>/);
  assert.match(result.blocks.map((block) => block.content.html ?? '').join(''), /<a href="https:\/\/example\.test\/plan">Plan<\/a>/);
  assert.match(result.blocks.map((block) => block.content.html ?? '').join(''), /Attachment kept in Notion: photo\.png/);
  assert.deepEqual(result.todos, [{ text: 'Sam K. to reply', checked: false, heading: 'Next Steps' }]);
});
