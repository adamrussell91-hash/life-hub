import { plane } from '@/scenes/parts';

/** Incheon: Songdo's towers, the cable-stayed Incheon Bridge over the Yellow
 * Sea, a container ship, and a plane climbing out of the airport. */
export function scene(): string {
  const cables = [420, 450, 480, 510, 530, 590, 610, 640, 670, 700]
    .map((x) => `<path d="M${x < 560 ? 557 : 563} ${x < 560 ? 104 + (560 - x) * 0.06 : 104 + (x - 560) * 0.06}L${x} 176"/>`)
    .join('');
  const containers = ['#c0392b', '#2f6db0', '#f2a23a', '#2f8f5b', '#c0392b', '#2f6db0']
    .map((c, k) => `<rect x="${14 + k * 9}" y="${k % 2 ? 2 : -4}" width="8" height="${k % 2 ? 6 : 12}" fill="${c}"/>`)
    .join('');
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="icSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e99a3d"/><stop offset=".55" stop-color="#f6c977"/><stop offset="1" stop-color="#fbeccb"/></linearGradient>
    <linearGradient id="icTrail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".75"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#icSky)"/>
    <circle cx="700" cy="140" r="38" fill="#ffe8b8" opacity=".9"/>
    <!-- Songdo skyline -->
    <g fill="#8a6a2a">
      <rect x="40" y="130" width="26" height="70"/><rect x="72" y="112" width="22" height="88"/><rect x="100" y="140" width="30" height="60"/>
      <path d="M140 200V70l30 22v108z"/><rect x="176" y="120" width="24" height="80"/><rect x="206" y="104" width="20" height="96"/><path d="M206 104l10-12 10 12z"/>
      <rect x="232" y="136" width="34" height="64"/><rect x="272" y="124" width="22" height="76"/><rect x="300" y="150" width="40" height="50"/>
    </g>
    <g fill="#ffe2a0" opacity=".55"><rect x="146" y="96" width="3" height="96"/><rect x="156" y="104" width="3" height="88"/><rect x="78" y="120" width="2" height="70"/><rect x="86" y="120" width="2" height="70"/><rect x="212" y="114" width="2" height="78"/></g>
    <!-- sea -->
    <rect y="186" width="800" height="44" fill="#6d8fa0"/>
    <path d="M0 200h340v-14H0z" fill="#6c581f"/>
    <g class="a-shimmer" stroke="#fbeccb" stroke-width="2" stroke-linecap="round" opacity=".6"><path d="M380 206h40M520 214h50M660 204h40M700 218h30"/></g>
    <!-- Incheon Bridge -->
    <rect x="340" y="176" width="460" height="5" fill="#4e3e18"/>
    <g fill="#4e3e18"><path d="M548 196l9-96h6l9 96h-6l-6-70-6 70z"/><rect x="552" y="160" width="16" height="3"/></g>
    <g stroke="#f4e0b8" stroke-width=".9" fill="none" opacity=".9">${cables}</g>
    <g fill="#4e3e18"><rect x="380" y="181" width="4" height="12"/><rect x="460" y="181" width="4" height="12"/><rect x="660" y="181" width="4" height="12"/><rect x="740" y="181" width="4" height="12"/></g>
    <!-- container ship -->
    <g class="a-drive-rev" style="animation-duration:34s;animation-delay:-10s"><g transform="translate(0,196)"><g class="a-rock"><path d="M0 8h80l-6 12H6z" fill="#3a4a5a"/><rect x="66" y="-6" width="10" height="14" fill="#f4f1ea"/>${containers}</g></g></g>
    <!-- plane climbing out -->
    <g class="a-takeoff"><g transform="translate(60,170) rotate(-12)">${plane('#6c581f', 'icTrail')}</g></g>
  </svg>`;
}
