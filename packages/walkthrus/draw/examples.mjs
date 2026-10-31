// packages/walkthrus/draw/examples.mjs
// Some of the board's hexagon figures written as scenes (JSON kit calls), by hand from draw/hex/*.mjs.
// They are the worked examples Claude sees when it draws a fusion, and tests/unit check that each
// renders to exactly the same SVG as its JavaScript original.
const HANG_L = [[-4, 30], [-3, 52]];
const DOWN_L = [[-3, 30], [-3, 52]];

export const SCENE_EXAMPLES = Object.freeze({
  'w1-cold-calling': [
    { fn: 'person', args: [20, 88, { s: 0.6, arms: [DOWN_L, [[16, 10], [30, -8]]] }] },
    { fn: 'talk', args: [30, 4, 24, 18, [36, 28], { text: '?' }] },
    { fn: 'dotted', args: ['M50 34 Q64 30 76 40', 1.9] },
    { fn: 'pupil', args: [60, 46, { s: 0.62 }] },
    { fn: 'pupil', args: [82, 46, { s: 0.62, ink: true }] },
    { fn: 'pupil', args: [104, 46, { s: 0.62 }] },
    { fn: 'desk', args: [48, 116, 66] }
  ],
  'w1-think-pair-share': [
    { fn: 'think', args: [[20, 40], [26, 18], 9] },
    { fn: 'pupil', args: [14, 48, { s: 0.75 }] },
    { fn: 'desk', args: [2, 27, 68] },
    { fn: 'arrowTo', args: [[29, 58], [37, 58], null, { w: 1.9 }] },
    { fn: 'talk', args: [45, 10, 26, 18, [56, 36]] },
    { fn: 'pupil', args: [50, 48, { s: 0.75 }] },
    { fn: 'pupil', args: [70, 48, { s: 0.75 }] },
    { fn: 'desk', args: [38, 82, 68] },
    { fn: 'arrowTo', args: [[84, 58], [92, 58], null, { w: 1.9 }] },
    { fn: 'talk', args: [84, 1, 26, 16, [98, 20], { ink: true, text: '…' }] },
    { fn: 'person', args: [106, 88, { s: 0.5, turn: -1 }] }
  ],
  'w1-check-for-understanding': [
    { fn: 'talk', args: [34, 0, 22, 16, [33, 21], { text: '?' }] },
    { fn: 'person', args: [20, 88, { s: 0.6, turn: 1, arms: [DOWN_L, [[18, 8], [36, 4]]] }] },
    { fn: 'stroke', args: ['M54 30 l4 4 l8 -9', 2.6] },
    { fn: 'qmark', args: [82, 28, 14] },
    { fn: 'stroke', args: ['M98 30 l4 4 l8 -9', 2.6] },
    { fn: 'pupil', args: [60, 50, { s: 0.62 }] },
    { fn: 'pupil', args: [82, 50, { s: 0.62, ink: true }] },
    { fn: 'pupil', args: [104, 50, { s: 0.62 }] },
    { fn: 'desk', args: [48, 116, 70] }
  ],
  'w1-probing-questions': [
    { fn: 'person', args: [18, 88, { s: 0.6, turn: 1, arms: [DOWN_L, [[20, 10], [38, 14]]] }] },
    { fn: 'qmark', args: [56, 14, 18] },
    { fn: 'qmark', args: [75, 27, 14] },
    { fn: 'qmark', args: [90, 38, 10] },
    { fn: 'pupil', args: [104, 52, { s: 0.68, ink: true }] },
    { fn: 'desk', args: [86, 120, 72] }
  ],
  'w1-rehearse-routines': [
    { fn: 'person', args: [18, 87, { s: 0.6, turn: 1, arms: [HANG_L, [[16, 10], [30, -4]]] }] },
    { fn: 'arrowTo', args: [[104, 30], [50, 28], [78, 2], { w: 1.9 }] },
    { fn: 'person', args: [54, 87, { s: 0.42 }] },
    { fn: 'person', args: [78, 87, { s: 0.42, ink: true }] },
    { fn: 'person', args: [102, 87, { s: 0.42 }] }
  ],
  'w1-positive-relationships': [
    { fn: 'person', args: [30, 87, { s: 0.62, turn: 1, arms: [HANG_L, [[14, 12], [28, 8]]] }] },
    { fn: 'ink', args: ['M60 36 C46 26 50 12 60 20 C70 12 74 26 60 36 Z'] },
    { fn: 'person', args: [90, 87, { s: 0.48, turn: -1, arms: [[[-12, 12], [-24, 8]], [[4, 30], [3, 52]]] }] }
  ],
  'w1-establish-your-expectations': [
    { fn: 'board', args: [40, 6, 74, 60] },
    { fn: 'rect', args: [48, 15, 10, 10, { rx: 2, ink: true }] },
    { fn: 'stroke', args: ['M66 20 H104', 2] },
    { fn: 'tick', args: [53, 37, 10] },
    { fn: 'stroke', args: ['M66 37 H104', 2] },
    { fn: 'tick', args: [53, 54, 10] },
    { fn: 'stroke', args: ['M66 54 H96', 2] },
    { fn: 'person', args: [18, 87, { s: 0.6, turn: 1, arms: [HANG_L, [[16, -2], [30, -22]]] }] }
  ],
  'w1-coherent-mapping': [
    { fn: 'stroke', args: ['M76 44L52 20M76 44L86 12M76 44L108 32M76 44L54 70M76 44L100 72M52 20L86 12M108 32L100 72', 1.9] },
    { fn: 'disc', args: [52, 20, 6] },
    { fn: 'disc', args: [86, 12, 6] },
    { fn: 'disc', args: [108, 32, 6] },
    { fn: 'disc', args: [54, 70, 6] },
    { fn: 'disc', args: [100, 72, 6] },
    { fn: 'disc', args: [76, 44, 9, 'ink'] },
    { fn: 'person', args: [18, 88, { s: 0.62, arms: [HANG_L, [[24, 2], [48, -4]]], turn: 1 }] }
  ],
  'w1-oracy-debating': [
    { fn: 'person', args: [16, 88, { s: 0.58, arms: [HANG_L, [[16, 4], [30, -6]]] }] },
    { fn: 'person', args: [104, 88, { s: 0.58, turn: -1, arms: [[[-16, 4], [-30, -6]], [[4, 30], [3, 52]]] }] },
    { fn: 'talk', args: [30, 26, 28, 18, [26, 22]] },
    { fn: 'talk', args: [62, 4, 28, 18, [94, 16], { ink: true }] }
  ]
});

/** Worked examples for a drawing prompt: the parents' own scenes first, then a few others. */
export function examplesFor(parentIds, count = 3) {
  const ids = [...parentIds.filter((id) => SCENE_EXAMPLES[id]), ...Object.keys(SCENE_EXAMPLES).filter((id) => !parentIds.includes(id))];
  return ids.slice(0, Math.max(count, parentIds.filter((id) => SCENE_EXAMPLES[id]).length)).map((id) => ({ id, scene: SCENE_EXAMPLES[id] }));
}
