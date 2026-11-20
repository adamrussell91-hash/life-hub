import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeLine, designBench, markedPoem, poem, replaceWord, toggleBreak, toggleCut } from '@/lab/bench';
import { applyEdits, describeEdits, markEdits, tokenise, type Edit } from '@/lab/model';

// An invented stanza. By word: 0 I, 1 meant, 2 to, 3 tell, 4 you / 5 but, 6 the, 7 words, 8 I, 9 think, / 10 were, 11 somewhere, 12 else.
const CONTROL = 'I meant to tell you\nbut the words, I think,\nwere somewhere else.';
const tokens = tokenise(CONTROL);

/** The bench in a small page that keeps the pair's edit and selection, as the Design step does. */
function mount(first: Edit = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const state = { edit: first, sel: -1 };
  const onReady = vi.fn();
  const draw = () => host.replaceChildren(...designBench({
    tokens, edit: state.edit, sel: state.sel,
    onSelect: (i) => { state.sel = state.sel === i ? -1 : i; draw(); },
    onEdit: (edit) => { state.edit = edit; if (!Object.keys(edit).length) state.sel = -1; draw(); },
    onReady
  }));
  draw();
  const tap = (word: string) => ([...host.querySelectorAll('.lab-pane.is-live button.lab-tok')].find((b) => b.textContent === word) as HTMLButtonElement).click();
  const tool = (name: string) => host.querySelector(`[data-tool="${name}"]`) as HTMLButtonElement;
  const change = () => host.querySelector('.lab-change')?.textContent ?? '';
  const ready = () => host.querySelector('[data-act="ready"]') as HTMLButtonElement;
  return { host, state, tap, tool, change, ready, onReady };
}

afterEach(() => document.body.replaceChildren());

describe('the bench tools as edits', () => {
  it('Replace swaps a word, and the original word or nothing puts it back', () => {
    const edit = replaceWord(tokens, {}, 1, ' wanted ');
    expect(edit).toEqual({ rep: { 1: 'wanted' } });
    expect(describeEdits(tokens, edit)).toEqual(['changed "meant" to "wanted"']);
    expect(replaceWord(tokens, edit, 1, 'meant')).toEqual({});
    expect(replaceWord(tokens, edit, 1, '  ')).toEqual({});
    // Replacing a cut word brings it back as the new word.
    expect(replaceWord(tokens, { cut: [1] }, 1, 'wanted')).toEqual({ rep: { 1: 'wanted' } });
  });

  it('Cut strikes a word and Put back restores it', () => {
    const edit = toggleCut(toggleCut({}, 9), 8);
    expect(edit).toEqual({ cut: [8, 9] });
    expect(describeEdits(tokens, edit)).toEqual(['cut "I think,"']);
    expect(applyEdits(tokens, edit).lines[1]).toBe('but the words,');
    expect(toggleCut(toggleCut(edit, 8), 9)).toEqual({});
  });

  it('Break line after and Join to next line flip the break after a word', () => {
    const joined = toggleBreak(tokens, {}, 4);
    expect(joined).toEqual({ join: [4] });
    expect(describeEdits(tokens, joined)).toEqual(['joined lines 1 and 2']);
    expect(toggleBreak(tokens, joined, 4)).toEqual({});
    const broken = toggleBreak(tokens, {}, 6);
    expect(broken).toEqual({ brk: [6] });
    expect(describeEdits(tokens, broken)).toEqual(['broke line 2 after "the"']);
    // The last word has no line after it.
    expect(toggleBreak(tokens, {}, 12)).toEqual({});
  });
});

