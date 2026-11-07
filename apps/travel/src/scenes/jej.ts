/** Jeju: Hallasan behind, Seongsan Ilchulbong in the sea, a dol hareubang
 * by the stone wall, tangerine trees, a haenyeo bobbing with her float, and
 * a pony trotting across the field. */
export function scene(): string {
  const tree = (x: number, y: number, s: number, d: number) =>
    `<g class="a-sway" style="animation-delay:${d}s"><rect x="${x - 2}" y="${y}" width="4" height="${22 * s}" fill="#6b3a1c"/><ellipse cx="${x}" cy="${y - 4}" rx="${22 * s}" ry="${17 * s}" fill="#2f6b3e"/><g fill="#f7931e"><circle cx="${x - 10 * s}" cy="${y - 8}" r="${3 * s}"/><circle cx="${x + 6 * s}" cy="${y - 12 * s}" r="${3 * s}"/><circle cx="${x + 12 * s}" cy="${y}" r="${3 * s}"/><circle cx="${x - 3 * s}" cy="${y + 4}" r="${3 * s}"/><circle cx="${x - 14 * s}" cy="${y + 2}" r="${2.6 * s}"/></g></g>`;
  const stones = Array.from({ length: 70 }, (_, k) => {
    const row = k % 2;
    const x = Math.floor(k / 2) * 23 + row * 11 + ((k * 7) % 5);
    return `<ellipse cx="${x}" cy="${row ? 211 : 218}" rx="${7 + ((k * 3) % 4)}" ry="${4 + (k % 2)}" transform="rotate(${((k * 13) % 17) - 8} ${x} ${row ? 211 : 218})"/>`;
  }).join('');
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="jjSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc1e0"/><stop offset="1" stop-color="#d7eef5"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#jjSky)"/>
    <g fill="#fff" opacity=".9">
      <g class="a-drive" style="animation-duration:50s"><ellipse cx="120" cy="50" rx="36" ry="13"/><ellipse cx="150" cy="42" rx="24" ry="11"/></g>
      <g class="a-drive" style="animation-duration:50s;animation-delay:-25s"><ellipse cx="300" cy="34" rx="30" ry="11"/><ellipse cx="326" cy="28" rx="18" ry="8"/></g>
    </g>
    <!-- Hallasan -->
    <path d="M40 196Q250 86 360 74h70Q560 86 760 196z" fill="#5d7f6a"/>
    <path d="M360 74h70l-10 8h-50z" fill="#4a6a57"/>
    <path d="M300 96q-30 30-80 60M480 92q40 30 90 64" stroke="#6f927b" stroke-width="3" fill="none" opacity=".7"/>
    <!-- sea + Seongsan -->
    <rect x="440" y="184" width="360" height="22" fill="#2f8fb0"/>
    <path d="M628 190l14-38 8 4 8-8 10 6 10-6 8 8 8-4 12 38z" fill="#4f6f45"/><path d="M650 156l8-8 10 6 10-6 8 8" fill="none" stroke="#6b8c5a" stroke-width="2"/>
    <g class="a-shimmer" stroke="#d7eef5" stroke-width="2" stroke-linecap="round" opacity=".7"><path d="M460 194h30M560 198h26M720 196h30"/></g>
    <!-- haenyeo with float -->
    <g transform="translate(570,190)"><g class="a-bob"><circle r="5" fill="#f26b1d"/><path d="M-5 0h10" stroke="#fff" stroke-width="1.2"/><circle cx="11" cy="1" r="3.6" fill="#1b1b1b"/><rect x="9" y="-1" width="4" height="1.6" fill="#9fd0e0"/></g></g>
    <!-- field -->
    <path d="M0 196q200-14 440-4v38H0z" fill="#7fae5e"/><rect x="430" y="204" width="370" height="26" fill="#7fae5e"/>
    ${tree(150, 182, 1, 0)}${tree(258, 188, .8, -1.5)}
    <!-- dol hareubang -->
    <g transform="translate(400,150)">
      <ellipse cx="0" cy="66" rx="20" ry="4" fill="#4b5d3c" opacity=".5"/>
      <path d="M-15 14q-4 26 0 52h30q4-26 0-52z" fill="#6e6e6e"/>
      <ellipse cx="0" cy="12" rx="15" ry="18" fill="#7a7a7a"/>
      <path d="M-13-2q0-16 13-16t13 16z" fill="#606060"/><rect x="-14" y="-4" width="28" height="4" rx="2" fill="#555"/>
      <g fill="#3f3f3f"><ellipse cx="-6" cy="8" rx="4" ry="5"/><ellipse cx="6" cy="8" rx="4" ry="5"/></g><g fill="#9a9a9a"><circle cx="-6" cy="8" r="1.6"/><circle cx="6" cy="8" r="1.6"/></g>
      <path d="M-3 14q3-4 6 0v5h-6z" fill="#5a5a5a"/><path d="M-5 24q5 2 10 0" stroke="#444" stroke-width="1.6" fill="none"/>
      <path d="M-14 40q8-10 14-4M14 46q-8-10-14-4" stroke="#555" stroke-width="5" fill="none" stroke-linecap="round"/>
      <g fill="#555" opacity=".7"><circle cx="-8" cy="56" r="1"/><circle cx="6" cy="58" r="1"/><circle cx="-2" cy="-10" r="1"/><circle cx="9" cy="20" r="1"/><circle cx="-10" cy="22" r="1"/></g>
    </g>
    <!-- basalt wall -->
    <g fill="#33302e">${stones}</g>
    <!-- pony -->
    <g class="a-drive-rev" style="animation-duration:20s"><g transform="translate(0,170)"><g class="a-ride">
      <g class="a-trot" stroke="#5a3418" stroke-width="3.5" stroke-linecap="round"><path d="M10 24l-2 14M34 24l2 14"/></g>
      <g class="a-trot2" stroke="#6b3e1d" stroke-width="3.5" stroke-linecap="round"><path d="M14 24l3 14M30 24l-3 14"/></g>
      <ellipse cx="22" cy="20" rx="16" ry="9" fill="#8a5428"/>
      <path d="M8 16l-8-14q-2-4 2-6l8 2 4 12z" fill="#8a5428"/><path d="M-1-2q-3 2-1 6l3 1z" fill="#5a3418"/>
      <path d="M4-4q4 2 8 14" stroke="#3a2210" stroke-width="3" fill="none"/>
      <path d="M38 16q8 2 8 16" stroke="#3a2210" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="3" cy="0" r="1" fill="#111"/>
    </g></g></g>
  </svg>`;
}
