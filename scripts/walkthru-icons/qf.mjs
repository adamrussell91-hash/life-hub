// Questioning and feedback (Q&F).
import { P, FILL, circle, path, rect, dashed, thin, standing, seated, armsUp, desk, bubble, thought, q, tick, cross, arrow, figure, symbol } from './parts.mjs';

export const figures = {
  'w1-cold-calling': figure([
    standing(22, 84, { arms: [[-8, 16], [26, -4]] }),
    bubble(34, 2, 24, 18, [38, 26], {}),
    q(46, 11, 0.62),
    dashed('M52 32 L74 44'),
    seated(64, 52), seated(82, 52, { fill: true }), seated(100, 52),
    desk(54, 112, 74)
  ].join('')),

  'w1-think-pair-share': figure([
    seated(14, 46), thought([22, 34], [30, 16]),
    arrow([30, 56], [40, 56]),
    seated(52, 46), seated(68, 46), bubble(51, 18, 18, 12, [58, 34], { lines: 1, rx: 4 }),
    arrow([80, 56], [90, 56]),
    standing(106, 76, { s: 0.68, arms: [[-8, 16], [10, -14]] }),
    bubble(84, 6, 22, 14, [96, 26], { fill: true, rx: 4 }),
    path('M2 76H118')
  ].join('')),

  'w1-show-me-boards': figure([
    armsUp(22, 50), rect(10, 14, 24, 17, 2), tick(22, 22, 0.9),
    armsUp(60, 50), rect(48, 14, 24, 17, 2, true),
    armsUp(98, 50), rect(86, 14, 24, 17, 2), tick(98, 22, 0.9),
    path('M4 72H116')
  ].join('')),

  'w1-check-for-understanding': figure([
    standing(18, 84, { arms: [[-8, 16], [20, -6]] }),
    path(P([38, 25], [42, 21])), circle(49, 15, 8),
    tick(72, 30), q(90, 26, 0.7), tick(108, 30),
    seated(72, 52), seated(90, 52, { fill: true }), seated(108, 52),
    desk(62, 116, 74)
  ].join('')),

  'w1-say-it-again-better': figure([
    seated(18, 52), desk(4, 36, 74),
    bubble(30, 30, 24, 14, [26, 48], { lines: 1, rx: 4 }),
    arrow([50, 28], [60, 18], [50, 20]),
    bubble(62, 4, 52, 34, [68, 44], { lines: 3, rx: 6 })
  ].join('')),

  'w1-probing-questions': figure([
    standing(18, 84, { arms: [[-8, 16], [22, -2]] }),
    q(48, 16, 1), q(66, 30, 0.8), q(82, 42, 0.62),
    seated(104, 52, { fill: true }), desk(88, 118, 74)
  ].join('')),

  'w1-process-questions': figure([
    seated(18, 52), desk(4, 36, 74),
    rect(38, 26, 16, 16, 3), arrow([56, 34], [65, 34]), rect(68, 26, 16, 16, 3, true), arrow([86, 34], [95, 34]), rect(98, 26, 16, 16, 3),
    q(76, 10, 0.7),
    dashed('M30 48 Q36 46 40 44')
  ].join('')),

  'w1-whole-class-feedback': figure([
    standing(14, 84, { arms: [[-6, 18], [16, -12]] }),
    rect(30, 4, 56, 32, 3), rect(30, 4, 56, 8, 3, true), thin('M36 19H64M36 27H58'), tick(76, 23, 0.8),
    seated(44, 56), seated(62, 56), seated(80, 56), seated(98, 56),
    path('M32 78H114')
  ].join('')),

  'w1-feedback-that-moves-forward': figure([
    rect(6, 10, 34, 44, 3), thin('M12 20H34M12 28H34M12 36H26'), circle(30, 44, 5),
    arrow([44, 34], [62, 34]),
    path('M54 84H70V68H86V52H114'),
    standing(98, 52, { s: 0.6, arms: [[-8, 14], [12, -6]], legs: 'walk', fill: true })
  ].join('')),

  'w1-feedback-as-actions': figure([
    seated(18, 54), desk(4, 38, 76),
    bubble(4, 6, 34, 22, [18, 38], { lines: 2, rx: 4 }),
    arrow([42, 30], [56, 30]),
    rect(62, 6, 52, 62, 4),
    rect(68, 14, 9, 9, 2, true), thin('M83 18.5H106'),
    rect(68, 32, 9, 9, 2), thin('M83 36.5H106'),
    rect(68, 50, 9, 9, 2), thin('M83 54.5H100')
  ].join(''))
};

