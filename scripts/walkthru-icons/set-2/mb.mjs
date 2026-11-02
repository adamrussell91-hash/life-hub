// Mode B teaching (Book 2).
import { circle, path, rect, dashed, thin, bubble, q, arrow, FILL, symbol } from '../parts.mjs';

export const symbols = {
  'w2-hands-on': symbol([
    path('M42 8H58'), path('M44 8V34L20 80Q16 92 28 92H72Q84 92 80 80L56 34V8'),
    path('M34 60H66L80 82Q84 92 72 92H28Q16 92 20 82Z', FILL)
  ].join('')),

  'w2-oracy-public-speaking': symbol([
    rect(36, 4, 28, 8, 2),
    path('M38 12L10 74M62 12L90 74'), path('M10 74Q50 96 90 74'),
    rect(43, 28, 14, 24, 7, true), path('M50 52V76M38 78H62')
  ].join('')),

  'w2-oracy-presentations': symbol([
    rect(6, 8, 88, 58, 4),
    circle(30, 37, 15), path('M30 37V22A15 15 0 0 1 45 37Z', FILL),
    thin('M56 28H84M56 38H84M56 48H74'),
    path('M50 66V80M50 80L32 94M50 80L68 94')
  ].join('')),

  'w2-oracy-recitation-and-performance': symbol([
    rect(8, 6, 54, 88, 3),
    thin('M17 22H52M17 34H52M17 46H52M17 58H52M17 70H52M17 82H40'),
    bubble(56, 8, 38, 28, [60, 46], { fill: true })
  ].join('')),

  'w2-off-piste': symbol([
    path('M4 92L40 14L58 46L68 32L96 92Z'),
    path('M40 34L34 80'),
    dashed('M38 50Q52 54 60 70'),
    circle(68, 76, 8, true)
  ].join('')),

  'w2-self-directed-learning': symbol([
    q(50, 11, 0.75),
    rect(16, 30, 68, 42, 3, true),
    path('M34 72L24 94M66 72L76 94M50 72V90')
  ].join('')),

  'w2-museum-gallery-visits': symbol([
    path('M43 8H57L54 18Q72 26 66 40Q62 50 56 54H44Q38 50 34 40Q28 26 46 18Z', FILL),
    thin('M34 26Q22 22 30 12M66 26Q78 22 70 12'),
    rect(30, 60, 40, 32, 2), path('M22 60H78M22 92H78')
  ].join('')),

  'w2-online-class-forums': symbol([
    bubble(6, 6, 38, 26, [18, 40], { fill: true }),
    bubble(54, 12, 40, 26, [78, 46], { lines: 2 }),
    rect(22, 50, 56, 32, 3), path('M22 82L10 92H90L78 82')
  ].join(''))
};
