// Curriculum planning (CP).
import { P, circle, path, rect, dashed, thin, standing, seated, q, arrow, figure, symbol } from './parts.mjs';

/** An open book with its spine at cx: two curved pages, `hw` wide each, `h` tall. */
const openBook = (cx, top, hw, h) =>
  path(`M${cx} ${top + 4}Q${cx - hw / 2} ${top - 2} ${cx - hw} ${top + 4}V${top + h}Q${cx - hw / 2} ${top + h - 6} ${cx} ${top + h}Z`) +
  path(`M${cx} ${top + 4}Q${cx + hw / 2} ${top - 2} ${cx + hw} ${top + 4}V${top + h}Q${cx + hw / 2} ${top + h - 6} ${cx} ${top + h}Z`);
const ring = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" stroke-width="2.2" stroke-dasharray="2 5"/>`;

export const figures = {
  'w1-sequence-concepts-in-small-steps': figure([
    standing(16, 84, { arms: [[-8, 16], [18, -2]] }),
    path('M32 84H46V74H60V64H74V54H88V44H102V34H116'),
    rect(105, 20, 10, 10, 2, true)
  ].join('')),

  'w1-designing-a-knowledge-rich-curriculum': figure([
    standing(18, 84, { arms: [[-8, 16], [22, -4]] }),
    rect(42, 72, 66, 12, 2), thin('M52 72v12M98 72v12'),
    rect(48, 58, 58, 12, 2), thin('M58 58v12'),
    rect(44, 44, 62, 12, 2), thin('M94 44v12'),
    rect(52, 30, 46, 12, 2, true)
  ].join('')),

  'w1-coherent-mapping': figure([
    standing(16, 84, { arms: [[-8, 16], [20, -6]] }),
    path('M74 44L50 22M74 44L84 14M74 44L106 32M74 44L52 68M74 44L98 70M50 22L84 14M106 32L98 70'),
    circle(50, 22, 6), circle(84, 14, 6), circle(106, 32, 6), circle(52, 68, 6), circle(98, 70, 6),
    circle(74, 44, 8, true)
  ].join('')),

  'w1-blend-knowledge-and-experience': figure([
    circle(42, 45, 32), circle(78, 45, 32),
    openBook(26, 36, 12, 18),
    standing(90, 64, { s: 0.42, arms: [[-8, 16], [12, -8]] }),
    circle(60, 45, 5, true)
  ].join('')),

  'w1-pitch-it-up': figure([
    standing(18, 84, { arms: [[-8, 16], [6, -24]] }),
    path('M52 84V12M110 84V12'),
    rect(52, 18, 58, 6, 2, true),
    dashed('M52 60H110'),
    arrow([81, 54], [81, 32])
  ].join('')),

  'w1-plan-for-reading': figure([
    standing(14, 84, { arms: [[-6, 18], [20, -8]] }),
    openBook(72, 14, 36, 38),
    thin('M44 28H64M44 36H64M80 28H100M80 36H96'),
    path('M90 13V30L94 26L98 30V13Z', 'fill="currentColor"'),
    seated(52, 66), seated(72, 66), seated(92, 66)
  ].join('')),

  'w1-tiered-questions-and-problems': figure([
    standing(16, 84, { arms: [[-8, 16], [18, -4]] }),
    rect(36, 64, 22, 20, 2), rect(64, 48, 22, 36, 2), rect(92, 32, 22, 52, 2, true),
    q(47, 50, 0.6), q(75, 34, 0.6), q(103, 18, 0.6)
  ].join('')),

  'w1-deliver-core-signpost-hinterland': figure([
    standing(16, 84, { arms: [[-8, 16], [20, -4]] }),
    ring(78, 46, 32),
    circle(78, 46, 12, true),
    arrow([92, 32], [110, 14]),
    arrow([60, 60], [46, 76])
  ].join(''))
};

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
