// The share of a pictured dish Adam actually ate, for Brisket.
export const PORTION_CHIPS = [
  { label: "All", fraction: 1 },
  { label: "¾", fraction: 0.75 },
  { label: "½", fraction: 0.5 },
  { label: "⅓", fraction: 1 / 3 },
  { label: "¼", fraction: 0.25 },
];

const round = (n) => Math.round(n * 10000) / 10000;

export function portionOf({ chip, pieces, of } = {}) {
  if (chip != null) {
    const c = PORTION_CHIPS.find((p) => p.label === chip);
    return c ? { portion: c.label, portion_fraction: round(c.fraction) } : null;
  }
  if (!Number.isInteger(pieces) || !Number.isInteger(of) || pieces < 1 || of < 1 || pieces > of) return null;
  return { portion: `${pieces} of ${of}`, portion_fraction: round(pieces / of) };
}
