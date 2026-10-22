import { autoUpdateHubFloating, positionHubFloating } from '../../../../packages/design-kit/js/hub-floating.js';
import { loadAlignment } from './coverage-panel';
import { dotPointRef, focusAreaFor } from './coverage';
import { conceptKeyOf } from './model';
import type { Alignment, AlignmentPoint } from './schema';
import './coverage.css';

export type LessonDotPointsOptions = {
  dotPoints: readonly string[] | undefined;
  unitTitle?: string;
  focusArea?: string;
  onChange: (dotPoints: string[]) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const GROUPS = [['U', 'Understanding'], ['R', 'Responding']] as const;

/**
 * The syllabus dot points a lesson teaches, beside its line chips. Only the
 * chosen points show; more are added from a menu, so the row stays quiet.
 * The outcomes and concepts they reach follow from the alignment.
 */
export function mountLessonDotPoints(host: HTMLElement, options: LessonDotPointsOptions): { update(dotPoints: readonly string[] | undefined): void; dispose(): void } {
  let chosen = [...(options.dotPoints ?? [])];
  let doc: Alignment | null = null;
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
    options.onChange(chosen);
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
    root.replaceChildren(el('span', 'dots__label', 'Dot points'));
    const list = el('div', 'dots__chips');
    for (const ref of chosen) {
      const p = pointFor(ref);
      if (!p) continue;
      const chip = el('span', 'dots__chip');
      chip.title = p.text;
      chip.append(el('span', 'dots__chip-id', p.id), el('span', 'dots__chip-text', p.short));
      const x = el('button', 'dots__remove', '×');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${p.id}`);
      x.addEventListener('click', () => save(chosen.filter((r) => r !== ref)));
      chip.append(x);
      list.append(chip);
    }
    const add = el('button', 'dots__add', chosen.some((r) => pointFor(r)) ? 'Add' : 'Add dot point');
    add.type = 'button';
    add.setAttribute('aria-haspopup', 'menu');
    add.addEventListener('click', () => (menu ? closeMenu() : openMenu(add)));
    list.append(add);
    root.append(list);
    // What the chosen points reach, from the alignment.
    const picked = chosen.map(pointFor).filter((p): p is AlignmentPoint => Boolean(p));
    if (picked.length) {
      const outcomes = [...new Set(picked.flatMap((p) => p.outcomes.map((o) => o.n)))].sort((a, b) => a - b);
      const keys = new Set(picked.flatMap((p) => p.concepts.map((c) => conceptKeyOf(c.ref))));
      const concepts = doc.concepts.filter((c) => keys.has(c.key)).map((c) => c.name);
      root.append(el('span', 'dots__reach', `Reaches outcomes ${outcomes.join(', ') || 'none'}${concepts.length ? ` · ${concepts.join(', ')}` : ''}`));
    }
    root.hidden = false;
  }

  void loadAlignment()
    .then((loaded) => {
      doc = loaded;
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
    }
  };
}
