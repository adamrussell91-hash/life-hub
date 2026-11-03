import { describe, expect, it, vi } from 'vitest';
import { bindChatAttachments } from '@/chat/chat-attachments';
import { createChatApi } from '@/services/chat-api';

function composer() {
  const root = document.createElement('form');
  root.innerHTML = '<textarea id="chat-input" required></textarea><input id="chat-attach-input" type="file" hidden /><button id="chat-attach" type="button"></button><div id="chat-attach-list" hidden></div>';
  return root;
}

async function pick(root: HTMLElement, file: File) {
  const picker = root.querySelector('#chat-attach-input') as HTMLInputElement;
  Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
  picker.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(root.querySelector('#chat-attach-list')?.hasAttribute('hidden')).toBe(false));
}

describe('Clare chat attachments', () => {
  it('holds a PDF until the send takes it, and lets the message box stay empty', async () => {
    const root = composer();
    const composerFiles = bindChatAttachments(root);
    await pick(root, new File(['%PDF-1.4'], 'minutes.pdf', { type: 'application/pdf' }));
    expect(root.querySelector('.chat-attach-chip')?.textContent).toBe('minutes.pdf');
    expect((root.querySelector('#chat-input') as HTMLTextAreaElement).required).toBe(false);
    const taken = composerFiles.take();
    expect(taken[0].dataUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(composerFiles.take()).toEqual([]);
    expect((root.querySelector('#chat-input') as HTMLTextAreaElement).required).toBe(true);
    expect(root.querySelector('.chat-attach-chip')).toBeNull();
  });

  it('removes a file when its chip is pressed', async () => {
    const root = composer();
    const composerFiles = bindChatAttachments(root);
    await pick(root, new File(['%PDF-1.4'], 'minutes.pdf', { type: 'application/pdf' }));
    (root.querySelector('.chat-attach-chip') as HTMLButtonElement).click();
    expect(composerFiles.take()).toEqual([]);
  });

  it('sends attachments to /api/chat', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 'x' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    const attachments = [{ id: 'a', kind: 'file' as const, mime: 'application/pdf', name: 'm.pdf', dataUrl: 'data:application/pdf;base64,AA==' }];
    await expect(createChatApi(fetchImpl as unknown as typeof fetch).send('Hi', { attachments }).next()).rejects.toThrow();
    const init = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    expect(JSON.parse(String(init.body)).attachments).toEqual(attachments);
  });
});
