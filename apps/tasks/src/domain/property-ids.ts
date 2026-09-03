/** Stable classifier ids from a display name — hidden in Tools → Properties. */

export function slugifyPropertyId(label: string): string {
  let slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug) return 'item';
  if (!/^[a-z]/.test(slug)) slug = `item_${slug}`;
  return slug;
}

export function uniquePropertyId(label: string, used: Iterable<string>): string {
  const base = slugifyPropertyId(label);
  const taken = new Set(used);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
