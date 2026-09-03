import type { MapColorToken } from '@/schemas/map';

/** Maps-only transit palette. Not kit tokens — this view is the exception. */
export const TRANSIT_HEX = {
  blue: '#0057b8',
  yellow: '#f0c400',
  green: '#009a3a',
  purple: '#6b2d8e',
  'blue-fill': '#d4e6ff',
  'yellow-fill': '#fff3b0',
  'green-fill': '#c8f0d2',
  'purple-fill': '#edd6fa',
  paper: '#fbf8f2',
  ink: '#13233a'
} as const;

export type Swatch = {
  stroke: string;
  fill: string;
  disc: string;
  letter: string;
};

const HUB: Record<string, Swatch> = {
  wave: { stroke: '#376fb7', fill: '#dceafa', disc: '#376fb7', letter: TRANSIT_HEX.paper },
  success: { stroke: '#2f7a4f', fill: '#dce8d8', disc: '#2f7a4f', letter: TRANSIT_HEX.paper },
  lilac: { stroke: '#5d4e70', fill: '#e8e0ef', disc: '#5d4e70', letter: TRANSIT_HEX.paper },
  'high-sea': { stroke: '#f68620', fill: '#f1e2b6', disc: '#f1e2b6', letter: '#a85a0c' },
  'high-sea-ink': { stroke: '#a85a0c', fill: '#f3e4c8', disc: '#f3e4c8', letter: '#a85a0c' },
  marine: { stroke: '#142b51', fill: '#dceafa', disc: '#142b51', letter: TRANSIT_HEX.paper },
  navy: { stroke: '#17375e', fill: '#dceafa', disc: '#17375e', letter: TRANSIT_HEX.paper },
  depth: { stroke: '#0a1536', fill: '#dceafa', disc: '#0a1536', letter: TRANSIT_HEX.paper }
};

const TRANSIT: Record<'blue' | 'yellow' | 'green' | 'purple', Swatch> = {
  blue: {
    stroke: TRANSIT_HEX.blue,
    fill: TRANSIT_HEX['blue-fill'],
    disc: TRANSIT_HEX.blue,
    letter: TRANSIT_HEX.paper
  },
  yellow: {
    stroke: TRANSIT_HEX.yellow,
    fill: TRANSIT_HEX['yellow-fill'],
    disc: TRANSIT_HEX.yellow,
    letter: TRANSIT_HEX.ink
  },
  green: {
    stroke: TRANSIT_HEX.green,
    fill: TRANSIT_HEX['green-fill'],
    disc: TRANSIT_HEX.green,
    letter: TRANSIT_HEX.paper
  },
  purple: {
    stroke: TRANSIT_HEX.purple,
    fill: TRANSIT_HEX['purple-fill'],
    disc: TRANSIT_HEX.purple,
    letter: TRANSIT_HEX.paper
  }
};

export function swatch(color: MapColorToken): Swatch {
  return TRANSIT[color as keyof typeof TRANSIT] ?? HUB[color] ?? TRANSIT.blue;
}

export function strokeCss(color: MapColorToken): string {
  if (color in TRANSIT) return `var(--map-${color})`;
  if (color === 'lilac') return 'var(--pastel-lilac-ink)';
  return `var(--${color})`;
}

export function fillCss(color: MapColorToken): string {
  if (color in TRANSIT) return `var(--map-${color}-fill)`;
  if (color === 'high-sea' || color === 'high-sea-ink') return 'var(--pastel-gold)';
  if (color === 'success') return 'var(--pastel-sage)';
  if (color === 'lilac') return 'var(--pastel-lilac)';
  return 'var(--pastel-blue)';
}

export function discCss(color: MapColorToken): string {
  if (color === 'yellow') return 'var(--map-yellow)';
  if (color === 'high-sea') return 'var(--pastel-gold)';
  return strokeCss(color);
}

export function letterCss(color: MapColorToken): string {
  if (color === 'yellow') return 'var(--ink)';
  if (color === 'high-sea' || color === 'high-sea-ink') return 'var(--high-sea-ink)';
  return 'var(--paper)';
}
