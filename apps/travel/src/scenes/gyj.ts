import { wheel } from '@/scenes/parts';

/** Gyeongju at dusk: Silla burial mounds, Cheomseongdae observatory,
 * Donggung pavilion over its pond, lanterns rising, a cyclist riding past. */
export function scene(): string {
  const courses = [190, 182, 174, 166, 158, 150, 142, 134]
    .map((y) => {
      const t = (196 - y) / 68;
      const half = 18 - 10 * Math.pow(t, 1.3);
      return `<path d="M${(400 - half).toFixed(1)} ${y}h${(half * 2).toFixed(1)}"/>`;
    })
    .join('');
  const lantern = (x: number, d: number) =>
    `<g transform="translate(${x},206)"><g class="a-rise" style="animation-duration:9s;animation-delay:${d}s"><rect x="-4" y="-7" width="8" height="10" rx="3" fill="#ffb84d"/><rect x="-4" y="-7" width="8" height="10" rx="3" fill="#ffe2a0" opacity=".5"/></g></g>`;
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="gySky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2650"/><stop offset=".6" stop-color="#6b4e8a"/><stop offset="1" stop-color="#e7a7a0"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#gySky)"/>
    <circle cx="660" cy="56" r="17" fill="#fdf1d0"/><circle cx="667" cy="51" r="15" fill="#4a3a6e" opacity=".55"/>
    <g fill="#fff" class="a-blink"><circle cx="90" cy="30" r="1.4"/><circle cx="250" cy="22" r="1.2"/><circle cx="520" cy="36" r="1.4"/><circle cx="740" cy="90" r="1.2"/></g>
    <!-- tumuli -->
    <path d="M-20 206q90-96 190 0z" fill="#3f6b4a"/><path d="M120 206q70-70 150 0z" fill="#4f7d55"/><path d="M640 206q80-80 180 0z" fill="#3f6b4a"/>
    <!-- Cheomseongdae -->
    <rect x="372" y="196" width="56" height="6" fill="#a88f6c"/><rect x="376" y="192" width="48" height="5" fill="#b9a184"/>
    <path d="M382 192c2-26 6-46 10-62h16c4 16 8 36 10 62z" fill="#d6bd98"/>
    <g stroke="#a88f6c" stroke-width="1.2">${courses}</g>
    <rect x="395" y="158" width="10" height="10" fill="#3a2f45"/>
    <rect x="388" y="124" width="24" height="4" fill="#b9a184"/><rect x="390" y="118" width="20" height="4" fill="#b9a184"/>
    <!-- Donggung pavilion + pond -->
    <ellipse cx="545" cy="214" rx="90" ry="10" fill="#241d3d"/>
    <g opacity=".35" transform="translate(0,412) scale(1,-1)"><rect x="502" y="186" width="86" height="12" fill="#ffcf7a"/><path d="M490 186q55-12 110 0l-8 7q-47-9-94 0z" fill="#2b2238"/></g>
    <rect x="500" y="196" width="90" height="5" fill="#3a2a2a"/>
    <g fill="#5a2a2a"><rect x="506" y="180" width="4" height="16"/><rect x="532" y="180" width="4" height="16"/><rect x="556" y="180" width="4" height="16"/><rect x="580" y="180" width="4" height="16"/></g>
    <rect x="510" y="182" width="70" height="12" fill="#ffcf7a" opacity=".85"/>
    <path d="M488 180q57-14 114 0l-8 7q-49-10-98 0z" fill="#2b2238"/><path d="M510 168h70l12 8h-94z" fill="#3b2f4a"/>
    ${lantern(500, 0)}${lantern(560, -3)}${lantern(610, -6)}${lantern(530, -4.5)}
    <!-- ground -->
    <rect y="206" width="800" height="24" fill="#2f4a3a"/><rect y="212" width="800" height="3" fill="#3d5a48"/>
    <!-- petals -->
    <g class="a-fall" fill="#f7c6d0" opacity=".85"><circle cx="60" cy="20" r="2"/><circle cx="220" cy="60" r="1.6"/><circle cx="340" cy="10" r="2"/><circle cx="470" cy="70" r="1.6"/><circle cx="600" cy="30" r="2"/><circle cx="720" cy="50" r="1.6"/></g>
    <!-- cyclist with a flower basket -->
    <g class="a-drive" style="animation-duration:14s"><g transform="translate(0,196)">
      <g class="a-ride">
        <path d="M6 22l12-14h14l-8 14M18 8l-3-6M32 8l2-6" fill="none" stroke="#e9e2f5" stroke-width="2.2" stroke-linejoin="round"/>
        <rect x="30" y="0" width="9" height="6" rx="1" fill="#b98a4a"/><circle cx="32" cy="-1" r="2" fill="#ff8fb1"/><circle cx="36" cy="-1.5" r="2" fill="#ffd36e"/>
        <rect x="11" y="0" width="9" height="3" rx="1.5" fill="#222"/>
        <path d="M17 1l6 9 2 10" fill="none" stroke="#2c3e63" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M13 2l4-18q2-4 6-2l3 2q2 2 0 6l-5 13z" fill="#f2a7a7"/>
        <path d="M23-12l10 12" stroke="#f2a7a7" stroke-width="3.2" stroke-linecap="round"/>
        <circle cx="21" cy="-22" r="6" fill="#e0a878"/><path d="M15-23q1-8 7-8q6 0 6 6q-5-3-13 2z" fill="#2b2238"/>
      </g>
      ${wheel(6, 22, 7)}${wheel(36, 22, 7)}
    </g></g>
  </svg>`;
}
