// Questioning and feedback (Q&F).
import { circle, path, rect, dashed, thin, bubble, q, tick, arrow, symbol } from './parts.mjs';

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
