// Explaining and modelling (E&M), Book 2.
import { circle, path, rect, thin, bubble, tick, symbol, FILL } from '../parts.mjs';

const octagon = (cx, cy, r) => { const k = r * 0.414; return `M${cx - k} ${cy - r}H${cx + k}L${cx + r} ${cy - k}V${cy + k}L${cx + k} ${cy + r}H${cx - k}L${cx - r} ${cy + k}V${cy - k}Z`; };

export const symbols = {
  'w2-pre-reading-instructions-for-complex-texts': symbol([
    path('M50 56C38 48 22 48 8 54V90C22 84 38 84 50 92C62 84 78 84 92 90V54C78 48 62 48 50 56ZM50 56V92'),
    path('M50 44C43 34 38 28 38 20A12 12 0 1 1 62 20C62 28 57 34 50 44Z', FILL)
  ].join('')),

  'w2-whole-class-reading-routines': symbol([
    rect(6, 10, 50, 80, 4), thin('M15 24H47M15 34H47M15 44H37M15 60H47M15 70H47M15 80H34'),
    path('M78 60V92'),
    path(octagon(78, 40, 18), FILL)
  ].join('')),

  'w2-developing-reading-fluency': symbol([
    path('M26 40C20 35 12 35 6 38V66C12 63 20 63 26 68C32 63 40 63 46 66V38C40 35 32 35 26 40Z', FILL),
    path('M58 34A28 28 0 0 1 58 70'), path('M70 24A42 42 0 0 1 70 80'), path('M82 14A56 56 0 0 1 82 90')
  ].join('')),

  'w2-summarising-academic-reading': symbol([
    rect(6, 8, 42, 84, 4), thin('M14 22H40M14 33H40M14 44H40M14 55H40M14 66H40M14 77H30'),
    path('M54 14L72 40M54 86L72 60'),
    rect(72, 38, 24, 24, 3, true)
  ].join('')),

  'w2-giving-practical-demonstrations': symbol([
    path('M44 36H56M47 36V54L30 84Q28 90 34 90H66Q72 90 70 84L53 54V36', FILL),
    path('M50 24V8M28 34L18 24M72 34L82 24M20 58H6M80 58H94')
  ].join('')),

  'w2-dual-coding-diagrams': symbol([
    bubble(4, 6, 38, 26, [12, 40], { lines: 2, rx: 4 }),
    path('M34 52H88V90H66M58 90H34Z'), path('M34 52V90'),
    path('M66 82V98M58 86V94'),
    circle(61, 52, 10, true)
  ].join('')),

  'w2-analogies': symbol([
    path('M8 42V90H42V42'), path('M8 62H42V90H8Z', FILL), `<ellipse cx="25" cy="42" rx="17" ry="6"/>`,
    rect(62, 40, 32, 50, 4), path('M72 40V33H84V40'), path('M80 50L71 66H82L75 80'),
    path('M24 26Q50 -2 78 24'), path('M16 20L24 26L33 22'), path('M68 20L78 24L84 16')
  ].join('')),

  'w2-send-addressing-cognitive-difficulties': symbol([
    rect(14, 8, 20, 84, 2, true),
    rect(44, 34, 20, 58, 2), thin('M44 53H64M44 72H64'),
    rect(74, 62, 20, 30, 2), thin('M74 77H94'),
    bubble(46, 4, 46, 20, [56, 30], { rx: 5, lines: 1 })
  ].join('')),

  'w2-compare-contrast-and-categorise': symbol([
    path('M50 78L24 52M50 78L76 52M24 52L13 31M24 52L35 31M76 52L65 32M76 52L87 32'),
    circle(10, 24, 8), circle(38, 24, 8), rect(55, 16, 16, 16, 2), rect(81, 16, 16, 16, 2),
    circle(50, 78, 10, true)
  ].join('')),

  'w2-exemplars': symbol([
    path('M34 16V8H90V70H78'),
    path('M20 28V18H76V82H66'),
    rect(6, 30, 58, 64, 4), thin('M15 44H55M15 54H55'), tick(35, 74, 1.5)
  ].join(''))
};
