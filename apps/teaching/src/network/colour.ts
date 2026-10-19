import type { NetworkLine } from '@/schemas/block';

export type LineColour = NetworkLine['colour'];

/**
 * Tasks Lines draws each line in its domain colour and every second line in a
 * deeper shade (30 % toward depth). These are the same colours, as tokens.
 */
const BASE_COLOUR: Record<string, [token: string, fallback: string]> = {
  wave: ['--wave', '#376fb7'],
  green: ['--success', '#2f7a4f'],
  amber: ['--high-sea-ink', '#a85a0c'],
  lilac: ['--pastel-lilac-ink', '#5d4e70'],
  navy: ['--navy-2', '#244f7c']
};

export const COLOUR_ORDER: readonly LineColour[] = [
  'wave', 'green', 'amber', 'lilac', 'navy', 'wave_deep', 'green_deep', 'amber_deep', 'lilac_deep', 'navy_deep'
];

export const COLOUR_LABEL: Record<LineColour, string> = {
  wave: 'Wave blue', wave_deep: 'Deep blue',
  green: 'Green', green_deep: 'Deep green',
  amber: 'Amber', amber_deep: 'Deep amber',
  lilac: 'Lilac', lilac_deep: 'Deep lilac',
  navy: 'Navy', navy_deep: 'Deep navy'
};

export function lineColour(colour: LineColour): string {
  const deep = colour.endsWith('_deep');
  const [token, fallback] = BASE_COLOUR[colour.replace('_deep', '')] ?? BASE_COLOUR.wave!;
  const base = `var(${token}, ${fallback})`;
  return deep ? `color-mix(in srgb, ${base} 70%, var(--depth, #0a1536))` : base;
}

export function nextColour(used: readonly LineColour[]): LineColour {
  return COLOUR_ORDER.find((c) => !used.includes(c)) ?? COLOUR_ORDER[used.length % COLOUR_ORDER.length]!;
}