describe('the bench on the page', () => {
  it('shows the control beside the pair’s version, with Put it on the bench off until something changes', () => {
    const { host, ready, change } = mount();
    const panes = [...host.querySelectorAll('.lab-bench .lab-pane')];
    expect(panes.map((p) => p.querySelector('.lab-label')?.textContent)).toEqual(['Control', 'Your version']);
    expect(panes[0]!.querySelectorAll('button').length).toBe(0);
    expect(panes[1]!.querySelectorAll('button.lab-tok').length).toBe(13);
    expect(panes[0]!.querySelectorAll('li').length).toBe(3);
    expect(host.textContent).toContain('Tap a word in your version to change it, cut it, or move a line break.');
    expect(change()).toBe('No change yet.');
    expect(ready().disabled).toBe(true);
    expect(host.querySelector('[data-act="clear"]')).toBeNull();
  });

  it('tap a word, then Cut: the word is struck in lilac and the change is named', () => {
    const { host, state, tap, tool, change, ready, onReady } = mount();
    tap('think,');
    expect(host.querySelector('.lab-tok.is-sel')?.textContent).toBe('think,');
    expect(tool('cut').textContent).toBe('Cut');
    tool('cut').click();
    expect(state.edit).toEqual({ cut: [9] });
    expect(host.querySelector('.lab-pane.is-live .lab-tok.is-cut')?.textContent).toBe('think,');
    expect(change()).toBe('One change: cut "think,".');
    expect(tool('cut').textContent).toBe('Put back');
    expect(ready().disabled).toBe(false);
    ready().click();
    expect(onReady).toHaveBeenCalledTimes(1);
    tool('cut').click();
    expect(state.edit).toEqual({});
    expect(change()).toBe('No change yet.');
  });

  it('Replace takes the typed word, by button or Enter', () => {
    const { host, state, tap, tool, change } = mount();
    tap('meant');
    const input = host.querySelector('.lab-tools__word') as HTMLInputElement;
    expect(input.value).toBe('meant');
    input.value = 'wanted';
    tool('replace').click();
    expect(state.edit).toEqual({ rep: { 1: 'wanted' } });
    expect(host.querySelector('.lab-pane.is-live .lab-tok.is-changed')?.textContent).toBe('wanted');
    expect(change()).toBe('One change: changed "meant" to "wanted".');
    const again = host.querySelector('.lab-tools__word') as HTMLInputElement;
    again.value = 'hoped';
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(state.edit).toEqual({ rep: { 1: 'hoped' } });
  });

  it('a line break can be taken away or added, shown by a bar, and the last word has no break tool', () => {
    const { host, state, tap, tool, change } = mount();
    tap('you');
    expect(tool('break').textContent).toBe('Join to next line');
    tool('break').click();
    expect(state.edit).toEqual({ join: [4] });
    expect(change()).toBe('One change: joined lines 1 and 2.');
    expect(host.querySelectorAll('.lab-pane.is-live li').length).toBe(2);
    expect(host.querySelectorAll('.lab-pane.is-live .lab-mk').length).toBe(1);
    expect(tool('break').textContent).toBe('Break line after');
    tool('break').click();
    expect(state.edit).toEqual({});
    tap('you');
    tap('else.');
    expect(tool('break')).toBeNull();
  });

  it('a second change is allowed, with the line that one change gives a cleaner result; Start over clears it', () => {
    const { host, state, tap, tool, change } = mount({ cut: [9] });
    expect(change()).toBe('One change: cut "think,".');
    tap('the');
    tool('break').click();
    expect(state.edit).toEqual({ cut: [9], brk: [6] });
    expect(change()).toBe('2 changes: broke line 2 after "the"; cut "think,". One change gives a cleaner result.');
    (host.querySelector('[data-act="clear"]') as HTMLButtonElement).click();
    expect(state.edit).toEqual({});
    expect(change()).toBe('No change yet.');
    expect(host.querySelector('.lab-tok.is-sel')).toBeNull();
  });

  it('two neighbouring edits read as one change', () => {
    expect(changeLine(describeEdits(tokens, { cut: [8, 9] })).textContent).toBe('One change: cut "I think,".');
  });

  it('a reader’s copy has numbered lines and no marks; the teacher’s copy shows them', () => {
    const edit: Edit = { rep: { 1: 'wanted' }, cut: [9], join: [4] };
    const plain = poem(applyEdits(tokens, edit).lines);
    expect([...plain.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['I wanted to tell you but the words, I', 'were somewhere else.']);
    expect(plain.querySelector('.lab-tok, .lab-mk, button')).toBeNull();
    const marked = markedPoem(markEdits(tokens, edit));
    expect(marked.querySelector('.is-changed')?.textContent).toBe('wanted');
    expect(marked.querySelector('.is-cut')?.textContent).toBe('think,');
    expect(marked.querySelectorAll('.lab-mk').length).toBe(1);
    expect(marked.querySelector('button')).toBeNull();
  });
});
