// Book 3, Curriculum planning.
import { circle, path, rect, tick, symbol, FILL } from '../parts.mjs';

export const symbols = {
  'w3-big-questions': symbol([
    path('M6 58Q4 18 30 16Q50 18 50 42L41 42Q41 27 30 26Q15 28 15 58Z', FILL),
    path('M12 58Q12 36 30 36Q46 36 46 56V70H37V58H23V80H12Z', FILL),
    path('M62 34C62 12 94 12 92 34C91 48 76 46 76 62', 'stroke-width="7"'),
    circle(76, 80, 4.6, true)
  ].join('')),

  'w3-the-museum-curation-analogy': symbol([
    path('M12 92H88'), rect(28, 62, 44, 30, 2), path('M20 62H80'),
    path('M40 6H60L56 18Q74 30 62 54H38Q26 30 44 18Z', FILL)
  ].join('')),

  'w3-interdisciplinary-units': symbol([
    circle(50, 32, 25), circle(29, 66, 25), circle(71, 66, 25),
    circle(50, 54, 9, true)
  ].join('')),

  'w3-principles-of-curriculum-implementation': symbol([
    path('M18 62V16A9 9 0 0 1 36 16V62A17 17 0 1 1 18 62Z'),
    circle(27, 76, 10, true), path('M27 68V30', 'stroke-width="6"'),
    ...[8, 37, 66].map((y) => rect(58, y, 28, 24, 3) + tick(72, y + 12, 1.3))
  ].join('')),

  'w3-types-of-subject-knowledge': symbol([
    rect(4, 37, 26, 26, 2), rect(70, 37, 26, 26, 2, true),
    path('M17 37Q50 -6 83 37M28 37Q50 12 72 37'),
    path('M17 63Q50 106 83 63M28 63Q50 88 72 63')
  ].join('')),

  'w3-building-a-culture-of-reading': symbol([
    path('M4 90H96'),
    rect(8, 26, 15, 64, 2), rect(26, 16, 15, 74, 2), rect(44, 34, 15, 56, 2),
    path('M62 26L76 21L96 84L82 89Z', FILL)
  ].join('')),

  'w3-assessment-test-design': symbol([
    circle(14, 20, 8.5, true), circle(14, 50, 8.5, true), circle(14, 80, 8.5, true),
    path('M24 20L66 50M24 50L66 20M24 80H66'),
    ...[10, 40, 70].map((y) => path(`M70 ${y}V${y + 20}`) + path(`M70 ${y}L92 ${y + 6}L70 ${y + 12}Z`))
  ].join('')),

  'w3-assessment-triangulate-the-data': symbol([
    rect(38, 4, 24, 24, 2), rect(4, 72, 24, 24, 2), rect(72, 72, 24, 24, 2),
    path('M42 30L20 70M58 30L80 70M30 84H70'),
    circle(50, 60, 10, true)
  ].join('')),

  'w3-adaptive-online-assessment-platforms': symbol([
    rect(14, 14, 72, 52, 4), path('M4 80H96L86 66H14Z'),
    path('M26 50H40L56 30H66M40 50L56 56H66'),
    circle(73, 30, 7, true)
  ].join('')),

  'w3-comparative-judgement': symbol([
    rect(6, 28, 38, 60, 3), path('M14 42H36M14 54H36M14 66H28'),
    rect(56, 28, 38, 60, 3, true), tick(75, 12, 1.6)
  ].join(''))
};
