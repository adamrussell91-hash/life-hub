// Practice and retrieval (P&R).
import { P, circle, path, rect, dashed, thin, standing, seated, desk, bubble, q, arrow, figure, symbol } from './parts.mjs';

const cube = (x, y, s) => rect(x, y, s, s, 2) + path(`M${x} ${y}l${s / 3} ${-s / 3}h${s}l${-s / 3} ${s / 3}M${x + s * 4 / 3} ${y - s / 3}v${s}l${-s / 3} ${s / 3}`);
const stopwatch = (x, y, r, hand) =>
  circle(x, y, r) + path(`M${x} ${y - r}v-6M${x - 7} ${y - r - 7}h14`) + path(P([x, y], hand)) + circle(x, y, 3.5, true) +
  thin(`M${x} ${y - r + 5}v4M${x + r - 5} ${y}h-4M${x} ${y + r - 5}v-4M${x - r + 5} ${y}h4`);

export const figures = {
  'w1-quizzing': figure([
    rect(34, 4, 52, 36, 4),
    rect(40, 10, 6, 6, 1.5), thin('M52 13H78'),
    rect(40, 19, 6, 6, 1.5, true), thin('M52 22H74'),
    rect(40, 28, 6, 6, 1.5), thin('M52 31H70'),
    seated(30, 54), seated(60, 54), seated(90, 54),
    desk(16, 104, 76)
  ].join('')),

  'w1-weekly-and-monthly-review': figure([
    seated(20, 52), desk(6, 36, 74),
    rect(52, 12, 60, 50, 4), rect(52, 12, 60, 12, 4, true), path('M64 6v10M100 6v10'),
    thin('M52 37H112M52 50H112M72 24V62M92 24V62'),
    arrow([58, 68], [32, 48], [46, 82])
  ].join('')),

  'w1-elaborative-interrogation': figure([
    seated(18, 54), desk(4, 34, 76),
    bubble(24, 10, 22, 18, [20, 40]), q(35, 17, 0.6),
    circle(56, 64, 6), arrow([61, 59], [72, 47]), circle(78, 41, 6), arrow([83, 36], [94, 24]), circle(101, 17, 7, true)
  ].join('')),

  'w1-using-a-knowledge-organiser': figure([
    seated(22, 54), desk(6, 40, 76),
    rect(50, 4, 64, 70, 4), path('M82 4V74M50 39H114'),
    rect(55, 9, 22, 25, 2, true),
    thin('M88 15H108M88 24H102M56 50H76M56 59H70M88 50H108M88 59H100'),
    dashed('M34 46L46 38')
  ].join('')),

  'w1-rehearsal-and-performance': figure([
    rect(30, 62, 60, 8, 2),
    standing(60, 62, { s: 0.7, arms: [[-14, -10], [14, -10]] }),
    circle(110, 8, 4, true), dashed('M106 12L88 58'),
    path('M30 34A12 12 0 1 1 18 22'), path(P([23, 17], [18, 22], [23, 27]))
  ].join('')),

  'w1-peer-supported-retrieval': figure([
    seated(22, 52), seated(98, 52), desk(6, 114, 74),
    path(P([28, 62], [42, 34])), rect(36, 12, 26, 20, 3, true),
    bubble(76, 8, 30, 18, [94, 40], { lines: 1, rx: 4 })
  ].join('')),

  'w1-concrete-examples': figure([
    standing(18, 84, { arms: [[-8, 16], [24, -4]] }),
    path('M42 74H116M46 74v10M112 74v10'),
    cube(48, 56, 16), circle(88, 64, 9, true), path('M98 72L107 52L116 72Z')
  ].join('')),

  'w1-guided-practice': figure([
    standing(40, 84, { arms: [[-8, 16], [30, 10]] }),
    seated(84, 52), desk(64, 116, 74),
    path('M74 24H94'), dashed('M99 24H116'), circle(74, 24, 4, true)
  ].join('')),

  'w1-independent-practice': figure([
    rect(12, 10, 16, 20, 2), thin('M16 17H24M16 23H22'), seated(20, 48), desk(8, 32, 72),
    rect(52, 10, 16, 20, 2, true), seated(60, 48), desk(48, 72, 72),
    rect(92, 10, 16, 20, 2), thin('M96 17H104M96 23H102'), seated(100, 48), desk(88, 112, 72)
  ].join('')),

  'w1-building-fluency': figure([
    seated(22, 52), desk(6, 40, 74),
    stopwatch(86, 48, 24, [98, 36]),
    thin('M48 40H56M44 50H56M48 60H56')
  ].join(''))
};

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
