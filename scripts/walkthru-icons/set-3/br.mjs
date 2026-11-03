// Book 3, Behaviour and relationships.
import { circle, path, rect, bubble, arrow, tick, symbol, FILL } from '../parts.mjs';

export const symbols = {
  'w3-front-loading-behaviour-management': symbol([
    ...[8, 39, 70].flatMap((x) => [8, 34].map((y) => rect(x, y, 22, 16, 3))),
    path('M50 58L72 78H60V94H40V78H28Z', FILL)
  ].join('')),

  'w3-seating-plans': symbol([
    path('M12 10H88'),
    ...[10, 39, 68].flatMap((x) => [22, 46, 70].map((y) => rect(x, y, 22, 18, 3, x === 68 && y === 46)))
  ].join('')),

  'w3-build-a-vocal-repertoire': symbol([
    path('M6 40H18L38 22V78L18 60H6Z', FILL),
    ...[[52, 14], [63, 40], [74, 24], [85, 56], [95, 18]].map(([x, h]) =>
      path(`M${x} ${50 - h / 2}V${50 + h / 2}`, 'stroke-width="5"'))
  ].join('')),

  'w3-certainty-v-severity': symbol([
    path('M50 12V88M32 88H68'),
    path('M16 38L84 18'),
    path('M16 38L6 64M16 38L26 64M4 64Q16 76 28 64Z'),
    circle(11, 58, 3.4, true), circle(21, 58, 3.4, true), circle(16, 51, 3.4, true),
    path('M84 18L74 44M84 18L94 44M72 44Q84 56 96 44Z'),
    rect(77, 28, 14, 14, 1)
  ].join('')),

  'w3-modelling-mindsets': symbol([
    path('M8 26V8H92V92H8V44'),
    path('M24 28V76H76V24H46'),
    circle(50, 45, 11, true),
    path('M44 54H56V65H44Z', FILL)
  ].join('')),

  'w3-ending-lessons-the-last-10-minutes': symbol([
    path('M42 22H82', 'stroke-width="4"'), path('M62 22V30'),
    path('M48 30H70Q80 38 70 48H48Q36 39 48 30Z', FILL),
    path('M42 38L10 30M10 22V36'),
    path('M46 58H74M54 48V58M66 48V58'),
    arrow([60, 62], [60, 80], null, { dash: true }),
    path('M34 90H86', 'stroke-width="5"')
  ].join('')),

  'w3-pastoral-conversations-with-visual-records': symbol([
    rect(8, 28, 58, 66, 3),
    path('M26 36L37 54H15Z', FILL),
    path('M43 44H58M43 54H58'),
    tick(23, 70, 1.3), path('M38 70H58'),
    path('M16 84H58'),
    bubble(60, 6, 34, 24, [58, 42], { rx: 7 })
  ].join('')),

  'w3-repair-and-rebuild': symbol([
    path('M84 30A40 40 0 1 0 90 50'), path('M86 12L85 31L66 29'),
    path('M50 72C34 60 28 52 28 44C28 34 44 30 50 42C56 30 72 34 72 44C72 52 66 60 50 72Z', FILL)
  ].join(''))
};
