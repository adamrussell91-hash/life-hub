import { createRichTextTools } from '@/blocks/rich-text-tools';
const host = document.createElement('div');
host.className = 'block-rich-text';
let html = '<p>Writers choose whether the doer of an action comes first or disappears from the sentence. Active voice names the doer. Passive voice can drop it.</p>';
host.innerHTML = html;
const tools = createRichTextTools({
  tiptap: { host, getHtml: () => html, setHtml: (n: string) => { html = n; host.innerHTML = n; } },
  getLatest: () => ({ block_type: 'rich_text', settings: {} }) as never,
  onChange: () => {},
  scan: async () => [],
  matrixStatus: async () => 'none',
  questionFirst: async () => ({
    question: 'Why would a writer choose to leave out who did something?',
    hooks: [
      { type: 'contradiction', html: '<p>Your teacher says name the doer. Your science textbook almost never does. They cannot both be writing badly.</p>' },
      { type: 'prediction', html: '<p>Read these two headlines. <em>Police shoot protester.</em> <em>Protester shot.</em></p><p>Which one would a police spokesperson prefer? Pick one before you read on.</p>' },
      { type: 'dilemma', html: '<p>A company made a mistake. Should its apology say <em>we made an error</em> or <em>an error was made</em>? Both are true.</p>' }
    ]
  })
});
const toolbar = document.createElement('div');
toolbar.className = 'block-editor__toolbar';
toolbar.append(...tools.buttons);
document.getElementById('mount')!.append(toolbar, tools.status, host);
