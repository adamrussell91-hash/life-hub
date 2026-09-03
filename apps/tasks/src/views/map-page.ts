import type { MapStation, MapTick, TransitMap } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import { projectPageHash } from '@/domain/cards';
import {
  activateMapItem,
  deleteMapItemProject,
  mapItemKindLabel,
  mapItemPageHash,
  planningOf,
  planMapItem,
  type MapItemKind
} from '@/domain/maps-planning';
import { applyDateSpanToStation, applyDateToTickAttach, lineTrackDefs, type TrackDef } from '@/domain/maps-layout';
import { formatRelativeUpdated } from '@/domain/cards';
import { mapsOrSeed } from '@/domain/maps';
import { renderLineRail, type MapCardModel } from '@/views/map-cards';
import { closeCardMenu, renderCardMenu } from '@/views/card-menu';
import { tasksApi } from '@/services/client-api';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { createHubField, createHubFilter } from '@/views/hub-kit';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export type MapItemPageRef = { mapId: string; kind: MapItemKind; id: string };

function backLink(): HTMLAnchorElement {
  const link = el('a', 'page-card__back', '← Maps') as HTMLAnchorElement;
  link.href = '#/maps';
  return link;
}

function titleInput(value: string, label: string): HTMLInputElement {
  const input = el('input', 'hub-card__title page-card__title-input') as HTMLInputElement;
  input.type = 'text';
  input.value = value;
  input.setAttribute('aria-label', label);
  return input;
}

function trackPicker(selected: string[], available: TrackDef[]): { root: HTMLElement; value: () => string[] } {
  const root = el('div', 'map-tracks');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Year lines');
  const boxes = available.map((track) => {
    const label = el('label', 'map-tracks__item');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = track.id;
    box.checked = selected.includes(track.id);
    label.append(box, document.createTextNode(track.label));
    root.append(label);
    return box;
  });
  return {
    root,
    value: () => {
      const picked = boxes.filter((box) => box.checked).map((box) => box.value);
      return picked.length ? picked : [available[0]?.id ?? 'junior'];
    }
  };
}

function findItem(
  map: TransitMap,
  kind: MapItemKind,
  id: string
): MapStation | MapTick | null {
  if (kind === 'station') return map.stations.find((item) => item.id === id) ?? null;
  return map.ticks.find((item) => item.id === id) ?? null;
}

function toModel(map: TransitMap, kind: MapItemKind, item: MapStation | MapTick, projects: Project[]): MapCardModel {
  const line =
    kind === 'station'
      ? map.lines.find((entry) => entry.id === (item as MapStation).line_id) ?? null
      : null;
  const linked = item.link ? projects.find((project) => project.id === item.link!.id) : null;
  return {
    id: item.id,
    kind,
    label: item.label,
    planning: planningOf(item),
    starts_on: item.starts_on,
    ends_on: item.ends_on,
    tracks: kind === 'station' ? (item as MapStation).tracks : [],
    updated_at: map.updated_at,
    line,
    lines: map.lines,
    linkedTitle: linked?.title ?? null
  };
}

