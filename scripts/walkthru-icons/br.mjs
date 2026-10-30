// Behaviour and relationships (B&R).
import { P, FILL, circle, path, rect, thin, standing, seated, desk, bubble, tick, cross, arrow, figure, symbol } from './parts.mjs';

/** A heart centred on (x, y), about 18·s wide. */
const heart = (x, y, s = 1, fill = true) =>
  path(`M${x} ${y + 7 * s}C${x - 13 * s} ${y - 2 * s} ${x - 7 * s} ${y - 13 * s} ${x} ${y - 5 * s}C${x + 7 * s} ${y - 13 * s} ${x + 13 * s} ${y - 2 * s} ${x} ${y + 7 * s}Z`, fill ? FILL : '');

export const figures = {
  'w1-rehearse-routines': figure([
    standing(14, 84, { arms: [[-6, 18], [16, -2]] }),
    standing(46, 84, { s: 0.62, arms: [[-6, 16], [6, 16]], legs: 'walk', fill: true }),
    standing(72, 84, { s: 0.62, arms: [[-6, 16], [6, 16]], legs: 'walk' }),
    standing(98, 84, { s: 0.62, arms: [[-6, 16], [6, 16]], legs: 'walk' }),
    arrow([104, 28], [40, 26], [72, -2])
  ].join('')),

  'w1-positive-relationships': figure([
    standing(36, 84, { arms: [[-8, 16], [16, 4]] }),
    standing(82, 84, { s: 0.74, arms: [[-16, 2], [8, 16]] }),
    heart(59, 18, 1.1)
  ].join('')),

  'w1-establish-your-expectations': figure([
    standing(16, 84, { arms: [[-8, 16], [20, -6]] }),
    rect(38, 8, 76, 66, 3),
    rect(46, 18, 8, 8, 2, true), thin('M62 22H104'),
    tick(50, 40, 0.8), thin('M62 40H104'),
    tick(50, 58, 0.8), thin('M62 58H96')
  ].join('')),

  'w1-signal-pause-insist': figure([
    standing(18, 84, { arms: [[-8, 16], [4, -26]] }),
    rect(36, 12, 7, 22, 2, true), rect(48, 12, 7, 22, 2, true),
    seated(72, 52), seated(90, 52), seated(108, 52),
    desk(62, 118, 74)
  ].join('')),

  'w1-positive-framing': figure([
    standing(18, 84, { arms: [[-8, 16], [20, -4]] }),
    rect(38, 10, 48, 42, 3), rect(45, 17, 34, 28, 2),
    path('M62 23V39M54 31H70', 'stroke-width="5"'),
    seated(102, 52), desk(88, 118, 74)
  ].join('')),

  'w1-choices-and-consequences': figure([
    standing(16, 84, { arms: [[-6, 18], [16, 4]] }),
    path('M32 56H56'),
    arrow([56, 56], [96, 24], [72, 30]),
    arrow([56, 56], [96, 76], [72, 74]),
    circle(56, 56, 4.5, true),
    tick(108, 20, 1.1), cross(108, 76, 1.1)
  ].join(''))
};

export const symbols = {
  'w1-rehearse-routines': symbol([
    path('M50 18A32 32 0 0 1 82 50'), path(P([75, 44], [82, 51], [89, 44])),
    path('M50 82A32 32 0 0 1 18 50'), path(P([11, 56], [18, 49], [25, 56])),
    circle(50, 50, 10, true)
  ].join('')),

  'w1-positive-relationships': symbol([
    bubble(8, 30, 38, 26, [16, 68], {}),
    bubble(54, 46, 38, 26, [84, 84], {}),
    heart(50, 18, 1.2)
  ].join('')),

  'w1-establish-your-expectations': symbol([
    rect(18, 14, 64, 78, 5),
    rect(36, 8, 28, 12, 3, true),
    tick(32, 38), thin('M46 38H70'),
    tick(32, 56), thin('M46 56H70'),
    tick(32, 74), thin('M46 74H64')
  ].join('')),

  'w1-signal-pause-insist': symbol([
    circle(50, 50, 40),
    rect(34, 30, 11, 40, 3, true), rect(55, 30, 11, 40, 3, true)
  ].join('')),

  'w1-positive-framing': symbol([
    rect(10, 14, 80, 72, 5), rect(22, 26, 56, 48, 3),
    path('M50 36V64M36 50H64', 'stroke-width="9"')
  ].join('')),

  'w1-choices-and-consequences': symbol([
    path('M50 92V58'),
    arrow([50, 58], [26, 32]), arrow([50, 58], [74, 32]),
    circle(50, 58, 6, true),
    tick(18, 18, 1.3), cross(82, 18, 1.3)
  ].join(''))
};
