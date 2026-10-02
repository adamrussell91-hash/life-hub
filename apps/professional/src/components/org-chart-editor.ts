/**
 * Drag-and-connect org chart editor (Lucidchart-style) for an organisation.
 *
 * - Every box is a role (Position), optionally held by a person.
 * - Drag a box to move it; positions are saved.
 * - Drag from a box's ● handle onto another box to draw a line, then pick
 *   what the line means (reports to / works with / shares authority).
 * - Click a line to flip, change or remove it.
 * - Everything also works without dragging (inspector panel), so it is
 *   usable at phone width and from the keyboard.
 *
 * Writes go through `/api/org-structure`; this module never assembles a
 * relationship the server has not stored.
 */

import {
  archiveOrgPosition,
  createOrgPosition,
  createOrgStructureLink,
  createOrgUnit,
  endOrgStructureLink,
  fetchOrgStructure,
  patchOrgPosition,
  saveOrgLayout,
  type OrgStructurePayload
} from '@/api/org-structure';
import { searchEntities } from '@/api/entities';
import { el } from '@/components/org-ui';
import {
  BOX_H,
  BOX_W,
  LINE_KIND_LABELS,
  boardSize,
  boxLabel,
  buildChartModel,
  describeLine,
  linePath,
  nextFreeSpot,
  resolveLayout,
  snap,
  type ChartBox,
  type ChartLine,
  type ChartLineKind,
  type ChartPoint
} from '@/domain/org-chart-model';

export interface OrgChartEditorOptions {
  organisationId: string;
  organisationRef: string;
  organisationName: string;
  structure: OrgStructurePayload | null;
  /** Names for people already known to the page (fallback for holders). */
  peopleNames?: Record<string, string>;
  /** Opens the older units / members / exceptions sheet. */
  onOpenAdvanced?: () => void;
  /** Called when the editor closes after at least one change. */
  onChanged: () => void | Promise<void>;
  onClose: () => void;
}

type Selection =
  | { kind: 'none' }
  | { kind: 'box'; ref: string }
  | { kind: 'line'; id: string }
  | { kind: 'connect'; from: string; to: string };

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_SCALE = 0.4;
const MAX_SCALE = 1.8;

function button(label: string, className = 'btn btn--ghost'): HTMLButtonElement {
  const b = el('button', className, label) as HTMLButtonElement;
  b.type = 'button';
  return b;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const lab = el('label', 'org-chart__field');
  lab.append(el('span', 'org-chart__field-label', label), control);
  return lab;
}

function textInput(placeholder: string, value = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'orgs-page__input org-chart__input';
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

/**
 * Inline person search: type a name, pick a result. Any person in Life Hub,
 * not just people already linked to this organisation.
 */
function personPicker(
  onPick: (person: { ref: string; name: string }) => void,
  placeholder = 'Search people…'
): HTMLElement {
  const wrap = el('div', 'org-chart__picker');
  const input = textInput(placeholder);
  input.setAttribute('aria-label', placeholder);
  input.setAttribute('autocomplete', 'off');
  const results = el('div', 'org-chart__picker-results');
  results.setAttribute('role', 'listbox');
  wrap.append(input, results);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      results.replaceChildren();
      return;
    }
    timer = setTimeout(() => {
      controller?.abort();
      controller = new AbortController();
      void searchEntities(q, 'person', { signal: controller.signal })
        .then(({ groups }) => {
          results.replaceChildren();
          const people = (groups.person ?? []).slice(0, 8);
          if (!people.length) {
            results.append(el('p', 'org-chart__muted', 'No one found. Add them on the People page first.'));
            return;
          }
          for (const person of people) {
            const opt = button('', 'org-chart__picker-opt');
            opt.setAttribute('role', 'option');
            opt.append(el('span', undefined, person.display_label));
            if (person.supporting_label) opt.append(el('span', 'org-chart__muted', person.supporting_label));
            opt.addEventListener('click', () => {
              input.value = '';
              results.replaceChildren();
              onPick({ ref: person.ref, name: person.display_label });
            });
            results.append(opt);
          }
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === 'AbortError') return;
          results.replaceChildren(el('p', 'org-chart__muted', 'Search failed. Try again.'));
        });
    }, 200);
  });
  return wrap;
}

