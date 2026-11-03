// Mode B teaching (Book 3).
import { circle, path, rect, thin, q, arrow, FILL, symbol } from '../parts.mjs';

export const symbols = {
  'w3-play-detective': symbol([
    circle(42, 42, 31),
    path('M65 65L90 90', 'stroke-width="10"'),
    path('M42 23V46', 'stroke-width="6"'), circle(42, 58, 3.6, true)
  ].join('')),
  'w3-ambiguity-and-uncertainty': symbol([
    q(50, 49, 1.5),
    arrow([50, 27], [50, 5]), arrow([50, 75], [50, 95]),
    arrow([30, 50], [5, 50]), arrow([70, 50], [95, 50])
  ].join('')),
  'w3-independent-learning-video-tutorials': symbol([
    rect(5, 8, 90, 60, 5),
    path('M48 24L32 38L48 52Z', FILL), path('M32 24L16 38L32 52Z', FILL),
    rect(60, 24, 9, 28, 1, true), rect(75, 24, 9, 28, 1, true),
    path('M5 86H95'), circle(38, 86, 7, true)
  ].join('')),
  'w3-activity-rotations': symbol([
    rect(38, 4, 24, 24, 3, true), rect(72, 38, 24, 24, 3), rect(38, 72, 24, 24, 3), rect(4, 38, 24, 24, 3),
    arrow([66, 14], [84, 34], [84, 14]), arrow([84, 66], [66, 86], [84, 86]),
    arrow([34, 86], [16, 66], [16, 86]), arrow([16, 34], [34, 14], [16, 14])
  ].join('')),
  'w3-creativity-opportunities-for-choices': symbol([
    circle(12, 50, 9, true),
    arrow([24, 44], [56, 20]), arrow([25, 50], [56, 50]), arrow([24, 56], [56, 80]),
    circle(77, 17, 12), rect(65, 38, 24, 24, 3), path('M77 71L91 95H63Z')
  ].join('')),
  'w3-creativity-opportunities-to-experiment': symbol([
    path('M50 66C38 48 12 46 12 66C12 86 38 84 50 66C62 48 88 46 88 66C88 86 62 84 50 66Z'),
    path('M50 6L55 19L68 24L55 29L50 42L45 29L32 24L45 19Z', FILL)
  ].join('')),
  'w3-play-in-practice': symbol([
    rect(14, 62, 32, 32, 3), rect(46, 62, 32, 32, 3), rect(30, 30, 32, 32, 3),
    circle(46, 15, 12, true)
  ].join('')),
  'w3-role-plays-and-simulations': symbol([
    rect(22, 4, 18, 9, 2, true), rect(60, 4, 18, 9, 2, true),
    path('M31 14L8 74M31 14L60 74M69 14L40 74M69 14L92 74'),
    path('M6 84a44 9 0 1 0 88 0a44 9 0 1 0 -88 0Z', FILL)
  ].join('')),
  'w3-deep-end': symbol([
    rect(8, 50, 84, 44, 3),
    rect(8, 50, 21, 22, 0, true), rect(50, 50, 21, 22, 0, true), rect(29, 72, 21, 22, 0, true), rect(71, 72, 21, 22, 0, true),
    circle(50, 13, 9, true), path('M38 42L45 24H55L62 42Z', FILL)
  ].join('')),
  'w3-keep-it-real-authentic-products': symbol([
    rect(10, 5, 60, 80, 4), thin('M21 21H59M21 35H59M21 49H44'),
    path('M60 82L55 96L69 90L83 96L78 82Z', FILL),
    circle(69, 69, 17, true)
  ].join(''))
};
