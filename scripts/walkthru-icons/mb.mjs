// Mode B teaching (MB).
import { P, FILL, circle, path, rect, thin, bubble, q, arrow, symbol } from './parts.mjs';

const openBook = (cx, top, hw, h) =>
  path(`M${cx} ${top + 4}Q${cx - hw / 2} ${top - 2} ${cx - hw} ${top + 4}V${top + h}Q${cx - hw / 2} ${top + h - 6} ${cx} ${top + h}Z`) +
  path(`M${cx} ${top + 4}Q${cx + hw / 2} ${top - 2} ${cx + hw} ${top + 4}V${top + h}Q${cx + hw / 2} ${top + h - 6} ${cx} ${top + h}Z`);
const pencil = (x, y, s = 1) =>
  path(`M${x} ${y}L${x + 18 * s} ${y - 18 * s}L${x + 24 * s} ${y - 12 * s}L${x + 6 * s} ${y + 6 * s}Z`, FILL) + path(P([x, y], [x - 3 * s, y + 9 * s], [x + 6 * s, y + 6 * s]));

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
