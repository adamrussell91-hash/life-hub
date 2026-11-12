import { describe, it, expect, vi } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS, cloneBlockWithNewIds } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';
import { listPublishBlockWarnings } from '@/schemas/publish-block-issues';
import { blocksToSearchText } from '@/blocks/search-text';
import { stripExplainerForStudent } from '@/blocks/explainer/publish';
import { mountExplainerPlayer } from '@/blocks/explainer/player';
import { TakeEvents } from '@/blocks/explainer/recorder';
import { applyTake } from '@/blocks/explainer/editor';
import { deleteEvent, eventLabel, moveEvent } from '@/blocks/explainer/timeline';
import { sampleExplainer } from '@/dev/explainer-sample';
import type { ExplainerBlock } from '@/schemas/block';

const frame = () => new Promise((r) => setTimeout(r, 30));

describe('Explainer block', () => {
  it('is a lesson-only Learning block with empty prose that round-trips through the schema', () => {
    const block = createBlock('explainer', 'ex1');
    const parsed = BlockSchema.parse(block);
    if (parsed.block_type !== 'explainer') throw new Error('Expected explainer');
    expect(parsed.content.layout).toBe('text');
    expect(parsed.content.tray).toEqual([]);
    expect(parsed.content.text?.kind).toBe('prose');
    expect(parsed.content.recording).toBeUndefined();
    expect(BLOCK_GROUPS.find((g) => g.label === 'Learning')?.types).toContain('explainer');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('explainer');
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('explainer');
    expect(blockRegistry.explainer).toBeDefined();
  });

  it('the sample recording parses, and events must run in time order inside the recording', () => {
    const block = sampleExplainer();
    expect(() => BlockSchema.parse(block)).not.toThrow();
    const rec = block.content.recording!;
    const swapped = [rec.events[1]!, rec.events[0]!, ...rec.events.slice(2)];
    expect(() => BlockSchema.parse({ ...block, content: { ...block.content, recording: { ...rec, events: swapped } } })).toThrow(/sorted/);
    expect(() =>
      BlockSchema.parse({ ...block, content: { ...block.content, recording: { ...rec, events: [...rec.events, { id: 'late', t: 41, kind: 'pause', prompt: '' }] } } })
    ).toThrow(/after the end/);
    expect(() => BlockSchema.parse({ ...block, content: { ...block.content, recording: { ...rec, duration_s: 601 } } })).toThrow();
  });

  it('a copy keeps its events and their links', () => {
    let n = 0;
    const copy = cloneBlockWithNewIds(sampleExplainer(), () => `id_${++n}`) as ExplainerBlock;
    expect(copy.id).not.toBe('explainer_demo');
    expect(copy.content.recording!.events.find((e) => e.kind === 'erase')).toMatchObject({ target: 'ev_ul' });
    expect(BlockSchema.safeParse(copy).success).toBe(true);
  });

  it('students get a published recording and only the tray notes it used', () => {
    const stripped = stripExplainerForStudent(sampleExplainer());
    expect(stripped.content.recording?.events).toHaveLength(10);
    expect(stripped.content.tray.map((n) => n.id)).toEqual(['tray_rep']);
    const [viaFilter] = filterBlocksForStudent([sampleExplainer()]) as ExplainerBlock[];
    expect(viaFilter!.content.tray.map((n) => n.id)).toEqual(['tray_rep']);
  });

  it('a draft recording stays with the teacher, and so does the whole tray', () => {
    const [student] = filterBlocksForStudent([sampleExplainer({ status: 'draft' })]) as ExplainerBlock[];
    expect(student!.content.recording).toBeUndefined();
    expect(student!.content.tray).toEqual([]);
    expect(student!.content.text?.stanzas).toHaveLength(2);
  });

  it('sanitises tray and note html', () => {
    const block = sampleExplainer();
    const rec = block.content.recording!;
    const dirty: ExplainerBlock = {
      ...block,
      content: {
        ...block.content,
        tray: [{ id: 'tray_rep', html: '<p onclick="x()">Hi</p><script>bad()</script>' }],
        recording: { ...rec, events: rec.events.map((e) => (e.kind === 'note' ? { ...e, html: '<img src=x onerror="bad()">' } : e)) }
      }
    };
    const [clean] = sanitizeBlocksDeep([dirty]) as ExplainerBlock[];
    expect(clean!.content.tray[0]!.html).not.toMatch(/script|onclick/);
    const note = clean!.content.recording!.events.find((e) => e.kind === 'note');
    expect(note && note.kind === 'note' ? note.html : '').not.toMatch(/onerror/);
  });

  it('warns at publish when there is no published recording', () => {
    expect(listPublishBlockWarnings([createBlock('explainer', 'ex1')])[0]?.message).toMatch(/No recording yet/);
    expect(listPublishBlockWarnings([sampleExplainer({ status: 'draft' })])[0]?.message).toMatch(/draft/);
    expect(listPublishBlockWarnings([sampleExplainer()])).toEqual([]);
  });

  it('search finds the title, the text and the notes', () => {
    const text = blocksToSearchText([sampleExplainer()]);
    expect(text).toMatch(/one-minute answer/);
    expect(text).toMatch(/harbour fills with light/);
    expect(text).toMatch(/pull of the past/);
  });

  it('renders the player for a published recording, with pause ticks and speeds', async () => {
    const el = renderBlock(sampleExplainer(), 'student');
    expect(el.querySelector('.block-explainer__player')).not.toBeNull();
    expect(el.querySelectorAll('.block-explainer__tick')).toHaveLength(2);
    expect([...el.querySelectorAll('.block-explainer__speed')].map((b) => b.textContent)).toEqual(['1×', '1.25×', '1.5×']);
    expect(el.querySelectorAll('audio')).toHaveLength(2);
    expect(el.querySelectorAll('[data-w]').length).toBeGreaterThan(40);
  });

  it('students see the plain text when the recording is a draft; the teacher sees the player', () => {
    const draft = sampleExplainer({ status: 'draft' });
    const student = renderBlock(draft, 'student');
    expect(student.querySelector('.block-explainer__player')).toBeNull();
    expect(student.textContent).toMatch(/harbour fills with light/);
    const teacher = renderBlock(draft, 'teacher');
    expect(teacher.querySelector('.block-explainer__player')).not.toBeNull();
    expect(teacher.textContent).toMatch(/Draft/);
  });

  it('the player paints the state at the scrubbed time', async () => {
    // happy-dom has no layout: give every word a box so the ink has somewhere to go.
    const box = { x: 0, y: 0, left: 0, top: 0, width: 20, height: 20, right: 20, bottom: 20, toJSON: () => ({}) } as DOMRect;
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([box] as unknown as DOMRectList);
    const player = mountExplainerPlayer(sampleExplainer());
    document.body.append(player.el);
    player.seek(13);
    await frame();
    expect(player.el.querySelectorAll('.block-explainer__note')).toHaveLength(1);
    // Highlight + underline drawn; the cross-out is still to come.
    expect(player.el.querySelectorAll('path[data-id="ev_hl"]').length).toBeGreaterThan(0);
    expect(player.el.querySelectorAll('path[data-id="ev_strike"]')).toHaveLength(0);
    player.seek(25);
    await frame();
    expect(player.el.querySelectorAll('path[data-id="ev_ul"]')).toHaveLength(0);
    expect(player.el.querySelectorAll('path[data-id="ev_strike"]').length).toBeGreaterThan(0);
    const card = player.el.querySelector<HTMLElement>('.block-explainer__pause-card')!;
    expect(card.hidden).toBe(true);
    player.dispose();
    player.el.remove();
    rects.mockRestore();
  });

  it('playback stops on a pause point card, and Continue carries on', async () => {
    const player = mountExplainerPlayer(sampleExplainer());
    document.body.append(player.el);
    player.seek(14.9);
    player.play();
    await new Promise((r) => setTimeout(r, 250));
    const card = player.el.querySelector<HTMLElement>('.block-explainer__pause-card')!;
    expect(card.hidden).toBe(false);
    expect(card.textContent).toMatch(/Which two techniques/);
    expect(player.playing()).toBe(false);
    expect(player.time()).toBe(15);
    card.querySelector<HTMLButtonElement>('.block-explainer__continue')!.click();
    expect(player.playing()).toBe(true);
    expect(card.hidden).toBe(true);
    player.dispose();
    player.el.remove();
  });

  it('the editor sets up the text and tray, and offers Record once there is text', () => {
    const changed = vi.fn();
    const editor = createBlockEditor(createBlock('explainer', 'ex1'), changed);
    const record = editor.querySelector<HTMLButtonElement>('.block-explainer-editor__record')!;
    expect(record.disabled).toBe(true);
    const source = editor.querySelector<HTMLTextAreaElement>('.block-explainer-editor__source')!;
    source.value = 'First line of the answer.\n\nSecond paragraph here.';
    source.dispatchEvent(new Event('change'));
    expect(changed.mock.calls.at(-1)![0].content.text.stanzas).toHaveLength(2);
    expect(editor.querySelector<HTMLButtonElement>('.block-explainer-editor__record')!.disabled).toBe(false);
    editor.querySelector<HTMLButtonElement>('.block-explainer-editor__add-note')!.click();
    const input = editor.querySelector<HTMLInputElement>('.block-explainer-editor__tray-input')!;
    input.value = 'Topic sentence';
    input.dispatchEvent(new Event('change'));
    expect(changed.mock.calls.at(-1)![0].content.tray[0].html).toBe('<p>Topic sentence</p>');
  });

  it('the editor shows the status, the preview player and the timeline for a recording', () => {
    const changed = vi.fn();
    const editor = createBlockEditor(sampleExplainer({ status: 'draft' }), changed);
    expect(editor.querySelector('.block-explainer__player')).not.toBeNull();
    expect(editor.querySelectorAll('.block-explainer__event')).toHaveLength(10);
    editor.querySelector<HTMLButtonElement>('[data-status="published"]')!.click();
    expect(changed.mock.calls.at(-1)![0].content.recording.status).toBe('published');
    const pause = editor.querySelector<HTMLInputElement>('.block-explainer__event-prompt')!;
    pause.value = 'What would you cut?';
    pause.dispatchEvent(new Event('change'));
    expect(changed.mock.calls.at(-1)![0].content.recording.events.find((e: { id: string }) => e.id === 'ev_p1').prompt).toBe('What would you cut?');
  });

  it('timeline moves keep time order, and deleting a mark deletes its eraser', () => {
    const rec = sampleExplainer().content.recording!;
    const moved = moveEvent(rec, 'ev_hl', 9);
    expect(moved.events.map((e) => e.id).slice(0, 3)).toEqual(['ev_ptr', 'ev_note', 'ev_hl']);
    expect(moveEvent(rec, 'ev_hl', -3).events[0]!.t).toBe(0);
    const gone = deleteEvent(rec, 'ev_ul');
    expect(gone.events.some((e) => e.id === 'ev_ul' || e.id === 'ev_erase')).toBe(false);
    expect(eventLabel(rec.events[0]!)).toBe('Highlight · memory as a tide');
    expect(eventLabel(rec.events.find((e) => e.id === 'ev_erase')!, rec.events)).toBe('Erase · Underline · harbour fills with light');
  });

  it('pointer samples come about 15 a second and only when the word changes', () => {
    const take = new TakeEvents();
    take.pointerSample(1, 4);
    take.pointerSample(1.01, 5); // too soon
    take.pointerSample(1.2, 5);
    take.pointerSample(1.3, 5); // same word
    take.pointerSample(1.5, 6);
    take.endPointer(2);
    expect(take.events).toHaveLength(1);
    const ev = take.events[0]!;
    expect(ev.kind === 'pointer' ? ev.samples : []).toEqual([[0, 4], [0.2, 5], [0.5, 6], [1, 6]]);
  });

  it('a first take becomes a draft recording; a later take is spliced in', () => {
    const take = { clips: [{ url: '/a.webm', mime: 'audio/webm', start_s: 0, duration_s: 5 }], duration_s: 5, events: [] };
    expect(applyTake(undefined, take, 0)).toMatchObject({ status: 'draft', duration_s: 5 });
    const spliced = applyTake(sampleExplainer().content.recording, take, 10);
    expect(spliced.duration_s).toBe(15);
    expect(spliced.clips).toHaveLength(2);
  });
});

