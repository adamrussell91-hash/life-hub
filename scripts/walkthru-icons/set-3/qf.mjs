// Questioning and feedback (Q&F), Book 3.
import { P, circle, path, rect, thin, dashed, bubble, q, tick, cross, arrow, symbol, FILL } from '../parts.mjs';

export const symbols = {
  'w3-cold-call-variations': symbol([
    bubble(50, 4, 40, 24, [58, 36], {}),
    bubble(28, 34, 40, 24, [36, 66], {}),
    bubble(6, 64, 44, 26, [14, 98], { fill: true }),
    arrow([96, 78], [58, 78])
  ].join('')),

  'w3-strategies-to-check-for-understanding': symbol([
    bubble(30, 2, 40, 34, [50, 46], { fill: false }), q(50, 15, 1),
    rect(4, 54, 40, 40, 4), tick(24, 74, 2),
    rect(56, 54, 40, 40, 4), cross(76, 74, 2)
  ].join('')),

  'w3-class-discussion': symbol([
    bubble(4, 6, 38, 26, [12, 42], {}), bubble(58, 6, 38, 26, [86, 42], {}),
    bubble(28, 52, 44, 30, [50, 96], { fill: true }),
    arrow([18, 44], [28, 60], [16, 56]), arrow([82, 44], [72, 60], [84, 56])
  ].join('')),

  'w3-show-call': symbol([
    rect(36, 6, 60, 50, 3, true),
    rect(4, 60, 26, 34, 2), thin('M10 70H24M10 78H24'),
    arrow([34, 60], [52, 62], null, { dash: false }),
    path('M66 56V72M50 88L66 72L82 88')
  ].join('')),

  'w3-scaffold-verbal-responses': symbol([
    bubble(4, 14, 92, 50, [26, 90], {}),
    rect(14, 28, 40, 22, 10, true), dashed('M62 39H88')
  ].join('')),

  'w3-short-feedback-loops': symbol([
    arrow([14, 36], [86, 36], [50, -6]), arrow([86, 64], [14, 64], [50, 106]),
    circle(50, 50, 12, true)
  ].join('')),

  'w3-c-r-a-f-t-feedback-time': symbol([
    path('M50 30V74'),
    circle(50, 12, 9), circle(67, 24.5, 9), circle(60.6, 44.6, 9), circle(39.4, 44.6, 9), circle(33, 24.5, 9),
    circle(50, 30, 7.5, true),
    rect(18, 74, 64, 22, 3), tick(50, 85, 1.1)
  ].join('')),

  'w3-assessment-for-student-agency': symbol([
    path('M26 96L48 10M50 96L72 18'),
    path('M32 78H55M37 60H60M42 42H64M46 26H68'),
    path('M66 4V20'), path('M66 4L94 12L66 20Z', FILL)
  ].join('')),

  'w3-formative-use-of-tests': symbol([
    rect(4, 4, 56, 92, 4),
    tick(16, 20, 1.1), path('M28 20H52'),
    path(`M10 38H54V62H10Z${P([14, 46], [16, 44], [20, 48], [24, 44], [26, 46], [22, 50], [26, 54], [24, 56], [20, 52], [16, 56], [14, 54], [18, 50])}Z M31 48H48V52H31Z`, `${FILL} fill-rule="evenodd" stroke="none"`),
    tick(16, 80, 1.1), path('M28 80H52'),
    rect(72, 8, 24, 24, 2), path('M78 20H90'),
    arrow([60, 50], [84, 38], [84, 50])
  ].join('')),

  'w3-assessment-portfolios': symbol([
    path('M4 44H16L22 52H44V92H4Z', FILL),
    path('M56 44H68L74 52H96V92H56Z'),
    arrow([24, 30], [76, 30], [50, 4]), path('M26 22L24 30L33 32')
  ].join(''))
};
