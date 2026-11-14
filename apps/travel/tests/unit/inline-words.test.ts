import { afterEach, describe, expect, it, vi } from 'vitest';
import { openInlineWords, WORDS_SAVE_FAILED } from '@/journal/inline-words';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal, type JournalViewHandle } from '@/journal/render-journal';
import type { JournalDocument } from '@/api/journal';

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
});

function hostWith(text: string): HTMLElement {
  const wrap = document.createElement('div');
  const host = document.createElement('div');
  host.textContent = text;
  wrap.append(host);
  document.body.append(wrap);
  return host;
}
const field = (): HTMLTextAreaElement => document.querySelector('.story-words-edit__field')!;
const doneBtn = (): HTMLButtonElement => document.querySelector('.story-words-edit__done')!;

describe('openInlineWords', () => {
  it('puts the words in a field in place, with the caret at the end', () => {
    const host = hostWith('Cold feet in the Atlantic.');
    const changes: boolean[] = [];
    openInlineWords({ host, text: 'Cold feet in the Atlantic.', onSave: async () => {}, onEditingChange: (e) => changes.push(e) });
    expect(host.hidden).toBe(true);
    expect(host.nextElementSibling!.classList.contains('story-words-edit')).toBe(true);
    expect(field().value).toBe('Cold feet in the Atlantic.');
    expect(document.activeElement).toBe(field());
    expect(field().selectionStart).toBe(field().value.length);
    expect(changes).toEqual([true]);
  });

  it('saves on Done and on leaving the field, and closes', async () => {
    for (const leave of [() => doneBtn().click(), () => field().dispatchEvent(new FocusEvent('blur'))]) {
      const host = hostWith('Old');
      const onSave = vi.fn(async () => {});
      const changes: boolean[] = [];
      openInlineWords({ host, text: 'Old', onSave, onEditingChange: (e) => changes.push(e) });
      field().value = 'New words  \n';
      leave();
      await vi.waitFor(() => expect(document.querySelector('.story-words-edit')).toBeNull());
      expect(onSave).toHaveBeenCalledWith('New words');
      expect(host.hidden).toBe(false);
      expect(changes).toEqual([true, false]);
      document.body.replaceChildren();
    }
  });

  it('does not save when nothing changed, and Escape puts the old words back', async () => {
    const host = hostWith('Same');
    const onSave = vi.fn(async () => {});
    openInlineWords({ host, text: 'Same', onSave });
    doneBtn().click();
    await vi.waitFor(() => expect(document.querySelector('.story-words-edit')).toBeNull());

    openInlineWords({ host, text: 'Same', onSave });
    field().value = 'Changed my mind';
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const reached = vi.fn();
    document.addEventListener('keydown', reached, { once: true });
    field().dispatchEvent(escape);
    expect(document.querySelector('.story-words-edit')).toBeNull();
    expect(host.hidden).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(reached).not.toHaveBeenCalled(); // Escape closes nothing else
  });

  it('keeps the field open with the new words when the save fails, and says why', async () => {
    const host = hostWith('Old');
    const onSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    openInlineWords({ host, text: 'Old', onSave });
    field().value = 'Worth keeping';
    doneBtn().click();
    await vi.waitFor(() => expect(document.querySelector('.story-words-edit__status')!.textContent).toBe(WORDS_SAVE_FAILED));
    expect(field().value).toBe('Worth keeping');
    expect(field().readOnly).toBe(false);
    expect(doneBtn().textContent).toBe('Try again');
    // Leaving the field now does not fire another save by itself.
    field().dispatchEvent(new FocusEvent('blur'));
    expect(onSave).toHaveBeenCalledTimes(1);
    doneBtn().click();
    await vi.waitFor(() => expect(document.querySelector('.story-words-edit')).toBeNull());
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

describe('words in the story', () => {
  function mount(): { root: HTMLElement; handle: JournalViewHandle; journal: JournalDocument } {
    const root = document.createElement('div');
    document.body.append(root);
    const journal = lisbonPortoJournal('trp_words_test') as JournalDocument;
    const handle = renderJournal(root, { fixture: journal, today: '2027-03-06' });
    return { root, handle, journal };
  }
  const words = (root: HTMLElement, id: string) => root.querySelector(`#${id} .story-moment__words p`)?.textContent;

  it('edits a moment’s words by tapping them', async () => {
    const { root } = mount();
    (root.querySelector('#mom_lpbeach01 .story-moment__words p') as HTMLElement).click();
    expect(root.classList.contains('story--editing-words') || root.querySelector('.story--editing-words')).toBeTruthy();
    field().value = 'Cold feet, hot chips, no regrets.';
    doneBtn().click();
    await vi.waitFor(() => expect(words(root, 'mom_lpbeach01')).toBe('Cold feet, hot chips, no regrets.'));
    expect(root.querySelector('.story-words-edit')).toBeNull();
    expect(root.querySelector('.story--editing-words')).toBeNull();
  });

  it('offers "Add a line" on a moment with no words, and a button for keyboards on one that has them', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const journal = lisbonPortoJournal('trp_words_test') as JournalDocument;
    const bare = { ...journal, moments: journal.moments.map((m) => (m.id === 'mom_lparch001' ? { ...m, text: undefined } : m)) };
    renderJournal(root, { fixture: bare, today: '2027-03-06' });
    const add = root.querySelector('#mom_lparch001 .story-moment__add-line') as HTMLButtonElement;
    expect(add.textContent).toBe('Add a line');
    add.click();
    field().value = 'Bags still on our backs.';
    field().dispatchEvent(new FocusEvent('blur'));
    await vi.waitFor(() => expect(words(root, 'mom_lparch001')).toBe('Bags still on our backs.'));
    expect(root.querySelector('#mom_lparch001 .story-moment__add-line')).toBeNull();
    expect(root.querySelector('#mom_lptram001 .story-moment__edit-words')!.textContent).toBe('Edit words');
  });

  it('holds a background repaint until the field closes, then shows both changes', async () => {
    const { root, handle, journal } = mount();
    (root.querySelector('#mom_lpbeach01 .story-moment__words p') as HTMLElement).click();
    const editing = field();
    editing.value = 'Typed while a sync came in.';
    // A sync arrives with another moment changed.
    const synced: JournalDocument = {
      ...journal,
      revision: journal.revision + 1,
      moments: journal.moments.map((m) => (m.id === 'mom_lptram001' ? { ...m, text: 'Changed on another device.' } : m)),
    };
    handle.reconcile({ journal: synced, version: 'fixture' });
    expect(document.querySelector('.story-words-edit__field')).toBe(editing); // still the same field
    expect(editing.value).toBe('Typed while a sync came in.');
    doneBtn().click();
    await vi.waitFor(() => expect(words(root, 'mom_lpbeach01')).toBe('Typed while a sync came in.'));
    expect(words(root, 'mom_lptram001')).toBe('Changed on another device.');
  });
});
