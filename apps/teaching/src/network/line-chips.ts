import type { LineStop, NetworkLine } from '@/schemas/block';
import { lineColour } from './colour';
import { el } from './lines-editor';
import { MODE_LABEL, MODE_ORDER } from './model';
import { toggleLineStop } from '@/alignment/auto-lines';

const LETTER = { introduced: 'I', reinforced: 'R', mastered: 'M' } as const;

/**
 * The lines a lesson serves, as a row of chips grouped by mode. A tap on a
 * train or metro chip steps its depth (introduced, reinforced, mastered, off);
 * a light-rail chip is on or off. Stops set from the dot points say so.
 */
export function mountLineChips(
  host: HTMLElement,
  options: {
    lines: readonly NetworkLine[];
    stops: readonly LineStop[] | undefined;
    off?: readonly string[] | undefined;
    onChange: (stops: LineStop[], off: string[]) => void;
  }
): { update(stops: readonly LineStop[] | undefined, off?: readonly string[] | undefined, lines?: readonly NetworkLine[]): void; dispose(): void } {
  let lines = [...options.lines];
  let stops = [...(options.stops ?? [])];
  let off = [...(options.off ?? [])];
  const root = el('div', 'net-chips');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Network lines this lesson serves');
  host.append(root);

  const step = (line: NetworkLine) => {
    const next = toggleLineStop(stops, off, line);
    stops = next.stops;
    off = next.off;
    paint();
    options.onChange(stops, off);
  };

  function paint(): void {
    root.replaceChildren();
    root.hidden = !lines.length;
    root.append(el('span', 'net-chips__label', 'Lines'));
    for (const mode of MODE_ORDER) {
      for (const line of lines.filter((l) => l.mode === mode)) {
        const stop = stops.find((s) => s.line_id === line.id);
        const chip = el('button', `net-chip net-chip--${line.mode}${stop ? ' net-chip--on' : ''}`);
        chip.type = 'button';
        chip.style.setProperty('--net-colour', lineColour(line.colour));
        chip.setAttribute('aria-pressed', String(Boolean(stop)));
        const depth = stop && line.mode !== 'light_rail' ? stop.level ?? 'reinforced' : null;
        chip.title = `${MODE_LABEL[line.mode]}: ${line.name}${depth ? ` · ${depth}` : ''}${stop?.auto ? ' · from the dot points' : ''}`;
        chip.setAttribute('aria-label', `${line.name || 'Line'}, ${MODE_LABEL[line.mode].toLowerCase()}: ${stop ? depth ?? 'stops here' : 'not served'}`);
        chip.append(el('span', 'net-chip__name', line.name || 'Untitled line'));
        if (depth) chip.append(el('span', 'net-chip__depth', LETTER[depth]));
        chip.addEventListener('click', () => step(line));
        root.append(chip);
      }
    }
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