export function openOrgChartEditor(options: OrgChartEditorOptions): HTMLElement {
  let structure = options.structure;
  let changed = false;
  let selection: Selection = { kind: 'none' };
  let scale = 1;
  let positions: Record<string, ChartPoint> = {};
  let model: { boxes: ChartBox[]; lines: ChartLine[] } = { boxes: [], lines: [] };
  let busy = false;
  let layoutTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingLayout: Record<string, ChartPoint> = {};

  const root = el('div', 'org-chart');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Edit chart — ${options.organisationName}`);

  // --- Header ---
  const head = el('div', 'org-chart__head');
  const titleWrap = el('div', 'org-chart__title');
  titleWrap.append(el('h2', undefined, 'Edit chart'), el('span', 'org-chart__muted', options.organisationName));
  const headActions = el('div', 'org-chart__head-actions');
  const addPersonBtn = button('+ Person', 'btn btn--primary');
  const addRoleBtn = button('+ Empty role');
  const addUnitBtn = button('+ Faculty / team');
  addUnitBtn.title = 'Add a container (faculty, team, department) that boxes can sit inside';
  const tidyBtn = button('Tidy up');
  tidyBtn.title = 'Re-arrange every box by who reports to whom';
  const doneBtn = button('Done', 'btn btn--primary');
  headActions.append(addPersonBtn, addRoleBtn, addUnitBtn, tidyBtn);
  if (options.onOpenAdvanced) {
    const advanced = button('Units & members…');
    advanced.addEventListener('click', () => {
      close();
      options.onOpenAdvanced?.();
    });
    headActions.append(advanced);
  }
  headActions.append(doneBtn);
  head.append(titleWrap, headActions);

  // --- Body: canvas + inspector ---
  const body = el('div', 'org-chart__body');
  const canvasCol = el('div', 'org-chart__canvas-col');
  const hint = el(
    'p',
    'org-chart__hint',
    'Drag a box to move it. Drag from a box’s ● onto another box to connect them. Click a line to change it.'
  );
  const zoomRow = el('div', 'org-chart__zoom');
  const zoomOut = button('−');
  const zoomIn = button('+');
  const zoomFit = button('Fit');
  zoomOut.setAttribute('aria-label', 'Zoom out');
  zoomIn.setAttribute('aria-label', 'Zoom in');
  zoomFit.setAttribute('aria-label', 'Reset zoom');
  zoomRow.append(zoomOut, zoomIn, zoomFit);
  const viewport = el('div', 'org-chart__viewport');
  const sizer = el('div', 'org-chart__sizer');
  const board = el('div', 'org-chart__board');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'org-chart__lines');
  const boxLayer = el('div', 'org-chart__boxes');
  board.append(svg, boxLayer);
  sizer.append(board);
  viewport.append(sizer);
  const status = el('p', 'org-chart__status');
  status.setAttribute('role', 'status');
  canvasCol.append(hint, zoomRow, viewport, status);

  const inspector = el('aside', 'org-chart__inspector');
  inspector.setAttribute('aria-label', 'Chart details');
  body.append(canvasCol, inspector);
  root.append(head, body);

  // --- helpers ---
  function setStatus(text: string): void {
    status.textContent = text;
  }

  function boxByRef(ref: string): ChartBox | undefined {
    return model.boxes.find((b) => b.ref === ref);
  }

  function rebuildModel(): void {
    if (!structure) {
      model = { boxes: [], lines: [] };
      positions = {};
      return;
    }
    model = buildChartModel(structure, options.peopleNames ?? {});
    const saved = { ...(structure.layout ?? {}), ...pendingLayout };
    positions = resolveLayout(model.boxes, model.lines, saved);
  }

  async function reload(): Promise<void> {
    structure = await fetchOrgStructure(options.organisationId);
    rebuildModel();
    if (selection.kind === 'box' && !boxByRef(selection.ref)) selection = { kind: 'none' };
    if (selection.kind === 'line' && !model.lines.some((l) => l.id === (selection as { id: string }).id)) {
      selection = { kind: 'none' };
    }
    paint();
  }

  /** Run one write, then reload from the server so the chart shows what was stored. */
  async function mutate(label: string, work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    root.classList.add('is-busy');
    setStatus(`${label}…`);
    try {
      await work();
      changed = true;
      await reload();
      setStatus('Saved.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save that change.');
    } finally {
      busy = false;
      root.classList.remove('is-busy');
    }
  }

  function queueLayoutSave(ref: string, point: ChartPoint): void {
    pendingLayout[ref] = point;
    if (layoutTimer) clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => void flushLayout(), 500);
  }

  async function flushLayout(): Promise<void> {
    if (layoutTimer) {
      clearTimeout(layoutTimer);
      layoutTimer = null;
    }
    const batch = { ...pendingLayout };
    if (!Object.keys(batch).length) return;
    try {
      const saved = await saveOrgLayout(options.organisationId, batch);
      if (structure) structure.layout = saved;
      for (const key of Object.keys(batch)) {
        if (pendingLayout[key] === batch[key]) delete pendingLayout[key];
      }
      changed = true;
    } catch (err) {
      setStatus(err instanceof Error ? `Could not save positions: ${err.message}` : 'Could not save positions.');
    }
  }

  function applyScale(): void {
    const { width, height } = boardSize(positions);
    board.style.width = `${width}px`;
    board.style.height = `${height}px`;
    board.style.transform = `scale(${scale})`;
    sizer.style.width = `${Math.ceil(width * scale)}px`;
    sizer.style.height = `${Math.ceil(height * scale)}px`;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  function boardPoint(ev: PointerEvent): ChartPoint {
    const rect = board.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) / scale, y: (ev.clientY - rect.top) / scale };
  }

  // --- painting ---
  function paintLines(): void {
    svg.replaceChildren();
    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 'org-chart-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    const tip = document.createElementNS(SVG_NS, 'path');
    tip.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    tip.setAttribute('class', 'org-chart__arrow');
    marker.append(tip);
    defs.append(marker);
    svg.append(defs);

    for (const line of model.lines) {
      const from = positions[line.source];
      const to = positions[line.target];
      if (!from || !to) continue;
      const d = linePath(line.kind, from, to);
      const selected = selection.kind === 'line' && selection.id === line.id;
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', `org-chart__line org-chart__line--${line.kind}${selected ? ' is-selected' : ''}`);
      const visible = document.createElementNS(SVG_NS, 'path');
      visible.setAttribute('d', d);
      visible.setAttribute('class', 'org-chart__line-stroke');
      if (line.kind === 'reports_to') visible.setAttribute('marker-start', 'url(#org-chart-arrow)');
      const hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'org-chart__line-hit');
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', describeLine(line, model.boxes));
      const pick = () => {
        selection = { kind: 'line', id: line.id };
        paint();
      };
      hit.addEventListener('click', pick);
      hit.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter' || (ev as KeyboardEvent).key === ' ') {
          ev.preventDefault();
          pick();
        }
      });
      group.append(visible, hit);
      svg.append(group);
    }
  }

  function paintBoxes(): void {
    boxLayer.replaceChildren();
    for (const box of model.boxes) {
      const p = positions[box.ref];
      if (!p) continue;
      const node = el('div', 'org-chart__box');
      node.dataset.box = box.ref;
      node.style.left = `${p.x}px`;
      node.style.top = `${p.y}px`;
      node.style.width = `${BOX_W}px`;
      node.style.height = `${BOX_H}px`;
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', `${boxLabel(box)}. Press Enter to edit.`);
      node.title = [box.holderName, box.title, box.unitName].filter(Boolean).join(' · ');
      if (!box.holderRef) node.classList.add('is-vacant');
      if (
        (selection.kind === 'box' && selection.ref === box.ref) ||
        (selection.kind === 'connect' && (selection.from === box.ref || selection.to === box.ref))
      ) {
        node.classList.add('is-selected');
      }
      node.append(
        el('span', 'org-chart__box-name', box.holderName ?? 'Vacant'),
        el('span', 'org-chart__box-title', box.title)
      );
      if (box.unitName) node.append(el('span', 'org-chart__box-unit', box.unitName));
      const handle = el('span', 'org-chart__handle');
      handle.title = 'Drag onto another box to connect';
      handle.setAttribute('aria-hidden', 'true');
      node.append(handle);
      node.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          selection = { kind: 'box', ref: box.ref };
          paint();
        }
      });
      wireBoxPointer(node, handle, box);
      boxLayer.append(node);
    }
    if (!model.boxes.length) {
      const empty = el('div', 'org-chart__empty');
      empty.append(
        el('p', undefined, 'No one on the chart yet.'),
        el('p', 'org-chart__muted', 'Start with “+ Person”, e.g. the principal, then add the people who report to them.')
      );
      boxLayer.append(empty);
    }
  }

  function paint(): void {
    applyScale();
    paintLines();
    paintBoxes();
    paintInspector();
  }

  // --- pointer: move boxes and draw connections ---
  function wireBoxPointer(node: HTMLElement, handle: HTMLElement, box: ChartBox): void {
    node.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || busy) return;
      const onHandle = ev.target === handle;
      ev.preventDefault();
      node.setPointerCapture(ev.pointerId);
      const start = boardPoint(ev);
      const origin = { ...positions[box.ref]! };
      let moved = false;
      let ghost: SVGPathElement | null = null;

      const onMove = (mv: PointerEvent) => {
        const pt = boardPoint(mv);
        const dx = pt.x - start.x;
        const dy = pt.y - start.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        if (onHandle) {
          if (!ghost) {
            ghost = document.createElementNS(SVG_NS, 'path');
            ghost.setAttribute('class', 'org-chart__ghost');
            svg.append(ghost);
          }
          const sx = origin.x + BOX_W;
          const sy = origin.y + BOX_H / 2;
          ghost.setAttribute('d', `M ${sx} ${sy} L ${pt.x} ${pt.y}`);
          return;
        }
        const next = { x: snap(origin.x + dx), y: snap(origin.y + dy) };
        positions[box.ref] = next;
        node.style.left = `${next.x}px`;
        node.style.top = `${next.y}px`;
        paintLines();
      };

      const onUp = (up: PointerEvent) => {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onUp);
        ghost?.remove();
        if (onHandle && moved) {
          const hitEl = document.elementFromPoint(up.clientX, up.clientY);
          const targetRef = (hitEl?.closest('[data-box]') as HTMLElement | null)?.dataset.box;
          if (targetRef && targetRef !== box.ref) {
            selection = { kind: 'connect', from: box.ref, to: targetRef };
          } else {
            setStatus('Drop the line onto another box to connect them.');
          }
          paint();
          return;
        }
        if (moved) {
          queueLayoutSave(box.ref, positions[box.ref]!);
          applyScale();
          return;
        }
        selection = { kind: 'box', ref: box.ref };
        paint();
      };

      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
      node.addEventListener('pointercancel', onUp);
    });
  }

  viewport.addEventListener('pointerdown', (ev) => {
    if (
      ev.target === viewport ||
      ev.target === sizer ||
      ev.target === board ||
      ev.target === boxLayer ||
      ev.target === svg
    ) {
      if (selection.kind !== 'none') {
        selection = { kind: 'none' };
        paint();
      }
    }
  });

  // --- writes ---
  async function createLine(kind: ChartLineKind, source: string, target: string): Promise<void> {
    await createOrgStructureLink({
      organisation_ref: options.organisationRef,
      relationship_type: kind,
      source_ref: source,
      target_ref: target
    });
  }

  async function endLine(id: string): Promise<void> {
    await endOrgStructureLink({ organisation_ref: options.organisationRef, link_id: id });
  }

  async function assignPerson(box: ChartBox, personRef: string): Promise<void> {
    if (box.holderLinkId) await endLine(box.holderLinkId);
    await createOrgStructureLink({
      organisation_ref: options.organisationRef,
      relationship_type: 'holds_position',
      source_ref: personRef,
      target_ref: box.ref
    });
  }

  async function addBox(title: string, personRef: string | null): Promise<string> {
    const position = await createOrgPosition({ organisation_ref: options.organisationRef, title });
    const ref = `shared:position:${position.id}`;
    const spot = nextFreeSpot(positions);
    pendingLayout[ref] = spot;
    positions[ref] = spot;
    if (personRef) {
      await createOrgStructureLink({
        organisation_ref: options.organisationRef,
        relationship_type: 'holds_position',
        source_ref: personRef,
        target_ref: ref
      });
    }
    await flushLayout();
    return ref;
  }

  // --- inspector ---
  function paintInspector(): void {
    inspector.replaceChildren();
    if (selection.kind === 'connect') return paintConnect(selection.from, selection.to);
    if (selection.kind === 'line') {
      const line = model.lines.find((l) => l.id === (selection as { id: string }).id);
      if (line) return paintLine(line);
    }
    if (selection.kind === 'box') {
      const box = boxByRef(selection.ref);
      if (box) return paintBox(box);
    }
    paintAdd();
  }

  function paintAdd(focus: 'person' | 'role' | 'unit' | null = null): void {
    inspector.replaceChildren();
    inspector.append(el('h3', undefined, 'Add someone'));
    const title = textInput('Their role, e.g. Head of English');
    let picked: { ref: string; name: string } | null = null;
    const pickedLine = el('p', 'org-chart__muted', 'No one picked yet.');
    const add = button('Add to chart', 'btn btn--primary');
    add.disabled = true;
    const picker = personPicker((person) => {
      picked = person;
      pickedLine.textContent = `Picked: ${person.name}`;
      add.disabled = false;
      title.focus();
    });
    add.addEventListener('click', () => {
      if (!picked) return;
      const person = picked;
      void mutate('Adding', async () => {
        const ref = await addBox(title.value.trim() || 'Member', person.ref);
        selection = { kind: 'box', ref };
      });
    });
    inspector.append(field('Person', picker), pickedLine, field('Role', title), add);

    inspector.append(el('h3', undefined, 'Add an empty role'));
    const roleTitle = textInput('e.g. Business manager');
    const addRole = button('Add role');
    addRole.addEventListener('click', () => {
      const t = roleTitle.value.trim();
      if (!t) {
        setStatus('Give the role a name first.');
        roleTitle.focus();
        return;
      }
      void mutate('Adding', async () => {
        const ref = await addBox(t, null);
        selection = { kind: 'box', ref };
      });
    });
    inspector.append(field('Role name', roleTitle), addRole);

    // Containers (faculties, teams…). Boxes join one from their own panel.
    inspector.append(el('h3', undefined, 'Add a faculty or team'));
    const unitName = textInput('e.g. Learning Enrichment Faculty');
    unitName.setAttribute('aria-label', 'Faculty or team name');
    const unitKind = document.createElement('select');
    unitKind.className = 'org-chart__select';
    unitKind.setAttribute('aria-label', 'Kind');
    for (const [value, label] of [
      ['faculty', 'Faculty'],
      ['team', 'Team'],
      ['department', 'Department'],
      ['program', 'Program'],
      ['leadership', 'Leadership'],
      ['board', 'Board'],
      ['other', 'Other']
    ]) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      unitKind.append(opt);
    }
    const addUnit = button('Add faculty / team');
    addUnit.addEventListener('click', () => {
      const name = unitName.value.trim();
      if (!name) {
        setStatus('Give the faculty or team a name first.');
        unitName.focus();
        return;
      }
      void mutate('Adding', async () => {
        await createOrgUnit({
          organisation_ref: options.organisationRef,
          name,
          unit_kind: unitKind.value,
          order: structure?.units.length ?? 0
        });
      }).then(() => {
        if (status.textContent === 'Saved.') {
          setStatus(`${name} added. Click a box and choose it under “Unit / team” to put that person in it.`);
        }
      });
    });
    inspector.append(field('Name', unitName), field('Kind', unitKind), addUnit);
    const activeUnits = (structure?.units ?? []).filter((u) => u.lifecycle_status === 'active');
    if (activeUnits.length) {
      inspector.append(
        el('p', 'org-chart__muted', `Already here: ${activeUnits.map((u) => u.name).join(', ')}.`)
      );
    }

    // People whose profile says they work here but who aren't on the chart
    // (no job title yet, or you took their box off). One click adds them.
    const offChart = (structure?.people_here ?? []).filter((p) => !p.on_chart);
    if (offChart.length) {
      inspector.append(
        el('h3', undefined, `At ${options.organisationName}, not on the chart`),
        el('p', 'org-chart__muted', 'From their profiles. Add a role and they go on the chart.')
      );
      const list = el('ul', 'org-chart__here-list');
      for (const person of offChart.slice(0, 40)) {
        const li = el('li', 'org-chart__here');
        const name = person.display_name ?? 'Someone';
        const role = textInput('Role', person.job_title ?? '');
        role.setAttribute('aria-label', `Role for ${name}`);
        const addBtn = button('Add');
        addBtn.setAttribute('aria-label', `Add ${name} to the chart`);
        addBtn.addEventListener('click', () => {
          const t = role.value.trim();
          if (!t) {
            setStatus(`Give ${name} a role first.`);
            role.focus();
            return;
          }
          void mutate('Adding', async () => {
            const ref = await addBox(t, person.person_ref);
            selection = { kind: 'box', ref };
          });
        });
        const row = el('div', 'org-chart__row');
        row.append(role, addBtn);
        li.append(el('span', 'org-chart__here-name', name), row);
        list.append(li);
      }
      inspector.append(list);
    }

    const legend = el('div', 'org-chart__legend');
    legend.append(el('h3', undefined, 'Lines'));
    for (const kind of ['reports_to', 'works_with', 'shares_authority_with'] as ChartLineKind[]) {
      const row = el('div', `org-chart__legend-row org-chart__legend-row--${kind}`);
      row.append(el('span', 'org-chart__legend-swatch'), el('span', undefined, LINE_KIND_LABELS[kind]));
      legend.append(row);
    }
    inspector.append(legend);

    if (focus === 'person') (picker.querySelector('input') as HTMLInputElement | null)?.focus();
    if (focus === 'role') roleTitle.focus();
    if (focus === 'unit') unitName.focus();
  }

  function paintBox(box: ChartBox): void {
    inspector.append(el('h3', undefined, box.holderName ?? 'Vacant role'));

    const title = textInput('Role title', box.title);
    const saveTitle = button('Rename');
    saveTitle.addEventListener('click', () => {
      const t = title.value.trim();
      if (!t || t === box.title) return;
      void mutate('Renaming', async () => {
        await patchOrgPosition(box.id, { title: t });
      });
    });
    const titleRow = el('div', 'org-chart__row');
    titleRow.append(title, saveTitle);
    inspector.append(field('Role', titleRow));
    if (box.holderName) {
      inspector.append(
        el('p', 'org-chart__muted', `This is ${box.holderName}’s job title on their profile — renaming updates both.`)
      );
    }

    // Person in this role
    const personBlock = el('div', 'org-chart__block');
    personBlock.append(el('span', 'org-chart__field-label', 'Person in this role'));
    if (box.holderRef) {
      const holderRow = el('div', 'org-chart__row');
      const id = box.holderRef.split(':')[2] ?? '';
      const link = el('a', undefined, box.holderName ?? 'Open profile') as HTMLAnchorElement;
      link.href = `#/people/${encodeURIComponent(id)}`;
      const clear = button('Remove from role');
      clear.addEventListener('click', () => {
        const linkId = box.holderLinkId;
        if (!linkId) return;
        void mutate('Removing', () => endLine(linkId));
      });
      holderRow.append(link, clear);
      personBlock.append(holderRow);
    }
    personBlock.append(
      personPicker(
        (person) => void mutate('Saving', () => assignPerson(box, person.ref)),
        box.holderRef ? 'Replace with…' : 'Who holds this role?'
      ),
      el('p', 'org-chart__muted', `Whoever you pick gets “${box.title}” as their job title here.`)
    );
    inspector.append(personBlock);

    // Unit
    if (structure?.units.length) {
      const unitSel = document.createElement('select');
      unitSel.className = 'org-chart__select';
      unitSel.append(new Option('No unit', ''));
      for (const u of structure.units.filter((x) => x.lifecycle_status === 'active')) {
        const ref = `shared:unit:${u.id}`;
        unitSel.append(new Option(u.name, ref, false, ref === box.unitRef));
      }
      unitSel.addEventListener('change', () => {
        void mutate('Saving', async () => {
          await patchOrgPosition(box.id, { unit_ref: unitSel.value || null });
        });
      });
      inspector.append(field('Unit / team', unitSel));
    }

    // Connect without dragging
    const others = model.boxes.filter((b) => b.ref !== box.ref);
    if (others.length) {
      const kindSel = document.createElement('select');
      kindSel.className = 'org-chart__select';
      kindSel.append(
        new Option('reports to', 'reports_to'),
        new Option('manages', 'manages'),
        new Option('works with', 'works_with'),
        new Option('shares authority with', 'shares_authority_with')
      );
      const otherSel = document.createElement('select');
      otherSel.className = 'org-chart__select';
      for (const b of others) otherSel.append(new Option(boxLabel(b), b.ref));
      const connect = button('Add line');
      connect.addEventListener('click', () => {
        const other = otherSel.value;
        const k = kindSel.value;
        void mutate('Connecting', () =>
          k === 'manages'
            ? createLine('reports_to', other, box.ref)
            : createLine(k as ChartLineKind, box.ref, other)
        );
      });
      const connectBlock = el('div', 'org-chart__block');
      connectBlock.append(
        el('span', 'org-chart__field-label', `Connect ${box.holderName ?? box.title}`),
        kindSel,
        otherSel,
        connect
      );
      inspector.append(connectBlock);
    }

    // Existing lines
    const mine = model.lines.filter((l) => l.source === box.ref || l.target === box.ref);
    if (mine.length) {
      const list = el('ul', 'org-chart__line-list');
      for (const line of mine) {
        const li = el('li');
        const open = button(describeLine(line, model.boxes), 'org-chart__line-link');
        open.addEventListener('click', () => {
          selection = { kind: 'line', id: line.id };
          paint();
        });
        const remove = button('Remove');
        remove.setAttribute('aria-label', `Remove: ${describeLine(line, model.boxes)}`);
        remove.addEventListener('click', () => void mutate('Removing', () => endLine(line.id)));
        li.append(open, remove);
        list.append(li);
      }
      inspector.append(el('span', 'org-chart__field-label', 'Lines'), list);
    }

    const del = button('Delete this box', 'btn btn--ghost org-chart__danger');
    del.addEventListener('click', () => {
      if (!window.confirm(`Remove “${boxLabel(box)}” from the chart? Its lines are removed too.`)) return;
      void mutate('Removing', async () => {
        await archiveOrgPosition({ organisation_ref: options.organisationRef, position_id: box.id });
        delete pendingLayout[box.ref];
        selection = { kind: 'none' };
      });
    });
    const back = button('← Add someone');
    back.addEventListener('click', () => {
      selection = { kind: 'none' };
      paint();
    });
    inspector.append(del, back);
  }

  function paintLine(line: ChartLine): void {
    inspector.append(el('h3', undefined, LINE_KIND_LABELS[line.kind]), el('p', undefined, describeLine(line, model.boxes)));
    const actions = el('div', 'org-chart__stack');
    if (line.kind === 'reports_to') {
      const flip = button('Flip direction');
      flip.addEventListener('click', () =>
        void mutate('Flipping', async () => {
          await endLine(line.id);
          await createLine('reports_to', line.target, line.source);
        })
      );
      actions.append(flip);
    }
    for (const kind of ['reports_to', 'works_with', 'shares_authority_with'] as ChartLineKind[]) {
      if (kind === line.kind) continue;
      const change = button(`Change to “${LINE_KIND_LABELS[kind].toLowerCase()}”`);
      change.addEventListener('click', () =>
        void mutate('Changing', async () => {
          await endLine(line.id);
          await createLine(kind, line.source, line.target);
        })
      );
      actions.append(change);
    }
    const remove = button('Remove line', 'btn btn--ghost org-chart__danger');
    remove.addEventListener('click', () =>
      void mutate('Removing', async () => {
        await endLine(line.id);
        selection = { kind: 'none' };
      })
    );
    const back = button('Close');
    back.addEventListener('click', () => {
      selection = { kind: 'none' };
      paint();
    });
    actions.append(remove, back);
    inspector.append(actions);
  }

  function paintConnect(fromRef: string, toRef: string): void {
    const a = boxByRef(fromRef);
    const b = boxByRef(toRef);
    if (!a || !b) {
      selection = { kind: 'none' };
      paintAdd();
      return;
    }
    inspector.append(el('h3', undefined, 'How are they connected?'));
    const actions = el('div', 'org-chart__stack');
    const choices: Array<{ label: string; run: () => Promise<void> }> = [
      { label: `${boxLabel(a)} reports to ${boxLabel(b)}`, run: () => createLine('reports_to', a.ref, b.ref) },
      { label: `${boxLabel(b)} reports to ${boxLabel(a)}`, run: () => createLine('reports_to', b.ref, a.ref) },
      { label: 'They work together', run: () => createLine('works_with', a.ref, b.ref) },
      { label: 'They share authority', run: () => createLine('shares_authority_with', a.ref, b.ref) }
    ];
    choices.forEach((choice, i) => {
      const btn = button(choice.label, i === 0 ? 'btn btn--primary org-chart__choice' : 'btn btn--ghost org-chart__choice');
      btn.addEventListener('click', () =>
        void mutate('Connecting', async () => {
          await choice.run();
          selection = { kind: 'none' };
        })
      );
      actions.append(btn);
    });
    const cancel = button('Cancel');
    cancel.addEventListener('click', () => {
      selection = { kind: 'none' };
      paint();
    });
    actions.append(cancel);
    inspector.append(actions);
    (actions.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  // --- header + zoom wiring ---
  addPersonBtn.addEventListener('click', () => {
    selection = { kind: 'none' };
    paint();
    paintAdd('person');
  });
  addRoleBtn.addEventListener('click', () => {
    selection = { kind: 'none' };
    paint();
    paintAdd('role');
  });
  addUnitBtn.addEventListener('click', () => {
    selection = { kind: 'none' };
    paint();
    paintAdd('unit');
  });
  tidyBtn.addEventListener('click', () => {
    const fresh = resolveLayout(model.boxes, model.lines, {});
    positions = fresh;
    for (const [ref, point] of Object.entries(fresh)) pendingLayout[ref] = point;
    paint();
    void flushLayout().then(() => setStatus('Tidied.'));
  });
  zoomIn.addEventListener('click', () => {
    scale = Math.min(MAX_SCALE, +(scale + 0.15).toFixed(2));
    applyScale();
  });
  zoomOut.addEventListener('click', () => {
    scale = Math.max(MIN_SCALE, +(scale - 0.15).toFixed(2));
    applyScale();
  });
  zoomFit.addEventListener('click', () => {
    scale = 1;
    applyScale();
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  });

  function close(): void {
    void flushLayout().finally(() => {
      document.removeEventListener('keydown', onKey);
      options.onClose();
      if (changed) void options.onChanged();
    });
  }
  doneBtn.addEventListener('click', () => close());

  function onKey(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') return;
    // Escape in a text box clears it (then leaves it); it never throws away
    // the whole editor mid-typing.
    const target = ev.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.value) {
        target.value = '';
        target.dispatchEvent(new Event('input'));
      } else {
        target.blur();
      }
      return;
    }
    if (selection.kind !== 'none') {
      selection = { kind: 'none' };
      paint();
      return;
    }
    close();
  }
  document.addEventListener('keydown', onKey);

  rebuildModel();
  paint();
  if (!structure) void reload().catch(() => setStatus('Could not load the chart.'));
  return root;
}
