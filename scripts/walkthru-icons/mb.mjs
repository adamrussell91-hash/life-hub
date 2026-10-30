// Mode B teaching (MB).
import { P, FILL, circle, path, rect, thin, standing, seated, desk, bubble, q, arrow, figure, symbol } from './parts.mjs';

const openBook = (cx, top, hw, h) =>
  path(`M${cx} ${top + 4}Q${cx - hw / 2} ${top - 2} ${cx - hw} ${top + 4}V${top + h}Q${cx - hw / 2} ${top + h - 6} ${cx} ${top + h}Z`) +
  path(`M${cx} ${top + 4}Q${cx + hw / 2} ${top - 2} ${cx + hw} ${top + 4}V${top + h}Q${cx + hw / 2} ${top + h - 6} ${cx} ${top + h}Z`);
const pencil = (x, y, s = 1) =>
  path(`M${x} ${y}L${x + 18 * s} ${y - 18 * s}L${x + 24 * s} ${y - 12 * s}L${x + 6 * s} ${y + 6 * s}Z`, FILL) + path(P([x, y], [x - 3 * s, y + 9 * s], [x + 6 * s, y + 6 * s]));

export const figures = {
  'w1-collaborative-learning': figure([
    seated(32, 38), seated(60, 32), seated(88, 38),
    `<ellipse cx="60" cy="68" rx="46" ry="12"/>`,
    rect(50, 62, 20, 11, 2, true),
    path('M24 79V88M96 79V88')
  ].join('')),

  'w1-oracy-debating': figure([
    standing(16, 84, { arms: [[-6, 18], [18, -4]] }),
    standing(104, 84, { arms: [[-18, -4], [6, 18]] }),
    bubble(28, 30, 32, 20, [22, 24], { lines: 2, rx: 4 }),
    bubble(60, 2, 32, 20, [98, 26], { fill: true, rx: 4 })
  ].join('')),

  'w1-homework-as-guided-study': figure([
    standing(16, 84, { arms: [[-8, 16], [14, -2]] }),
    rect(30, 26, 18, 24, 2), thin('M34 34H44M34 41H44'),
    arrow([50, 44], [60, 52]),
    path('M62 40L88 16L114 40V84H62Z'),
    seated(88, 50, { fill: true }), path('M74 70H102')
  ].join('')),

  'w1-enquiry-projects': figure([
    standing(24, 84, { arms: [[-8, 16], [18, 14]] }),
    path(P([42, 45], [50, 39]), 'stroke-width="5"'), circle(61, 28, 14),
    q(61, 24, 0.75),
    rect(82, 40, 32, 44, 3), thin('M88 52H108M88 62H108M88 72H100'),
    path('M98 40V16'), path('M98 16L112 21L98 26Z', FILL)
  ].join('')),

  'w1-open-response-tasks': figure([
    seated(16, 52), desk(2, 32, 74),
    rect(38, 6, 78, 78, 3),
    q(52, 24, 0.75),
    arrow([62, 24], [102, 12]), arrow([62, 28], [104, 30]), arrow([62, 32], [100, 48]),
    thin('M46 62H106M46 72H90')
  ].join('')),

  'w1-oracy-talk-for-writing': figure([
    standing(16, 84, { arms: [[-6, 18], [16, 6]] }),
    bubble(28, 2, 32, 20, [24, 28], { lines: 2, rx: 4 }),
    arrow([62, 16], [76, 28]),
    rect(78, 28, 34, 48, 3), thin('M84 38H106M84 46H106M84 54H98'),
    pencil(96, 76, 0.7)
  ].join('')),

  'w1-oracy-instructional-inputs': figure([
    standing(18, 84, { arms: [[-8, 16], [14, 4]] }),
    bubble(30, 2, 30, 18, [24, 24], { fill: true, rx: 4 }),
    path('M58 32Q64 40 58 48M64 26Q72 40 64 54'),
    seated(78, 52), seated(94, 52), seated(110, 52),
    desk(68, 118, 74)
  ].join('')),

  'w1-independent-learning-pre-reading': figure([
    seated(26, 32), desk(4, 50, 74),
    openBook(27, 58, 16, 13),
    arrow([56, 50], [70, 50]),
    rect(74, 30, 42, 36, 3), rect(74, 30, 42, 9, 3, true), thin('M80 48H108M80 57H100')
  ].join(''))
};

export const symbols = {
  'w1-collaborative-learning': symbol([
    path('M26 28L40 42M74 28L60 42M50 78V64'),
    circle(22, 24, 10), circle(78, 24, 10), circle(50, 84, 10),
    rect(38, 40, 24, 24, 3, true)
  ].join('')),

  'w1-oracy-debating': symbol([
    bubble(6, 8, 52, 34, [16, 52], { lines: 2, rx: 6 }),
    bubble(42, 54, 52, 34, [84, 44], { fill: true, rx: 6 })
  ].join('')),

  'w1-homework-as-guided-study': symbol([
    path('M12 46L50 12L88 46V90H12Z'),
    openBook(50, 54, 24, 24),
    path('M50 30V44', 'stroke-width="5"')
  ].join('')),

  'w1-enquiry-projects': symbol([
    circle(42, 42, 28),
    q(42, 38, 1.3),
    path('M62 62L88 88', 'stroke-width="10"')
  ].join('')),

  'w1-open-response-tasks': symbol([
    q(22, 46, 1.7),
    arrow([40, 46], [84, 16]), arrow([40, 50], [90, 50]), arrow([40, 54], [84, 84])
  ].join('')),

  'w1-oracy-talk-for-writing': symbol([
    bubble(6, 6, 44, 30, [14, 44], { lines: 2, rx: 6 }),
    arrow([50, 30], [60, 42]),
    rect(56, 44, 36, 48, 4), thin('M63 56H85M63 66H85M63 76H77'),
    pencil(26, 86, 1)
  ].join('')),

  'w1-oracy-instructional-inputs': symbol([
    bubble(6, 18, 50, 36, [16, 68], { fill: true, rx: 7 }),
    path('M66 24Q76 40 66 56M78 14Q94 40 78 66')
  ].join('')),

  'w1-independent-learning-pre-reading': symbol([
    openBook(50, 50, 40, 36),
    arrow([18, 24], [78, 24]),
    circle(88, 24, 6, true)
  ].join(''))
};