export const symbols = {
  'w1-cold-calling': symbol([
    bubble(8, 8, 38, 30, [16, 46], {}), q(27, 21, 0.95),
    arrow([50, 22], [64, 56], [74, 26]),
    circle(18, 76, 8), circle(40, 76, 8), circle(62, 76, 8, true), circle(84, 76, 8)
  ].join('')),

  'w1-think-pair-share': symbol([
    circle(14, 50, 8),
    arrow([26, 50], [36, 50]),
    circle(48, 38, 8), circle(48, 62, 8),
    arrow([60, 50], [70, 50]),
    circle(85, 26, 8), circle(85, 50, 8, true), circle(85, 74, 8)
  ].join('')),

  'w1-show-me-boards': symbol([
    rect(6, 24, 26, 22, 3), tick(19, 35, 0.9), path('M19 46V78'),
    rect(37, 24, 26, 22, 3, true), path('M50 46V78'),
    rect(68, 24, 26, 22, 3), tick(81, 35, 0.9), path('M81 46V78'),
    path('M6 84H94')
  ].join('')),

  'w1-check-for-understanding': symbol([
    circle(42, 42, 26), path('M61 61L86 86', 'stroke-width="7"'),
    tick(42, 42, 1.7)
  ].join('')),

  'w1-say-it-again-better': symbol([
    bubble(6, 58, 30, 20, [12, 86], { lines: 1, rx: 4 }),
    arrow([24, 50], [44, 28], [24, 30]),
    bubble(48, 8, 46, 40, [58, 56], { lines: 3, rx: 6 })
  ].join('')),

  'w1-probing-questions': symbol([
    q(22, 24, 1.5), q(48, 46, 1.15), q(70, 64, 0.85),
    circle(86, 86, 7, true)
  ].join('')),

  'w1-process-questions': symbol([
    q(50, 22, 1.3),
    rect(4, 50, 22, 22, 4), arrow([28, 61], [37, 61]), rect(39, 50, 22, 22, 4, true), arrow([63, 61], [72, 61]), rect(74, 50, 22, 22, 4)
  ].join('')),

  'w1-whole-class-feedback': symbol([
    rect(18, 6, 64, 38, 4), rect(18, 6, 64, 10, 4, true), thin('M26 25H62M26 34H52'), tick(72, 29, 0.8),
    dashed('M34 48L18 66M44 50L40 66M56 50L60 66M66 48L82 66'),
    circle(16, 78, 7), circle(38, 78, 7), circle(62, 78, 7), circle(84, 78, 7)
  ].join('')),

  'w1-feedback-that-moves-forward': symbol([
    rect(6, 8, 36, 46, 4), thin('M13 20H35M13 29H35M13 38H27'), circle(32, 46, 4),
    path('M40 92H56V76H72V60H94'),
    arrow([50, 52], [86, 22], [56, 26]),
    circle(84, 48, 6, true)
  ].join('')),

  'w1-feedback-as-actions': symbol([
    bubble(4, 8, 38, 28, [14, 44], { lines: 2, rx: 4 }),
    arrow([42, 52], [52, 52]),
    rect(56, 8, 40, 84, 5),
    rect(63, 18, 11, 11, 2, true), thin('M80 23.5H90'),
    rect(63, 44, 11, 11, 2), thin('M80 49.5H90'),
    rect(63, 70, 11, 11, 2), thin('M80 75.5H88')
  ].join(''))
};
