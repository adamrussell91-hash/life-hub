// Practice and retrieval (P&R).
import { P, circle, path, rect, thin, q, arrow, symbol } from './parts.mjs';

const cube = (x, y, s) => rect(x, y, s, s, 2) + path(`M${x} ${y}l${s / 3} ${-s / 3}h${s}l${-s / 3} ${s / 3}M${x + s * 4 / 3} ${y - s / 3}v${s}l${-s / 3} ${s / 3}`);
const stopwatch = (x, y, r, hand) =>
  circle(x, y, r) + path(`M${x} ${y - r}v-6M${x - 7} ${y - r - 7}h14`) + path(P([x, y], hand)) + circle(x, y, 3.5, true) +
  thin(`M${x} ${y - r + 5}v4M${x + r - 5} ${y}h-4M${x} ${y + r - 5}v-4M${x - r + 5} ${y}h4`);

export const symbols = {
  'w1-quizzing': symbol([
    rect(16, 10, 68, 80, 6),
    rect(26, 21, 10, 10, 2), path('M44 26H74'),
    rect(26, 43, 10, 10, 2, true), path('M44 48H70'),
    rect(26, 65, 10, 10, 2), path('M44 70H66')
  ].join('')),

  'w1-weekly-and-monthly-review': symbol([
    rect(14, 18, 72, 68, 6), rect(14, 18, 72, 16, 6, true), path('M32 10v14M68 10v14'),
    path('M64 60A14 14 0 1 1 50 46'), path(P([45, 41], [50, 46], [45, 51]))
  ].join('')),

  'w1-elaborative-interrogation': symbol([
    q(26, 34, 1.8),
    circle(54, 80, 8), arrow([60, 74], [72, 60]), circle(78, 52, 8), path('M78 44V36'), circle(78, 24, 9, true)
  ].join('')),

  'w1-using-a-knowledge-organiser': symbol([
    rect(14, 10, 72, 80, 6), path('M50 10V90M14 50H86'),
    rect(20, 16, 24, 28, 3, true),
    path('M56 24H80M56 34H72M20 62H44M20 74H36M56 62H80M56 74H70')
  ].join('')),

  'w1-rehearsal-and-performance': symbol([
    rect(12, 72, 76, 12, 3),
    circle(50, 12, 6, true), path('M44 20L24 66M56 20L76 66'),
    path('M62 46A12 12 0 1 1 50 34'), path(P([45, 29], [50, 34], [45, 39]))
  ].join('')),

  'w1-peer-supported-retrieval': symbol([
    rect(10, 22, 42, 30, 4, true), rect(48, 50, 42, 30, 4),
    arrow([60, 18], [78, 40], [80, 18]), arrow([40, 84], [20, 62], [18, 84])
  ].join('')),

  'w1-concrete-examples': symbol([
    cube(8, 50, 26), circle(62, 64, 12, true), path('M76 76L85 52L94 76Z')
  ].join('')),

  'w1-guided-practice': symbol([
    path('M10 30H90M10 70H90'), circle(20, 50, 6, true), arrow([30, 50], [84, 50])
  ].join('')),

  'w1-independent-practice': symbol([
    rect(14, 10, 52, 78, 5), path('M24 28H56M24 42H56M24 56H44'),
    path('M88 46L96 54L66 84L56 86L58 76Z', 'fill="currentColor"')
  ].join('')),

  'w1-building-fluency': symbol([
    stopwatch(50, 56, 30, [66, 42])
  ].join(''))
};