describe('Explainer text pane when it scrolls', () => {
  it('draws the selection on the word, not a scroll height above it', async () => {
    const { createTextPane } = await import('@/blocks/explainer/text-pane');
    const lines = Array.from({ length: 3 }, (_, i) => ({ id: `l${i}`, text: `Line ${i} words` }));
    const pane = createTextPane({ kind: 'prose', stanzas: [{ id: 's0', lines }] } as never);
    document.body.append(pane.el);
    const rect = (top: number, left = 20, width = 40, height = 20) =>
      ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    // The pane's visible box sits at the top of the window, scrolled 120px down.
    pane.el.getBoundingClientRect = () => rect(0, 0, 400, 200);
    Object.defineProperty(pane.el, 'scrollTop', { value: 120, configurable: true });
    // Word 6 shows 30px below the pane's top: 150px down its content.
    const word = pane.el.querySelector<HTMLElement>('[data-w="6"]')!;
    word.getClientRects = () => [rect(30)] as unknown as DOMRectList;
    pane.paint({ marks: [], notes: [], pointer: null } as never, { selection: [6, 6] });
    const d = pane.el.querySelector('.block-explainer__selection')!.getAttribute('d')!;
    const top = Number(/M\s*-?[\d.]+[\s,]+(-?[\d.]+)/.exec(d)?.[1]);
    expect(top).toBeGreaterThan(140);
    expect(top).toBeLessThan(160);
    pane.dispose();
    pane.el.remove();
  });
});
