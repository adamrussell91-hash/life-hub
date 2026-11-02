// Questioning and feedback (Q&F), Book 2.
import { circle, path, rect, thin, bubble, q, tick, cross, arrow, symbol, FILL } from '../parts.mjs';

export const symbols = {
  'w2-no-opt-out': symbol([
    rect(26, 6, 48, 60, 4), q(50, 26, 1.4),
    path('M26 46L6 60V94H94V60L74 46'), path('M6 60L50 82L94 60')
  ].join('')),

  'w2-hands-up-for-asking-or-ideas': symbol([
    bubble(4, 6, 38, 30, [14, 44], {}), q(23, 19, 0.9),
    circle(74, 24, 14, true), path('M67 42H81M69 48H79'), path('M94 24H98M74 4V2M90 8L93 5M58 8L55 5'),
    path('M50 92V70M50 70L28 50M50 70L72 56')
  ].join('')),

  'w2-randomised-questioning': symbol([
    circle(50, 42, 34),
    path('M50 42V8M50 42L80 25M50 42L80 59M50 42V76M50 42L20 59M50 42L20 25'),
    path('M50 76L34 94M50 76L66 94M26 94H74'),
    circle(50, 8, 7, true)
  ].join('')),

  'w2-normalise-error-and-uncertainty': symbol([
    circle(56, 40, 36), q(42, 36, 1.5), cross(72, 40, 1.8),
    circle(18, 78, 6), circle(8, 92, 3)
  ].join('')),

  'w2-redrafting': symbol([
    rect(4, 30, 38, 62, 4), path('M12 44q5 -4 10 0t10 0M12 58q5 -4 10 0t10 0M12 72q5 -4 10 0t10 0', 'stroke-width="2.2"'),
    rect(58, 30, 38, 62, 4), thin('M66 44H88M66 54H88'), tick(77, 72, 1.3),
    arrow([22, 22], [78, 22], [50, -4])
  ].join('')),

  'w2-selective-marking': symbol([
    rect(20, 6, 70, 88, 4), thin('M30 18H80M30 28H80M30 72H80M30 82H64'),
    rect(30, 38, 50, 24, 2, true),
    arrow([2, 50], [18, 50])
  ].join('')),

  'w2-spot-your-mistakes': symbol([
    path('M36 6H64L60 22H40Z', FILL),
    path('M40 22L14 86M60 22L86 86'),
    path('M4 86H96'),
    cross(50, 62, 2.4)
  ].join('')),

  'w2-success-criteria': symbol([
    tick(14, 40, 1.1), thin('M28 40H52'),
    tick(14, 62, 1.1), thin('M28 62H52'),
    tick(14, 84, 1.1), thin('M28 84H52'),
    circle(76, 26, 18, true), path('M66 44L60 76L76 66L92 76L86 44')
  ].join(''))
};
