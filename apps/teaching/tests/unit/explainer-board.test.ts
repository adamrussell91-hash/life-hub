import { describe, it, expect } from 'vitest';
import { BlockSchema, type ExplainerEvent } from '@/schemas/block';
import { partialStroke, stateAt } from '@/blocks/explainer/fold';
import { spliceRecording } from '@/blocks/explainer/clips';
import { BoardCapture, TakeEvents } from '@/blocks/explainer/recorder';
import { eventLabel } from '@/blocks/explainer/timeline';
import { stripExplainerForStudent } from '@/blocks/explainer/publish';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';
import { sampleBoardExplainer } from '@/dev/explainer-sample';
import type { ExplainerBlock } from '@/schemas/block';

const ids = (els: Array<{ id: string }>) => els.map((e) => e.id);
const points = (el: unknown) => ((el as { points?: unknown[] }).points ?? []).length;

describe('explainer board', () => {
  const block = sampleBoardExplainer();
  const content = block.content;
  const events = content.recording!.events;

  it('the board sample parses, and a stroke needs one offset per point', () => {
    expect(content.layout).toBe('both');
    const pen = events.find((e) => e.kind === 'stroke')!;
    const bad = events.map((e) => (e.id === pen.id && e.kind === 'stroke' ? { ...e, offsets: e.offsets.slice(1) } : e));
    expect(() => BlockSchema.parse({ ...block, content: { ...content, recording: { ...content.recording!, events: bad } } })).toThrow(/offset for each point/);
  });

  it('starts from the starting picture', () => {
    expect(ids(stateAt(content, 0).board)).toEqual(['box_a', 'box_b']);
  });

  it('a stroke replays at its recorded point timing', () => {
    expect(ids(stateAt(content, 5.99).board)).not.toContain('pen_1');
    const at = (t: number) => stateAt(content, t).board.find((e) => e.id === 'pen_1');
    expect(points(at(6))).toBe(1);
    expect(points(at(6.25))).toBe(3);
    expect(points(at(6.5))).toBe(6);
    expect(points(at(7.2))).toBe(12);
    expect(points(at(30))).toBe(12);
    // Each step is a new version, so the board redraws it.
    expect(at(6.25)!.version).not.toBe(at(6.5)!.version);
    expect(stateAt(content, 6.25).boardTick).toBeLessThan(stateAt(content, 6.5).boardTick);
  });

  it('partialStroke keeps pressures in step with the points', () => {
    const el = { id: 'p', type: 'freedraw', version: 3, points: [[0, 0], [1, 1], [2, 2]], pressures: [0.1, 0.2, 0.3] };
    expect(partialStroke(el, [0, 1, 2], 1.5)).toMatchObject({ points: [[0, 0], [1, 1]], pressures: [0.1, 0.2] });
    expect(partialStroke(el, [0, 1, 2], -1)).toBeNull();
    expect(partialStroke(el, [0, 1, 2], 2)).toBe(el);
  });

  it('a send creates the board text element at its time', () => {
    expect(ids(stateAt(content, 2.99).board)).not.toContain('sent_1');
    const sent = stateAt(content, 3).board.find((e) => e.id === 'sent_1');
    expect(sent).toMatchObject({ type: 'text', text: 'memory as a tide', x: 20 });
  });

  it('board elements fold through a move and a delete', () => {
    expect(stateAt(content, 17.9).board.find((e) => e.id === 'sent_1')).toMatchObject({ x: 20, y: 40 });
    expect(stateAt(content, 18).board.find((e) => e.id === 'sent_1')).toMatchObject({ x: 40, y: 220 });
    expect(ids(stateAt(content, 25.9).board)).toContain('box_b');
    expect(ids(stateAt(content, 26).board)).not.toContain('box_b');
    expect(ids(stateAt(content, 40).board)).toEqual(['box_a', 'sent_1', 'pen_1']);
  });

  it('playing through equals jumping, for the board too', () => {
    for (let t = 0; t <= 40; t += 0.25) {
      let stepped = stateAt({ board_start: content.board_start, recording: { ...content.recording!, events: [] } }, t);
      for (let i = 1; i <= events.length; i += 1) {
        stepped = stateAt({ board_start: content.board_start, recording: { ...content.recording!, events: events.slice(0, i) } }, t);
      }
      expect(JSON.stringify(stepped.board)).toBe(JSON.stringify(stateAt(content, t).board));
    }
  });

  it('the board pointer shows in scene coordinates', () => {
    expect(stateAt(content, 10.6).pointer).toEqual({ pane: 'board', x: 300, y: 60 });
  });

  it('re-recording mid-stroke keeps the points drawn so far', () => {
    const out = spliceRecording(content.recording!, 6.45, { clips: [], duration_s: 1, events: [] });
    const pen = out.events.find((e) => e.kind === 'stroke');
    expect(pen && pen.kind === 'stroke' ? [points(pen.element), pen.offsets.length] : []).toEqual([5, 5]);
    expect(BlockSchema.safeParse({ ...block, content: { ...content, recording: out } }).success).toBe(true);
  });

  it('capture: a new pen stroke becomes a stroke event with its point times; other changes a board event', () => {
    const start = [{ id: 'box_a', type: 'rectangle', version: 1 }];
    const cap = new BoardCapture(start);
    cap.onChange({ id: 'pen', type: 'freedraw', points: [[0, 0]] }, 2);
    cap.onChange({ id: 'pen', type: 'freedraw', points: [[0, 0], [1, 1], [2, 2]] }, 2.3);
    const evs = cap.commit(
      [
        { id: 'box_a', type: 'rectangle', version: 2, x: 9 },
        { id: 'pen', type: 'freedraw', version: 4, points: [[0, 0], [1, 1], [2, 2]] },
        { id: 'gone', type: 'line', version: 2, isDeleted: true }
      ],
      3
    );
    expect(evs.map((e) => e.kind)).toEqual(['stroke', 'board']);
    const stroke = evs[0] as Extract<ExplainerEvent, { kind: 'stroke' }>;
    expect(stroke.t).toBe(2);
    expect(stroke.offsets).toEqual([0, 0.3, 0.3]);
    const board = evs[1] as Extract<ExplainerEvent, { kind: 'board' }>;
    expect(board.t).toBe(3);
    expect(ids(board.elements)).toEqual(['box_a']);
    // Nothing new: nothing recorded.
    expect(cap.commit([{ id: 'box_a', type: 'rectangle', version: 2 }], 4)).toEqual([]);
  });

  it('board pointer samples switch panes cleanly', () => {
    const take = new TakeEvents();
    take.pointerSample(1, 3);
    take.boardSample(1.5, 10, 20);
    take.boardSample(1.7, 40, 20);
    take.endPointer(2);
    expect(take.events.map((e) => (e.kind === 'pointer' ? [e.pane, e.samples.length] : []))).toEqual([
      ['text', 2],
      ['board', 3]
    ]);
  });

  it('a burst of board edits is one timeline row at its last change', () => {
    const take = new TakeEvents();
    const board = (t: number, x: number) => ({ id: `ev_b${t}`, t, kind: 'board' as const, elements: [{ id: 'box_a', type: 'rectangle', version: t * 10, x }] });
    take.push(board(1, 1));
    take.push(board(2, 2));
    take.push(board(4, 3));
    take.push({ id: 'ev_m', t: 5, kind: 'mark', style: 'highlight', anchor: { granularity: 'word', stanza: 's', quote: { exact: 'x' } } } as ExplainerEvent);
    take.push(board(6, 4));
    take.push(board(20, 5));
    const rows = take.events.map((e) => [e.kind, e.t, e.kind === 'board' ? (e.elements[0] as { x?: number }).x : null]);
    expect(rows).toEqual([
      ['board', 4, 3],
      ['mark', 5, null],
      ['board', 6, 4],
      ['board', 20, 5]
    ]);
    expect(take.lastT).toBe(20);
  });

  it('labels board events in the timeline', () => {
    expect(eventLabel(events.find((e) => e.id === 'ev_del')!)).toBe('Board · 1 removed');
    expect(eventLabel(events.find((e) => e.id === 'ev_move')!)).toBe('Board · 1 shape drawn or moved');
    expect(eventLabel(events.find((e) => e.id === 'ev_send')!)).toBe('Sent to board · memory as a tide');
    expect(eventLabel(events.find((e) => e.id === 'ev_pen')!)).toBe('Pen stroke');
  });

  it('students keep the board events of a published recording; a draft keeps only the starting picture', () => {
    expect(stripExplainerForStudent(block).content.recording!.events.some((e) => e.kind === 'stroke')).toBe(true);
    const draft = stripExplainerForStudent(sampleBoardExplainer({ status: 'draft' }));
    expect(draft.content.recording).toBeUndefined();
    expect(ids(draft.content.board_start!.elements)).toEqual(['box_a', 'box_b']);
  });

  it('sanitising drops unsafe board links and keeps safe ones', () => {
    const dirty: ExplainerBlock = {
      ...block,
      content: {
        ...content,
        board_start: { ...content.board_start!, elements: [{ ...content.board_start!.elements[0]!, link: 'javascript:alert(1)' }, { ...content.board_start!.elements[1]!, link: 'https://example.org' }] },
        recording: { ...content.recording!, events: events.map((e) => (e.kind === 'send' ? { ...e, element: { ...e.element, link: 'javascript:x()' } } : e)) }
      }
    };
    const [clean] = sanitizeBlocksDeep([dirty]) as ExplainerBlock[];
    expect(clean!.content.board_start!.elements.map((e) => (e as { link?: unknown }).link)).toEqual([null, 'https://example.org']);
    const send = clean!.content.recording!.events.find((e) => e.kind === 'send');
    expect(send && send.kind === 'send' ? (send.element as { link?: unknown }).link : 'x').toBeNull();
  });
});
