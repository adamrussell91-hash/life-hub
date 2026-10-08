/**
 * From Notion › Holiday Planner › London/Scotland 26 › "Vintage British Watch Hunting"
 * (last edited 05/10/26). Wording kept close to the source.
 */
export const WATCH_HUNT = {
  source: 'https://app.notion.com/p/3f0f794f847681a28f70c7e20db38d39',
  title: 'The vintage British watch hunt',
  when: 'London and Scotland, December',
  goal: 'A classic British looking watch with genuine history, character and strong value, rather than a modern international watch bought in Britain.',
  brief: ['32 to 38 mm', 'Cream, silver or white dial', 'Arabic numerals', 'Dauphine or blued hands', 'Small seconds', 'Leather strap or simple steel', 'Under about £300'],
  targets: [
    { name: 'Smiths', note: 'First priority. British made, 1940s to 1960s, with simple cream or silver dials and mechanical movements.' },
    { name: 'Accurist', note: 'British, founded 1946. Restrained mid century styling at an accessible price.' },
    { name: 'Garrard', note: 'Older dress and presentation watches can carry more character than their price suggests.' },
    { name: 'Rotary', note: 'Only older examples with a distinctive dial, case and movement.' }
  ],
  places: [
    { name: 'London', note: 'Highest priority: specialist vintage dealers, antique arcades, jewellers with pre owned pieces.' },
    { name: 'Edinburgh', note: 'The stronger Scottish stop. Pair it with the antiquarian books and prints hunt.' },
    { name: 'Glasgow', note: 'Independent jewellers, antique dealers and pre owned shops, if convenient.' }
  ],
  checks: [
    'Dial looks original, not redialled',
    'Serviced, and when',
    'Keeps reasonable time',
    'Winds smoothly',
    'Case not heavily polished',
    'Crystal (scratches are fine)',
    'Seen the movement',
    'Service cost priced in',
    'Provenance (nice, not essential)',
    'Tried on the wrist'
  ],
  rule: 'It only comes home if it passes all three: it looks beautiful on the wrist, its history gives it a real UK connection, and the total still makes sense after servicing.',
  fallback: ['Accurist Classic or Origin', 'Duckworth Prestex', 'Marloe', 'anOrdain (visit and admire)', 'Fears Brunswick (the benchmark)'],
  /** A small British dress watch at the brief's centre, drawn for size comparison only. */
  sample: { id: 'hunt-sample', name: 'A vintage Smiths at 34 mm', mm: 34, lugWidth: 16, dial: 'Cream', strap: 'Brown', strapMaterial: 'Leather', markers: ['Arabic', 'Printed'], handsColour: 'Blue', complications: [], caseMaterial: 'Stainless steel', notes: '' }
};
