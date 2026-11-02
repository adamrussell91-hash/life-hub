// Practice and retrieval (Book 2).
import { circle, path, rect, dashed, thin, bubble, q, tick, arrow, FILL, symbol } from '../parts.mjs';

export const symbols = {
  'w2-make-everyone-think': symbol([
    path('M30 44a13 13 0 0 1 -3 -25a18 18 0 0 1 34 -6a14 14 0 0 1 13 31z', FILL),
    dashed('M34 50L20 66M50 50V66M66 50L80 66'),
    circle(18, 80, 9), circle(50, 80, 9), circle(82, 80, 9)
  ].join('')),

  'w2-multiple-choice-questions': symbol([
    q(14, 44, 1.5),
    circle(44, 22, 7), path('M58 22H94'),
    circle(44, 50, 7, true), path('M58 50H94'),
    circle(44, 78, 7), path('M58 78H94')
  ].join('')),

  'w2-flash-cards': symbol([
    arrow([24, 38], [76, 38], [50, 0], { dash: true }),
    rect(4, 46, 40, 36, 4), q(24, 60, 0.85),
    rect(56, 46, 40, 36, 4, true)
  ].join('')),

  'w2-dual-coding-mapping': symbol([
    path('M6 50H72'),
    path('M26 50L14 22M26 50L14 78M48 50L36 22M48 50L36 78M70 50L58 22M70 50L58 78'),
    path('M72 34L95 50L72 66Z', FILL)
  ].join('')),

  'w2-practise-explaining': symbol([
    bubble(5, 6, 48, 34, [14, 48], { lines: 2, rx: 5 }),
    arrow([56, 20], [78, 42], [78, 20]),
    rect(60, 48, 35, 46, 4, true),
    arrow([54, 80], [20, 56], [24, 82])
  ].join('')),

  'w2-thresholds-and-pathways': symbol([
    rect(36, 6, 13, 30, 2), rect(36, 64, 13, 30, 2),
    path('M6 50H26'), circle(42.5, 50, 7, true),
    arrow([54, 46], [90, 18], null, { dash: true }), arrow([54, 50], [94, 50], null, { dash: true }), arrow([54, 54], [90, 82], null, { dash: true })
  ].join('')),

  'w2-a-ladder-of-difficulty': symbol([
    path('M12 94L48 34M36 94L72 34'),
    path('M20 80H44M28 66H52M36 52H60'),
    q(80, 18, 1.3)
  ].join('')),

  'w2-the-face-it-revision-model': symbol([
    circle(18, 18, 7, true),
    thin('M25 18H33M18 25V33'), circle(37, 18, 3.5), circle(18, 37, 3.5),
    thin('M50 18A32 32 0 0 1 18 50'), thin('M64 18A46 46 0 0 1 18 64'), thin('M78 18A60 60 0 0 1 18 78'), thin('M92 18A74 74 0 0 1 18 92')
  ].join(''))
};
