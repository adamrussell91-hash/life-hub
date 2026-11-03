// Practice and retrieval (Book 3).
import { circle, path, rect, dashed, thin, bubble, q, arrow, FILL, symbol } from '../parts.mjs';

const hub = [0, 60, 120, 180, 240, 300].map((a) => [50 + 37 * Math.cos(a * Math.PI / 180), 50 + 37 * Math.sin(a * Math.PI / 180)]);

export const symbols = {
  'w3-ssdd-synoptic-practice-questions': symbol([
    path('M18 8L31 32H5Z'), path('M50 8L63 32H37Z'), path('M82 8L95 32H69Z'),
    dashed('M6 47H94'),
    circle(18, 74, 12), rect(38, 62, 24, 24, 3, true), path('M82 60L96 74L82 88L68 74Z')
  ].join('')),
  'w3-a-repertoire-of-retrieval-routines': symbol([
    ...hub.map(([x, y]) => path(`M50 50L${x} ${y}`)),
    ...hub.map(([x, y]) => circle(x, y, 8)),
    circle(50, 50, 12, true)
  ].join('')),
  'w3-consolidation': symbol([
    rect(34, 10, 32, 15, 3, true), rect(24, 31, 52, 15), rect(14, 52, 72, 15), rect(4, 73, 92, 15)
  ].join('')),
  'w3-accountable-independent-reading-air': symbol([
    bubble(32, 2, 36, 30, [48, 42]), q(50, 16, 0.75),
    path('M50 54C38 46 20 46 8 50V90C20 86 38 86 50 94C62 86 80 86 92 90V50C80 46 62 46 50 54ZM50 54V94')
  ].join('')),
  'w3-close-reading': symbol([
    rect(14, 5, 72, 90, 4),
    thin('M26 20H74M26 33H74'), rect(23, 44, 54, 13, 2, true), thin('M26 69H74M26 82H56')
  ].join('')),
  'w3-i-say-you-say-my-turn-your-turn': symbol([
    bubble(4, 6, 54, 34, [16, 52], { fill: true, rx: 6 }),
    bubble(42, 58, 54, 34, [84, 46], { rx: 6 }),
    arrow([64, 16], [86, 36], [86, 16]),
    arrow([36, 80], [12, 60], [12, 80])
  ].join('')),
  'w3-sustained-independent-practice': symbol([
    rect(4, 18, 40, 66, 4), thin('M12 34H36M12 50H36M12 66H28'),
    path('M54 8H96M54 92H96'),
    path('M60 8V22Q60 40 75 50Q60 60 60 78V92M90 8V22Q90 40 75 50Q90 60 90 78V92'),
    path('M64 24H86Q84 38 75 46Q66 38 64 24Z', FILL),
    path('M63 90Q75 62 87 90Z', FILL)
  ].join('')),
  'w3-teaching-assistants-working-in-tandem': symbol([
    circle(14, 50, 10), circle(86, 50, 10), circle(50, 50, 10, true),
    arrow([20, 36], [80, 36], [50, -6]),
    arrow([80, 64], [20, 64], [50, 106])
  ].join(''))
};
