import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HUB_PREFS } from '@/domain/hub-prefs';
import { mindWorks2026Map } from '@/domain/maps-seed';
import { tasksApi } from '@/services/client-api';
import { closeCardMenu } from '@/views/card-menu';
import { renderMapsView } from '@/views/maps';

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
});
