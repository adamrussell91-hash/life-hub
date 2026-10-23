import { autoUpdateHubFloating, positionHubFloating } from '../../../../packages/design-kit/js/hub-floating.js';
import { SKILLS } from '../../../../packages/problem-solver/skills.mjs';
import { loadSkills } from '@/skills/api';
import type { SkillsContinuum } from '@/skills/schema';
import type { AutoLineContext } from './auto-lines';
import { loadAlignment } from './coverage-panel';
import { dotPointRef, focusAreaFor } from './coverage';
import { conceptKeyOf } from './model';
import type { Alignment, AlignmentPoint } from './schema';
import './coverage.css';

export type LessonDotPointsOptions = {
  dotPoints: readonly string[] | undefined;
  unitTitle?: string;
  focusArea?: string;
  /** Where the full wording of what the chosen points ask for goes, to plan activities against. */
  planHost?: HTMLElement;
  /** The chosen point ids and outcomes they reach, after each paint, for a summary. */
  onPaint?: (summary: { points: string[]; outcomes: number[] }) => void;
  /** With the alignment the points were read against, so the page can set the lesson's lines. */
  onChange: (dotPoints: string[], ctx: AutoLineContext) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const GROUPS = [['U', 'Understanding'], ['R', 'Responding']] as const;

/**
 * The syllabus dot points a lesson teaches, one row each in full. More are
 * added from a menu. What the chosen points ask for (outcomes, core concept
 * bullets, learning processes, thinking skills) follows from the alignment,
 * in full and tagged with the points it comes from, into the plan host.
 */
export function mountLessonDotPoints(host: HTMLElement, options: LessonDotPointsOptions): { update(dotPoints: readonly string[] | undefined): void; dispose(): void } {
  let chosen = [...(options.dotPoints ?? [])];
  let doc: Alignment | null = null;
  let skills: SkillsContinuum | null = null;
  let area: { id: string; name: string } | null = null;
  let stopFloating: (() => void) | null = null;
  let menu: HTMLElement | null = null;
  const root = el('div', 'dots');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Syllabus dot points this lesson teaches');
  root.hidden = true;
  host.append(root);

  const pointsOf = (): AlignmentPoint[] => doc?.focus_areas.find((f) => f.id === area?.id)?.points ?? [];
  const pointFor = (ref: string) => (area && ref.startsWith(`${area.id}:`) ? pointsOf().find((p) => p.id === ref.slice(area!.id.length + 1)) : undefined);

  const closeMenu = () => {
    stopFloating?.();
    stopFloating = null;
    menu?.remove();
    menu = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey);
  };
  const onOutside = (event: PointerEvent) => {
    if (menu && !menu.contains(event.target as Node) && !(event.target as Element).closest?.('.dots__add')) closeMenu();
  };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };

  const save = (next: string[]) => {
    chosen = next.slice(0, 20);
    paint();
    if (doc && area) options.onChange(chosen, { doc, skills, areaId: area.id });
  };

  const openMenu = (anchor: HTMLElement) => {
    closeMenu();
    if (!area) return;
    const m = el('div', 'dots__menu');
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', `Dot points in ${area.name}`);
    m.append(el('p', 'dots__menu-area', area.name));
    for (const [kind, label] of GROUPS) {
      const rows = pointsOf().filter((p) => p.kind === kind && !chosen.includes(dotPointRef(area!.id, p.id)));
      if (!rows.length) continue;
      m.append(el('p', 'dots__menu-group', label));
      for (const p of rows) {
        const item = el('button', 'dots__menu-item');
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.append(el('span', 'dots__menu-id', p.id), el('span', 'dots__menu-text', p.short));
        item.title = p.text;
        item.addEventListener('click', () => {
          closeMenu();
          save([...chosen, dotPointRef(area!.id, p.id)]);
        });
        m.append(item);
      }
    }
    if (m.querySelectorAll('.dots__menu-item').length === 0) m.append(el('p', 'dots__menu-empty', 'Every dot point is already on this lesson.'));
    document.body.append(m);
    menu = m;
    const opts = { placement: 'bottom-start' as const, offset: 6, padding: 12 };
    void positionHubFloating(anchor, m, opts);
    stopFloating = autoUpdateHubFloating(anchor, m, opts);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey);
    m.querySelector<HTMLButtonElement>('.dots__menu-item')?.focus();
  };

  function paint(): void {
    if (!doc || !area) return;
    const list = el('ul', 'dots__list');
    for (const ref of chosen) {
      const p = pointFor(ref);
      if (!p) continue;
      const row = el('li', 'dots__row');
      const x = el('button', 'dots__remove', '×');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${p.id}`);
      x.addEventListener('click', () => save(chosen.filter((r) => r !== ref)));
      row.append(el('span', 'dots__id', p.id), el('span', 'dots__text', p.text), x);
      list.append(row);
    }
    const add = el('button', 'dots__add', '+ Add dot point');
    add.type = 'button';
    add.setAttribute('aria-haspopup', 'menu');
    add.addEventListener('click', () => (menu ? closeMenu() : openMenu(add)));
    root.replaceChildren(...(list.childElementCount ? [list] : []), add);
    root.hidden = false;
    const picked = chosen.map(pointFor).filter((p): p is AlignmentPoint => Boolean(p));
    paintPlan(picked);
    options.onPaint?.({ points: picked.map((p) => p.id), outcomes: [...new Set(picked.flatMap((p) => p.outcomes.map((o) => o.n)))].sort((a, b) => a - b) });
  }

  /** Each thing the chosen points ask for, in full, with the points it comes from. Concepts are the core links only, as on the map. */
  function paintPlan(picked: AlignmentPoint[]): void {
    const host = options.planHost;
    if (!host || !doc) return;
    host.replaceChildren();
    if (!picked.length) return;
    const from = (has: (p: AlignmentPoint) => boolean) => picked.filter(has).map((p) => p.id);
    const grid = el('div', 'dots-plan');
    const column = (label: string, items: Array<{ name: string; text?: string; bullets?: string[]; from: string[] }>) => {
      if (!items.length) return;
      const col = el('section', 'dots-plan__col');
      col.append(el('h5', 'dots-plan__head', label));
      const ul = el('ul', 'dots-plan__items');
      for (const item of items) {
        const li = el('li', 'dots-plan__item');
        const top = el('div', 'dots-plan__top');
        top.append(el('span', 'dots-plan__name', item.name));
        const tags = el('span', 'dots-plan__from');
        tags.setAttribute('aria-label', `From ${item.from.join(', ')}`);
        for (const id of item.from) tags.append(el('span', 'dots-plan__tag', id));
        top.append(tags);
        li.append(top);
        if (item.text) li.append(el('p', 'dots-plan__text', item.text));
        if (item.bullets?.length) {
          const bl = el('ul', 'dots-plan__bullets');
          for (const b of item.bullets) bl.append(el('li', undefined, b));
          li.append(bl);
        }
        ul.append(li);
      }
      col.append(ul);
      grid.append(col);
    };
    const outcomeNs = new Set(picked.flatMap((p) => p.outcomes.map((o) => o.n)));
    column('Outcomes', doc.outcomes.filter((o) => outcomeNs.has(o.n)).map((o) => ({
      name: o.code,
      text: o.text,
      from: from((p) => p.outcomes.some((x) => x.n === o.n))
    })));
    const refs = new Set(picked.flatMap((p) => p.concepts.filter((c) => c.link === 'shared').map((c) => c.ref)));
    column('Concepts', doc.concepts.filter((c) => [...refs].some((r) => conceptKeyOf(r) === c.key)).map((c) => ({
      name: c.name,
      bullets: c.bullets.filter((b) => refs.has(c.key + b.n)).map((b) => b.text),
      from: from((p) => p.concepts.some((x) => x.link === 'shared' && conceptKeyOf(x.ref) === c.key))
    })));
    const codes = new Set(picked.flatMap((p) => p.processes));
    column('Processes', doc.processes.filter((p) => codes.has(p.code)).map((proc) => ({
      name: proc.name,
      text: proc.text,
      from: from((p) => p.processes.includes(proc.code))
    })));
    const ids = new Set(picked.flatMap((p) => p.skills ?? []));
    column('Thinking skills', SKILLS.filter((k) => ids.has(k.id)).map((k) => ({
      name: k.name,
      text: k.description,
      from: from((p) => (p.skills ?? []).includes(k.id))
    })));
    host.append(grid);
  }

  void Promise.all([loadAlignment(), loadSkills().catch((): SkillsContinuum | null => null)])
    .then(([loaded, continuum]) => {
      doc = loaded;
      skills = continuum;
      area = focusAreaFor(loaded, options.unitTitle, options.focusArea);
      paint();
    })
    .catch(() => { /* No alignment: nothing to tag. */ });

  return {
    update(next) {
      chosen = [...(next ?? [])];
      paint();
    },
    dispose() {
      closeMenu();
      root.remove();
      options.planHost?.replaceChildren();
    }
  };
}
