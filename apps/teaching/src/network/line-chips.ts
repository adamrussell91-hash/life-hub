import type { LineStop, NetworkLine } from '@/schemas/block';
import { lineColour } from './colour';
import { el } from './lines-editor';
import { MODE_LABEL, MODE_ORDER, autoDepth } from './model';
import { removeLineStop, toggleLineStop } from '@/alignment/auto-lines';

const LETTER = { introduced: 'I', reinforced: 'R', mastered: 'M' } as const;

/**
 * The lines a lesson serves, as chips in one row per mode. A tap on a
 * train or metro chip steps its depth round (introduced, reinforced,
 * mastered) and its × takes it off; a light-rail chip is on or off. An auto
 * stop with no depth of its own shows the map's: Introduced on the first
 * lesson on the line, Reinforced after.
 */
export function mountLineChips(
  host: HTMLElement,
  options: {
    lines: readonly NetworkLine[];
    stops: readonly LineStop[] | undefined;
    off?: readonly string[] | undefined;
    /** Lines a lesson before this one on the map stops on. */
    linesBefore?: ReadonlySet<string>;
    onChange: (stops: LineStop[], off: string[]) => void;
    /** The lines this lesson stops on, after each paint, for a summary. */
    onPaint?: (served: NetworkLine[]) => void;
  }
): { update(stops: readonly LineStop[] | undefined, off?: readonly string[] | undefined, lines?: readonly NetworkLine[]): void; dispose(): void } {
  let lines = [...options.lines];
  let stops = [...(options.stops ?? [])];
  let off = [...(options.off ?? [])];
  const root = el('div', 'net-chips');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Network lines this lesson serves');
  host.append(root);

  const seen = options.linesBefore ?? new Set<string>();
  const depthOf = (stop: LineStop): NonNullable<LineStop['level']> => stop.level ?? (stop.auto ? autoDepth(seen.has(stop.line_id)) : 'reinforced');
  const apply = (next: { stops: LineStop[]; off: string[] }) => {
    stops = next.stops;
    off = next.off;
    paint();
    options.onChange(stops, off);
  };
  const step = (line: NetworkLine) => {
    const stop = stops.find((s) => s.line_id === line.id);
    apply(toggleLineStop(stops, off, line, { wrap: true, ...(stop ? { shown: depthOf(stop) } : {}) }));
  };

  function paint(): void {
    root.replaceChildren();
    root.hidden = !lines.length;
    for (const mode of MODE_ORDER) {
      const ofMode = lines.filter((l) => l.mode === mode);
      if (!ofMode.length) continue;
      const group = el('div', 'net-chips__group');
      group.append(el('span', 'net-chips__mode', MODE_LABEL[mode]));
      for (const line of ofMode) {
        const stop = stops.find((s) => s.line_id === line.id);
        const depth = stop && line.mode !== 'light_rail' ? depthOf(stop) : null;
        const chip = el('button', `net-chip net-chip--${line.mode}${stop ? ' net-chip--on' : ''}${depth ? ' net-chip--paired' : ''}`);
        chip.type = 'button';
        chip.style.setProperty('--net-colour', lineColour(line.colour));
        chip.setAttribute('aria-pressed', String(Boolean(stop)));
        chip.title = `${MODE_LABEL[line.mode]}: ${line.name}${depth ? ` · ${depth}` : ''}${stop?.auto ? ' · from the dot points' : ''}`;
        chip.setAttribute('aria-label', `${line.name || 'Line'}, ${MODE_LABEL[line.mode].toLowerCase()}: ${stop ? depth ?? 'stops here' : 'not served'}`);
        chip.append(el('span', 'net-chip__name', line.name || 'Untitled line'));
        if (depth) chip.append(el('span', 'net-chip__depth', LETTER[depth]));
        chip.addEventListener('click', () => step(line));
        if (!depth) {
          group.append(chip);
          continue;
        }
        // A depth chip steps round its depths; its × takes the line off.
        const pair = el('span', 'net-chip-pair');
        const x = el('button', 'net-chip__off', '×');
        x.type = 'button';
        x.style.setProperty('--net-colour', lineColour(line.colour));
        x.setAttribute('aria-label', `Take ${line.name || 'this line'} off this lesson`);
        x.addEventListener('click', () => apply(removeLineStop(stops, off, line.id)));
        pair.append(chip, x);
        group.append(pair);
      }
      root.append(group);
    }
    options.onPaint?.(lines.filter((l) => stops.some((s) => s.line_id === l.id)));
  }
  paint();
  return {
    update(next, nextOff, nextLines) {
      stops = [...(next ?? [])];
      off = [...(nextOff ?? [])];
      if (nextLines) lines = [...nextLines];
      paint();
    },
    dispose() {
      root.remove();
    }
  };
}
