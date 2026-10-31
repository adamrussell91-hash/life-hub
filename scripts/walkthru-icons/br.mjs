// Behaviour and relationships (B&R).
import { P, FILL, circle, path, rect, thin, bubble, tick, cross, arrow, symbol } from './parts.mjs';

/** A heart centred on (x, y), about 18·s wide. */
const heart = (x, y, s = 1, fill = true) =>
  path(`M${x} ${y + 7 * s}C${x - 13 * s} ${y - 2 * s} ${x - 7 * s} ${y - 13 * s} ${x} ${y - 5 * s}C${x + 7 * s} ${y - 13 * s} ${x + 13 * s} ${y - 2 * s} ${x} ${y + 7 * s}Z`, fill ? FILL : '');

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
