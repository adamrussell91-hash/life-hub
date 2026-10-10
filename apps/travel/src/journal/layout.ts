export function photoLayout(count: number): 'single' | 'pair' | 'lead-pair' | 'lead-pair-more' {
  if (count <= 1) return 'single';
  if (count === 2) return 'pair';
  if (count === 3) return 'lead-pair';
  return 'lead-pair-more';
}

export function storyColumnMaxRem(): 48 {
  return 48;
}

export function shouldShowDayMapPreview(
  moments: { coordinates?: { lat: number; lon: number } }[],
): boolean {
  return moments.some((moment) => moment.coordinates !== undefined);
}

export function truncateReflectionLines(
  text: string,
  maxLines = 6,
): { preview: string; remainder: string | null } {
  const lines = text.split('\n');
  if (lines.length <= maxLines) {
    return { preview: text, remainder: null };
  }
  return {
    preview: lines.slice(0, maxLines).join('\n'),
    remainder: lines.slice(maxLines).join('\n'),
  };
}
