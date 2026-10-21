import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kitLabel, pickKitOption } from './kit-filter';
import { createBlock } from '@/blocks/create-block';
import { createCalloutEditor } from '@/blocks/editors';
import { renderCalloutBlock } from '@/blocks/render';
import { CalloutBlockSchema } from '@/schemas/block';
import { CULTURAL_WARNING_LOOP_SECONDS, trackOpacity } from '@/blocks/cultural-warning-tracks';

let frame: FrameRequestCallback;
let reduced = false;
let disconnected: ReturnType<typeof vi.fn>;
let painted: ReturnType<typeof vi.fn>;
function block() {
  const b = createBlock('callout', 'cultural_notice');
  if (b.block_type !== 'callout') throw new Error('Expected callout');
  b.content = { style: 'cultural_warning', body: 'Names, images and voices of deceased people.', related_to: { block_id: 'video' } };
  return b;
}
beforeEach(() => {
  reduced = false;
  painted = vi.fn();
  disconnected = vi.fn();
  // One stub per method: the painter makes thousands of calls, and a fresh vi.fn() per call is slow enough to time the test out under load.
  const stubs = new Map<PropertyKey, unknown>();
  const stub = (key: PropertyKey) => {
    if (!stubs.has(key)) stubs.set(key, key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : key === 'fill' ? painted : () => {});
    return stubs.get(key);
  };
  const context = new Proxy({}, { get: (_, key) => stub(key), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D);
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { frame = cb; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnected; });
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect = disconnected; });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Cultural warning callout', () => {
  it('survives a saved block round trip with its related activity intact', () => {
    const saved = CalloutBlockSchema.parse(JSON.parse(JSON.stringify(block())));
    expect(saved.content.style).toBe('cultural_warning');
    expect(saved.content.related_to).toEqual({ block_id: 'video' });
  });
  it('saves the distinct type from the editor and preserves links and body', () => {
    const b = block(); b.content.style = 'information';
    const onChange = vi.fn();
    const editor = createCalloutEditor(b, onChange);
    pickKitOption(editor.querySelector('.block-editor__callout-style'), 'cultural_warning');
    expect(onChange.mock.lastCall?.[0].content).toEqual({ ...b.content, style: 'cultural_warning', title: undefined });
  });
  it('shows an existing explicitly titled warning as the dedicated selection', () => {
    const b = block(); b.content.style = 'information'; b.content.title = 'Cultural Warning for Teachers and Students';
    expect(kitLabel(createCalloutEditor(b, vi.fn()).querySelector('.block-editor__callout-style'))).toBe('Cultural warning');
  });
  it('renders in student and teacher views with decorative canvas and working pause', () => {
    for (const mode of ['student', 'teacher'] as const) {
      const view = renderCalloutBlock(block(), mode); document.body.append(view);
      expect(view.querySelector('.callout--cultural-warning')).not.toBeNull();
      expect(view.querySelector('.callout__identity')?.textContent).toBe('Cultural warning');
      expect(view.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
      const button = view.querySelector<HTMLButtonElement>('.callout__motion-toggle')!;
      button.click(); expect(button.textContent).toBe('Play tracks');
      button.click(); expect(button.textContent).toBe('Pause tracks');
    }
  });
  it('prints a still background without motion controls or a scheduled animation', () => {
    const view = renderCalloutBlock(block(), 'print');
    expect(view.querySelector('canvas')).not.toBeNull();
    expect(view.querySelector('.callout__motion-toggle')).toBeNull();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(painted).toHaveBeenCalled();
  });
  it('honours reduced motion and releases observers after removal', () => {
    reduced = true;
    const view = renderCalloutBlock(block(), 'student'); document.body.append(view);
    expect(view.querySelector<HTMLButtonElement>('.callout__motion-toggle')?.disabled).toBe(true);
    frame(1); const count = painted.mock.calls.length; frame(1001);
    expect(painted).toHaveBeenCalledTimes(count);
    view.remove(); frame(1100);
    expect(disconnected).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
  it('fades older prints and joins the 20 second loop continuously', () => {
    expect(CULTURAL_WARNING_LOOP_SECONDS).toBe(20);
    expect(trackOpacity(.5, 0)).toBe(1);
    expect(trackOpacity(5, 0)).toBeLessThan(trackOpacity(3, 0));
    expect(trackOpacity(8, 0)).toBe(0);
    expect(trackOpacity(1, 0)).toBe(trackOpacity(21, 0));
    expect(trackOpacity(19.999, 18)).toBeCloseTo(trackOpacity(.001, 18), 3);
  });
});
