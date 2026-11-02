// Book 2, Behaviour and relationships.
import { circle, path, rect, dashed, bubble, arrow, symbol, FILL } from '../parts.mjs';

const pinPath = (x, tip, r) => {
  const cy = tip - r * 2.2;
  return `M${x} ${tip}C${x - r * 0.5} ${tip - r} ${x - r} ${cy + r * 0.7} ${x - r} ${cy}A${r} ${r} 0 1 1 ${x + r} ${cy}C${x + r} ${cy + r * 0.7} ${x + r * 0.5} ${tip - r} ${x} ${tip}Z`;
};
const hole = (x, cy, r) => `M${x - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

export const symbols = {
  'w2-assertiveness': symbol([
    bubble(8, 24, 50, 34, [18, 72], { fill: true, rx: 8 }),
    path('M68 28Q76 41 68 54'), path('M80 18Q94 41 80 64'),
    path('M12 88H88')
  ].join('')),

  'w2-getting-lessons-started': symbol([
    path('M6 90H94'),
    path('M56 14H90V90H56Z' + hole(64, 54, 3.5), `${FILL} fill-rule="evenodd"`),
    circle(12, 66, 6), circle(30, 66, 6),
    arrow([40, 66], [52, 66])
  ].join('')),

  'w2-gather-around-demonstrations-and-stories': symbol([
    circle(50, 50, 10, true),
    circle(10, 50, 6.5), circle(90, 50, 6.5),
    circle(28, 14, 6.5), circle(72, 14, 6.5), circle(28, 86, 6.5), circle(72, 86, 6.5),
    arrow([20, 50], [34, 50]), arrow([80, 50], [66, 50])
  ].join('')),

  'w2-keeping-on-task': symbol([
    rect(5, 6, 26, 18, 3), rect(69, 6, 26, 18, 3), rect(5, 76, 26, 18, 3), rect(69, 76, 26, 18, 3),
    dashed('M74 50A24 24 0 1 1 50 26A24 24 0 0 1 74 50'),
    circle(74, 50, 8.5, true)
  ].join('')),
  'w2-silence-is-golden': symbol([
    path('M48 92Q38 92 38 80V40Q38 34 44 34Q50 34 50 40V60H70Q80 60 80 68V80Q80 92 70 92Z', FILL),
    arrow([30, 26], [20, 16]), arrow([44, 22], [44, 7]), arrow([58, 26], [68, 16]),
    arrow([24, 40], [10, 40]), arrow([64, 40], [78, 40])
  ].join('')),

  'w2-transitions-between-activities': symbol([
    path(pinPath(20, 88, 11)),
    arrow([24, 42], [52, 22], [32, 16]),
    path(pinPath(70, 88, 18) + hole(70, 48.4, 7), `${FILL} fill-rule="evenodd"`)
  ].join('')),

  'w2-lesson-disruption': symbol([
    rect(45, 4, 10, 26, 5, true), circle(50, 40, 5.5, true),
    path('M6 72H30L38 56L50 90L60 62L66 72H92'), path('M86 66L94 72L86 78')
  ].join('')),

  'w2-perspective-the-dot-in-the-empty-square': symbol([
    rect(10, 10, 80, 80, 3),
    circle(72, 28, 7.5, true)
  ].join(''))
};
