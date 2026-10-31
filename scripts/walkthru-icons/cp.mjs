// Curriculum planning (CP).
import { circle, path, rect, dashed, thin, q, arrow, symbol } from './parts.mjs';

/** An open book with its spine at cx: two curved pages, `hw` wide each, `h` tall. */
const openBook = (cx, top, hw, h) =>
  path(`M${cx} ${top + 4}Q${cx - hw / 2} ${top - 2} ${cx - hw} ${top + 4}V${top + h}Q${cx - hw / 2} ${top + h - 6} ${cx} ${top + h}Z`) +
  path(`M${cx} ${top + 4}Q${cx + hw / 2} ${top - 2} ${cx + hw} ${top + 4}V${top + h}Q${cx + hw / 2} ${top + h - 6} ${cx} ${top + h}Z`);
const ring = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" stroke-width="2.2" stroke-dasharray="2 5"/>`;

export const symbols = {
  'w1-sequence-concepts-in-small-steps': symbol([
    path('M10 88H30V70H50V52H70V34H90'),
    rect(74, 12, 14, 14, 2, true)
  ].join('')),

  'w1-designing-a-knowledge-rich-curriculum': symbol([
    rect(12, 70, 76, 18, 3), thin('M24 70v18M76 70v18'),
    rect(18, 48, 66, 18, 3), thin('M30 48v18'),
    rect(24, 26, 54, 18, 3, true)
  ].join('')),

  'w1-coherent-mapping': symbol([
    path('M50 52L22 24M50 52L78 20M50 52L20 80M50 52L82 78M22 24L78 20'),
    circle(22, 24, 9), circle(78, 20, 9), circle(20, 80, 9), circle(82, 78, 9),
    circle(50, 52, 11, true)
  ].join('')),

  'w1-blend-knowledge-and-experience': symbol([
    circle(36, 50, 28), circle(64, 50, 28),
    thin('M18 42H32M18 50H32M18 58H28'),
    circle(50, 50, 7, true)
  ].join('')),

  'w1-pitch-it-up': symbol([
    path('M18 92V10M82 92V10'),
    rect(18, 16, 64, 9, 3, true),
    dashed('M18 70H82'),
    arrow([50, 64], [50, 36])
  ].join('')),

  'w1-plan-for-reading': symbol([
    openBook(50, 22, 40, 56),
    thin('M18 40H40M18 50H40M18 60H34M60 40H82M60 50H82'),
    path('M68 21V44L74 38L80 44V21Z', 'fill="currentColor"')
  ].join('')),

  'w1-tiered-questions-and-problems': symbol([
    rect(10, 62, 22, 28, 3), rect(39, 44, 22, 46, 3), rect(68, 28, 22, 62, 3, true),
    q(79, 12, 0.9)
  ].join('')),

  'w1-deliver-core-signpost-hinterland': symbol([
    ring(46, 54, 36),
    circle(46, 54, 15, true),
    arrow([66, 34], [90, 10])
  ].join(''))
};