export async function renderMapItemPage(canvas: HTMLElement, ref: MapItemPageRef): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading card…'));
  try {
    const [listed, projects] = await Promise.all([
      tasksApi.listMaps().catch(() => [] as TransitMap[]),
      tasksApi.listProjects().catch(() => [] as Project[])
    ]);
    const maps = mapsOrSeed(listed);
    let current = maps.find((map) => map.id === ref.mapId) ?? null;
    if (!current) {
      canvas.replaceChildren(el('p', 'empty-state', 'That map is gone.'));
      return;
    }
    let item = findItem(current, ref.kind, ref.id);
    if (!item) {
      canvas.replaceChildren(el('p', 'empty-state', 'That card is gone.'));
      return;
    }

    const year = current.year ?? new Date().getFullYear();
    const errorHost = el('p', 'empty-state');
    errorHost.hidden = true;
    let saveTimer: number | undefined;

    const persist = (paintAfter = false) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        void tasksApi
          .updateMap(current!.id, {
            title: current!.title,
            year: current!.year,
            lines: current!.lines,
            stations: current!.stations,
            ticks: current!.ticks
          })
          .then((saved) => {
            current = saved;
            item = findItem(saved, ref.kind, ref.id);
            errorHost.hidden = true;
            errorHost.textContent = '';
            if (paintAfter) paint();
          })
          .catch((err: unknown) => {
            errorHost.hidden = false;
            errorHost.textContent = errorMessage(err);
          });
      }, 280);
    };

    const paint = () => {
      if (!current || !item) return;
      closeCardMenu();
      const model = toModel(current, ref.kind, item, projects);
      const station = ref.kind === 'station' ? (item as MapStation) : null;
      const page = el('div', 'page-editor map-card-page');
      const card = el('article', 'hub-card page-card map-card');
      card.dataset.planning = model.planning;
      card.append(renderLineRail(model.lines, model.line?.id ?? null));
      const head = el('header', 'task-card__head');
      head.append(el('span', 'hub-card__eyebrow', mapItemKindLabel(ref.kind)), backLink());
      const title = titleInput(item.label, `${mapItemKindLabel(ref.kind)} name`);
      title.addEventListener('input', () => {
        const next = title.value.trim();
        if (!next || !item) return;
        item.label = next;
        persist();
      });
      title.addEventListener('blur', () => {
        if (!title.value.trim() && item) title.value = item.label;
      });

      const fields = el('div', 'page-card__fields hub-toolbar map-card__fields');
      const start = createHubField({
        type: 'date',
        ariaLabel: ref.kind === 'station' ? 'Starts' : 'Date',
        value: item.starts_on ?? '',
        className: 'page-card__due',
        onChange: (value) => {
          if (!item || !current) return;
          item.starts_on = value || null;
          if (station) {
            const next = applyDateSpanToStation(station, year);
            station.starts_on = next.starts_on;
            station.ends_on = next.ends_on;
            station.y = next.y;
            station.height = next.height;
          } else {
            const next = applyDateToTickAttach(item as MapTick, year);
            (item as MapTick).attach = next.attach;
          }
          persist(true);
        }
      });
      fields.append(start.el);
      if (station) {
        const end = createHubField({
          type: 'date',
          ariaLabel: 'Ends',
          value: station.ends_on ?? '',
          className: 'page-card__due',
          onChange: (value) => {
            station.ends_on = value || null;
            const next = applyDateSpanToStation(station, year);
            station.starts_on = next.starts_on;
            station.ends_on = next.ends_on;
            station.y = next.y;
            station.height = next.height;
            persist(true);
          }
        });
        fields.append(end.el);
        const line = createHubFilter({
          key: 'Line',
          label: 'Line',
          defaultValue: station.line_id,
          options: current.lines.map((entry) => ({
            value: entry.id,
            label: `${entry.letter} · ${entry.name}`
          })),
          value: station.line_id,
          onChange: (value) => {
            station.line_id = value || station.line_id;
            persist(true);
          }
        });
        fields.append(line.el);
        const stationLine = current.lines.find((entry) => entry.id === station.line_id) ?? current.lines[0]!;
        const tracks = trackPicker(station.tracks, lineTrackDefs(stationLine));
        tracks.root.addEventListener('change', () => {
          station.tracks = tracks.value();
          persist(true);
        });
        fields.append(tracks.root);
      }

      const foot = el('footer', 'task-card__foot');
      foot.append(el('span', 'hub-card__meta', formatRelativeUpdated(current.updated_at)));
      card.append(head, title, fields, foot);
      card.append(
        renderCardMenu(`${item.label} card menu`, [
          {
            id: 'planning',
            label: planningOf(item) === 'active' ? 'Make planned' : 'Make active',
            onSelect: () => {
              void (async () => {
                if (!item || !current) return;
                const lineName = model.line?.name;
                if (planningOf(item) === 'planned') {
                  const project = await activateMapItem(item, ref.kind, lineName, projects);
                  if (project && !projects.some((entry) => entry.id === project.id)) projects.push(project);
                } else {
                  await planMapItem(item, projects);
                }
                persist(true);
              })();
            }
          },
          ...(item.link
            ? [
                {
                  id: 'project',
                  label: 'Open project',
                  onSelect: () => {
                    if (item?.link) location.hash = projectPageHash(item.link.id);
                  }
                }
              ]
            : []),
          {
            id: 'delete',
            label: 'Delete',
            danger: true,
            onSelect: () => {
              void (async () => {
                if (!item || !current) return;
                await deleteMapItemProject(item, projects);
                current.stations = current.stations.filter((entry) => entry.id !== item!.id);
                current.ticks = current.ticks.filter((entry) => entry.id !== item!.id);
                await tasksApi.updateMap(current.id, {
                  title: current.title,
                  year: current.year,
                  lines: current.lines,
                  stations: current.stations,
                  ticks: current.ticks
                });
                location.hash = '#/maps';
              })();
            }
          }
        ])
      );
      page.append(card, errorHost);
      canvas.replaceChildren(page);
    };

    paint();
  } catch (err) {
    renderLoadError(canvas, err, () => void renderMapItemPage(canvas, ref), 'Could not open card');
  }
}

export { mapItemPageHash };
