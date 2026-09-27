/** The six mockup city accents, for new cities (TR-59). Cycle through in order. */
export const CITY_PALETTE: { color: string; soft: string; ink: string }[] = [
  { color: '#e8743b', soft: '#fde3d3', ink: '#8a3a12' }, // orange
  { color: '#1e7fa0', soft: '#d6eef5', ink: '#12506a' }, // teal
  { color: '#c0392b', soft: '#f6d9d5', ink: '#7a2419' }, // red
  { color: '#3c5949', soft: '#dfe9e1', ink: '#264334' }, // sage
  { color: '#5d4e70', soft: '#e8e0f1', ink: '#3c3350' }, // lilac
  { color: '#a85a0c', soft: '#f1e2b6', ink: '#6c581f' } // gold
];

export function nextAccent(usedCount: number): { color: string; soft: string; ink: string } {
  return CITY_PALETTE[usedCount % CITY_PALETTE.length]!;
}
