import { pine } from '@/scenes/parts';

/** Gangneung: sunrise over the East Sea, Gyeongpo pines, and Anmok's coffee
 * street with a big steaming cup sign. */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="gnSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f07a43"/><stop offset=".55" stop-color="#f7b267"/><stop offset="1" stop-color="#fde3c0"/></linearGradient>
    <linearGradient id="gnSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d7ea6"/><stop offset="1" stop-color="#2b5f80"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#gnSky)"/>
    <g class="a-sunrise"><circle cx="400" cy="170" r="44" fill="#ffe9b8"/></g>
    <rect y="166" width="800" height="44" fill="url(#gnSea)"/>
    <g class="a-shimmer" stroke="#ffd9a0" stroke-width="3" stroke-linecap="round" opacity=".8"><path d="M372 176h56M382 186h36M366 196h68"/></g>
    <g class="a-shimmer" stroke="#cfe6f2" stroke-width="2" stroke-linecap="round" opacity=".5" style="animation-delay:-1s"><path d="M60 182h40M220 194h50M560 180h40M690 192h50"/></g>
    <!-- fishing boat on the horizon -->
    <g class="a-drive-rev" style="animation-duration:40s;animation-delay:-12s"><g transform="translate(0,160)"><path d="M0 6h26l-4 5H4z" fill="#33424f"/><rect x="14" y="0" width="7" height="6" fill="#33424f"/><path d="M8 6V-4" stroke="#33424f" stroke-width="1.2"/></g></g>
    <!-- beach + foam -->
    <path d="M0 206q200-8 400 0t400 0v24H0z" fill="#f3d9a4"/>
    <path class="a-shimmer" d="M0 206q100-6 200 0t200 0t200 0t200 0" fill="none" stroke="#fff" stroke-width="3" opacity=".85"/>
    <!-- pines -->
    ${pine(60, 214, 92)}${pine(118, 216, 70, -1.2)}${pine(200, 214, 54, -2.4)}${pine(740, 214, 80, -.8)}
    <!-- coffee street -->
    <g>
      <rect x="470" y="168" width="44" height="42" fill="#fff8ee"/><path d="M466 170h52l-4-8h-44z" fill="#2f5d46"/><rect x="478" y="182" width="12" height="14" fill="#9fd0e0"/><rect x="496" y="182" width="12" height="28" fill="#7a4b2a"/>
      <rect x="514" y="160" width="52" height="50" fill="#c96f4a"/><rect x="520" y="172" width="40" height="18" fill="#ffd89a" opacity=".9"/><rect x="532" y="194" width="14" height="16" fill="#5a2f1a"/>
      <rect x="566" y="174" width="40" height="36" fill="#e8d2b0"/><path d="M562 176h48l-24-14z" fill="#8a3a12"/><rect x="574" y="186" width="10" height="10" fill="#9fd0e0"/><rect x="590" y="186" width="10" height="10" fill="#9fd0e0"/>
      <rect x="606" y="182" width="30" height="28" fill="#fff8ee"/><path d="M604 184h34v-6h-34z" fill="#c0392b"/><path d="M606 178l5 4h5l5-4 5 4h5l5-4" fill="#fff" opacity=".9"/>
    </g>
    <!-- big cup sign on the roof -->
    <g transform="translate(528,120)">
      <rect x="10" y="30" width="3" height="12" fill="#5a2f1a"/><rect x="18" y="30" width="3" height="12" fill="#5a2f1a"/>
      <path d="M0 4h32l-4 28H4z" fill="#fff"/><rect x="-2" y="0" width="36" height="6" rx="2" fill="#7a4b2a"/><path d="M3 14h26l-1 8H4z" fill="#c96f4a"/>
      <g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"><path class="a-steam" d="M10-4q-4-6 0-12t0-12"/><path class="a-steam" style="animation-delay:-.9s" d="M22-4q-4-6 0-12t0-12"/></g>
    </g>
    <!-- gulls -->
    <g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><g class="a-bob"><path class="a-flap" d="M300 60q6-6 12 0q6-6 12 0"/></g><g class="a-bob" style="animation-delay:-1.3s"><path class="a-flap" style="animation-delay:-.3s" d="M640 80q5-5 10 0q5-5 10 0"/></g></g>
  </svg>`;
}
