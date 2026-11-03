// Explaining and modelling (E&M), Book 3.
import { circle, path, rect, thin, bubble, tick, cross, arrow, symbol, FILL } from '../parts.mjs';

export const symbols = {
  'w3-giving-an-explanation': symbol([
    path('M48 4C72 4 90 22 90 46C90 70 72 88 48 88C24 88 6 70 6 46C6 22 24 4 48 4ZM48 19' +
      'C33 19 21 31 21 46C21 61 33 73 48 73C63 73 75 61 75 46C75 31 63 19 48 19Z', `${FILL} fill-rule="evenodd"`),
    path('M62 70L78 62L96 90L80 96Z', FILL),
    bubble(32, 34, 32, 18, [38, 62], {})
  ].join('')),

  'w3-examples-and-non-examples': symbol([
    path('M50 4V96'),
    tick(24, 18, 1.5), rect(8, 44, 14, 46, 2, true), rect(28, 62, 14, 28, 2, true),
    cross(76, 18, 1.5), path('M58 90L66 50H92L84 90Z')
  ].join('')),

  'w3-sequences-causes-and-consequences': symbol([
    path('M24 8H96V88H14'), path('M24 8V88'),
    path('M42 8V58M58 8V58M74 8V58M88 8V58'),
    circle(42, 66, 8), circle(58, 66, 8), circle(74, 66, 8), circle(88, 66, 6),
    path('M24 8L8 44'), circle(8, 52, 7, true)
  ].join('')),

  'w3-predict-and-verify': symbol([
    circle(50, 40, 36), circle(34, 40, 14), path('M34 32V40L40 44'), tick(68, 40, 1.7),
    circle(18, 82, 6), circle(8, 94, 3)
  ].join('')),

  'w3-chunking': symbol([
    rect(6, 10, 54, 22, 10), thin('M16 21H50'),
    rect(40, 39, 54, 22, 10, true),
    rect(6, 68, 54, 22, 10), thin('M16 79H50')
  ].join('')),

  'w3-advance-organisers': symbol([
    circle(50, 14, 9, true), path('M50 23V36M50 36L24 48M50 36L76 48'), circle(24, 52, 6), circle(76, 52, 6),
    path('M50 74Q30 62 6 70V92Q30 84 50 94Q70 84 94 92V70Q70 62 50 74Z'), path('M50 74V94')
  ].join('')),

  'w3-the-creative-writing-process': symbol([
    rect(4, 42, 34, 52, 3), thin('M12 52H30'), circle(21, 74, 9, true),
    path('M38 60C52 66 54 46 64 42'), path('M64 42L74 36', 'stroke-width="5"'),
    circle(84, 24, 4, true), circle(94, 40, 4, true), circle(78, 12, 3, true), circle(88, 54, 3, true), circle(94, 12, 2, true)
  ].join('')),

  'w3-writing-developing-academic-voices': symbol([
    path('M6 40Q50 -24 94 40Q83 33 72 40Q61 33 50 40Q39 33 28 40Q17 33 6 40Z'),
    path('M50 40V94'),
    circle(50, 62, 9, true), path('M50 62L22 54M50 62L78 54M50 62L24 84M50 62L76 84'),
    circle(18, 52, 6), circle(82, 52, 6), circle(20, 86, 6), circle(80, 86, 6)
  ].join('')),

  'w3-graphic-organisers-kernel-sentences': symbol([
    rect(32, 16, 36, 22, 3, true),
    rect(3, 3, 24, 15), rect(73, 3, 24, 15), path('M24 18L36 24M76 18L64 24'),
    arrow([50, 42], [50, 58]),
    path('M6 70H94'), path('M6 90H64'), circle(78, 90, 4.4, true)
  ].join('')),

  'w3-modelling-handover-i-do-we-do-you-do': symbol([
    path('M38 4H62L58 18H42Z', FILL), path('M42 18L30 74M58 18L70 74'),
    path('M4 16L14 8L22 18L12 26Z'), path('M96 16L86 8L78 18L88 26Z'),
    path('M16 24L38 74M84 24L62 74'),
    circle(50, 84, 10, true), path('M22 94H78')
  ].join(''))
};
