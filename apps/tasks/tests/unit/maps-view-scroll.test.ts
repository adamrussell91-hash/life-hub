import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HUB_PREFS } from '@/domain/hub-prefs';
import { mindWorks2026Map } from '@/domain/maps-seed';
import { tasksApi } from '@/services/client-api';
import { closeCardMenu } from '@/views/card-menu';
import { renderMapsView } from '@/views/maps';
import type { MapTick } from '@/schemas/map';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listMaps: vi.fn(),
    listProjects: vi.fn(),
    getHubPrefs: vi.fn(),
    updateMap: vi.fn(),
    createMap: vi.fn()
  }
}));

function enterEdit(canvas: HTMLElement): void {
  canvas.querySelector<HTMLButtonElement>('.card-menu')?.click();
  const menu = document.querySelector<HTMLElement>('.card-menu__panel');
  menu?.querySelector<HTMLButtonElement>('[data-card-menu-item="edit"]')?.click();
}

describe('maps view scroll', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.listMaps).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.getHubPrefs).mockReset();
    vi.mocked(tasksApi.updateMap).mockReset();
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
    vi.mocked(tasksApi.getHubPrefs).mockResolvedValue(structuredClone(DEFAULT_HUB_PREFS));
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(max-width: 720px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);
  });

  afterEach(() => {
    closeCardMenu();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('keeps page scroll when a year-line edit remounts the map', async () => {
    const map = mindWorks2026Map();
    vi.mocked(tasksApi.listMaps).mockResolvedValue([map]);
    vi.mocked(tasksApi.updateMap).mockImplementation(async (_id, body) => ({
      ...map,
      ...(body as object),
      updated_at: '2026-08-21T00:00:00.000Z'
    }));

    const wrap = document.createElement('div');
    wrap.className = 'hub-canvas';
    const canvas = document.createElement('div');
    canvas.className = 'hub-canvas__body';
    wrap.append(canvas);
    document.body.append(wrap);

    await renderMapsView(canvas);
    enterEdit(canvas);

    await vi.waitFor(() => {
      expect(canvas.querySelector('.map-editbar')).toBeTruthy();
    });

    canvas.querySelector<HTMLButtonElement>('[data-map-index-toggle]')?.click();
    const evatt = [...canvas.querySelectorAll<HTMLElement>('.hub-row')].find((row) =>
      row.textContent?.includes('UN Evatt Competition')
    );
    expect(evatt).toBeTruthy();
    evatt!.click();

    await vi.waitFor(() => {
      expect(canvas.querySelector('.map-inspector')).toBeTruthy();
      expect(canvas.querySelector('.map-tracks')).toBeTruthy();
    });

    window.scrollTo(0, 420);
    wrap.scrollTop = 160;
    canvas.scrollTop = 55;
    const inspector = canvas.querySelector<HTMLElement>('.map-inspector');
    if (inspector) inspector.scrollTop = 40;

    const junior = canvas.querySelector<HTMLInputElement>('.map-tracks input[value="junior"]');
    expect(junior).toBeTruthy();
    junior!.checked = !junior!.checked;
    junior!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(vi.mocked(tasksApi.updateMap)).toHaveBeenCalled();
    });

    expect(window.scrollY).toBe(420);
    expect(wrap.scrollTop).toBe(160);
    expect(canvas.scrollTop).toBe(55);
    expect(canvas.querySelector<HTMLElement>('.map-inspector')?.scrollTop).toBe(40);
  });
  it('keeps every strand ticked in quick succession while earlier saves are still in flight', async () => {
    const map = mindWorks2026Map();
    vi.mocked(tasksApi.listMaps).mockResolvedValue([map]);
    const replies: Array<() => void> = [];
    vi.mocked(tasksApi.updateMap).mockImplementation((_id, body) => {
      const snapshot = structuredClone(body) as object;
      return new Promise((resolve) => {
        replies.push(() => resolve({ ...map, ...snapshot, updated_at: '2026-08-21T00:00:00.000Z' } as typeof map));
      });
    });

    const canvas = document.createElement('div');
    canvas.className = 'hub-canvas__body';
    document.body.append(canvas);
    await renderMapsView(canvas);
    enterEdit(canvas);
    await vi.waitFor(() => expect(canvas.querySelector('.map-editbar')).toBeTruthy());

    canvas.querySelector<HTMLButtonElement>('[data-map-index-toggle]')?.click();
    [...canvas.querySelectorAll<HTMLElement>('.hub-row')].find((row) => row.textContent?.includes('UN Evatt Competition'))!.click();
    await vi.waitFor(() => expect(canvas.querySelector('.map-inspector')).toBeTruthy());

    const strandBox = (name: string) =>
      [...canvas.querySelectorAll<HTMLLabelElement>('.map-inspector label.map-tracks__item')]
        .find((item) => item.textContent === name)
        ?.querySelector<HTMLInputElement>('input');
    const names = ['Innovation', 'Expression', 'Reasoning'];
    for (const name of names) {
      const box = strandBox(name)!;
      expect(box).toBeTruthy();
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    // Replies land only after all three ticks, as on a slow connection.
    while (vi.mocked(tasksApi.updateMap).mock.calls.length < names.length || replies.length) {
      await vi.waitFor(() => expect(replies.length).toBeGreaterThan(0));
      replies.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const calls = vi.mocked(tasksApi.updateMap).mock.calls;
    const last = calls[calls.length - 1]![1] as { ticks: Array<{ id: string; also_lines?: string[] }> };
    const evatt = last.ticks.find((tick) => tick.id === 'tk_evatt')!;
    expect([...(evatt.also_lines ?? [])].sort()).toEqual(['line_expression', 'line_innovation', 'line_reasoning']);
    for (const name of names) expect(strandBox(name)?.checked).toBe(true);
  });
  async function openEvattCard(): Promise<HTMLElement> {
    const canvas = document.createElement('div');
    canvas.className = 'hub-canvas__body';
    document.body.append(canvas);
    await renderMapsView(canvas);
    enterEdit(canvas);
    await vi.waitFor(() => expect(canvas.querySelector('.map-editbar')).toBeTruthy());
    canvas.querySelector<HTMLButtonElement>('[data-map-index-toggle]')?.click();
    [...canvas.querySelectorAll<HTMLElement>('.hub-row')].find((row) => row.textContent?.includes('UN Evatt Competition'))!.click();
    await vi.waitFor(() => expect(canvas.querySelector('.map-inspector')).toBeTruthy());
    return canvas;
  }

  function field(canvas: HTMLElement, label: string): HTMLElement | undefined {
    return [...canvas.querySelectorAll<HTMLElement>('.map-inspector__field')].find(
      (item) => item.querySelector('.map-inspector__label')?.textContent === label
    );
  }

  it('edits where a competition sits with Sits on, Part of, Year lines and Leads to', async () => {
    const map = mindWorks2026Map();
    vi.mocked(tasksApi.listMaps).mockResolvedValue([map]);
    vi.mocked(tasksApi.updateMap).mockImplementation(async (_id, body) => ({ ...map, ...(structuredClone(body) as object) }) as typeof map);
    const canvas = await openEvattCard();

    const labels = [...canvas.querySelectorAll('.map-inspector__label')].map((item) => item.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Sits on', 'Part of', 'Year lines', 'Leads to']));
    expect(labels).not.toContain('Attach to');
    expect(labels).not.toContain('Also connect to');
    expect(labels).not.toContain('Also on strands');

    // Every strand is listed, the host ticked; Leads to shows the competition it feeds.
    const boxes = () => [...field(canvas, 'Sits on')!.querySelectorAll<HTMLInputElement>('input')];
    expect(boxes().map((box) => box.value)).toEqual(map.lines.map((line) => line.id));
    expect(boxes().filter((box) => box.checked).map((box) => box.value)).toEqual(['line_justice']);
    expect(field(canvas, 'Leads to')!.querySelector('.is-active')?.textContent).toBe('Rotary MUNA');

    // Ticking Reasoning puts it on both strands.
    const reasoning = boxes().find((box) => box.value === 'line_reasoning')!;
    reasoning.checked = true;
    reasoning.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(vi.mocked(tasksApi.updateMap)).toHaveBeenCalled());
    let calls = vi.mocked(tasksApi.updateMap).mock.calls;
    let evatt = (calls[calls.length - 1]![1] as { ticks: MapTick[] }).ticks.find((tick) => tick.id === 'tk_evatt')!;
    expect(evatt.attach).toMatchObject({ kind: 'line', line_id: 'line_justice', tracks: ['rozelle', 'senior'] });
    expect(evatt.also_lines).toEqual(['line_reasoning']);

    // It can never be on no strand at all.
    for (const box of boxes()) {
      if (!box.checked) continue;
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(boxes().filter((box) => box.checked).length).toBeGreaterThan(0);

    // Part of a program: Sits on gives way, and the strand list returns when cleared.
    const partOf = field(canvas, 'Part of')!;
    [...partOf.querySelectorAll<HTMLButtonElement>('.map-picker__opt')].find((btn) => btn.textContent?.includes('Mock Trial'))!.click();
    await vi.waitFor(() => expect(field(canvas, 'Sits on')).toBeUndefined());
    calls = vi.mocked(tasksApi.updateMap).mock.calls;
    evatt = (calls[calls.length - 1]![1] as { ticks: MapTick[] }).ticks.find((tick) => tick.id === 'tk_evatt')!;
    expect(evatt.attach.kind).toBe('station');
    expect(evatt.also_lines).toBeUndefined();
    [...field(canvas, 'Part of')!.querySelectorAll<HTMLButtonElement>('.map-picker__opt')]
      .find((btn) => btn.textContent?.startsWith('Nothing'))!
      .click();
    await vi.waitFor(() => expect(field(canvas, 'Sits on')).toBeTruthy());
  });
});
