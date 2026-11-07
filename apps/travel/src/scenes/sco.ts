import { wheel } from '@/scenes/parts';

/** Scene SVG from travel-planner.html mockup. Note: CHOO CHOO text uses Archivo; CHOCO/CHOO CHOO display font may later change to Archivo (already Archivo in mockup). */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="sSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b4b8a"/><stop offset=".7" stop-color="#b184b8"/><stop offset="1" stop-color="#f2c6d8"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#sSky)"/>
    <path d="M0 170L90 80l60 50 90-100 110 110 70-60 110 90 90-70 90 70 90-40v170H0z" fill="#3e3566"/>
    <path d="M90 80l-22 22 14-4 8 10 10-12 12 6zM240 30l-26 28 16-6 10 12 12-14 14 8zM530 90l-20 18 12-2 8 8 8-10 12 4z" fill="#fff"/>
    <path d="M0 200l120-40 120 30 140-30 150 30 130-20 140 20v40H0z" fill="#5f4b75"/>
    <!-- Glenfinnan viaduct -->
    <g fill="#8b7aa6"><rect x="120" y="150" width="560" height="10"/>
      <path d="M120 160h560v70H120z M132 230v-40a14 14 0 0 1 28 0v40z" fill="none"/>
    </g>
    <g fill="#8b7aa6"><path id="arches" d="M120 160h560v70h-6v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44h-8v-44a16 16 0 0 0-32 0v44H120z"/></g>
    <!-- train crossing -->
    <g class="a-drive" style="animation-duration:13s"><g transform="translate(0,118)">
      <g class="a-puff"><circle cx="38" cy="-8" r="9" fill="#fff" opacity=".9"/></g>
      <g class="a-puff" style="animation-delay:-.55s"><circle cx="38" cy="-8" r="7" fill="#fff" opacity=".9"/></g>
      <g class="a-puff" style="animation-delay:-1.1s"><circle cx="38" cy="-8" r="8" fill="#fff" opacity=".9"/></g>
      <g class="a-ride">
        <g fill="#7a1f2b"><rect x="-150" y="4" width="66" height="22" rx="3"/><rect x="-80" y="4" width="66" height="22" rx="3"/></g>
        <g fill="#f2e6cf"><rect x="-150" y="13" width="66" height="2"/><rect x="-80" y="13" width="66" height="2"/></g>
        <g fill="#f6e7a8"><rect x="-144" y="7" width="10" height="5" rx="1"/><rect x="-128" y="7" width="10" height="5" rx="1"/><rect x="-112" y="7" width="10" height="5" rx="1"/><rect x="-74" y="7" width="10" height="5" rx="1"/><rect x="-58" y="7" width="10" height="5" rx="1"/><rect x="-42" y="7" width="10" height="5" rx="1"/></g>
        <rect x="-86" y="18" width="8" height="3" fill="#1b1b1b"/><rect x="-16" y="18" width="8" height="3" fill="#1b1b1b"/>
        <rect x="-10" y="-4" width="20" height="28" rx="2" fill="#1d1d1d"/><rect x="-12" y="-7" width="24" height="4" rx="1" fill="#1d1d1d"/>
        <rect x="-5" y="1" width="9" height="7" rx="1" fill="#f6e7a8"/>
        <rect x="8" y="6" width="36" height="16" rx="3" fill="#1d1d1d"/><circle cx="23" cy="6" r="4" fill="#1d1d1d"/>
        <rect x="8" y="12" width="36" height="1.5" fill="#c9a24a"/>
        <rect x="34" y="-4" width="8" height="11" fill="#1d1d1d"/><rect x="33" y="-6" width="10" height="3" fill="#1d1d1d"/>
        <rect x="-12" y="22" width="60" height="3" fill="#111"/><rect x="44" y="18" width="6" height="7" fill="#c0392b"/>
        <circle cx="45" cy="13" r="2.2" fill="#fff6c2"/>
        <text x="52" y="-18" font-family="Archivo, sans-serif" font-weight="800" font-stretch="125%" font-size="22" fill="#fff">CHOO CHOO</text>
      </g>
      ${wheel(-140, 27, 4.5)}${wheel(-94, 27, 4.5)}${wheel(-70, 27, 4.5)}${wheel(-24, 27, 4.5)}
      ${wheel(4, 26, 5.5, 1, '#c0392b')}${wheel(19, 26, 5.5, 1, '#c0392b')}${wheel(34, 27, 4.5, 1, '#c0392b')}
      <path class="a-rod" d="M4 26h15" stroke="#c9ccd0" stroke-width="2" stroke-linecap="round"/>
    </g></g>
    <!-- highland cow -->
    <g transform="translate(700,178)">
      <g class="a-swish"><path d="M36 10q12 10 8 30" fill="none" stroke="#9a4f1f" stroke-width="3" stroke-linecap="round"/><path d="M44 38q4 6-2 10q-4-6 2-10z" fill="#7d3f18"/></g>
      <ellipse cx="0" cy="18" rx="40" ry="22" fill="#c66a2c"/><path d="M-30 4q10-6 20 0t20 0t20 0" fill="none" stroke="#a5531f" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="-30" y="30" width="8" height="22" fill="#9a4f1f"/><rect x="18" y="30" width="8" height="22" fill="#9a4f1f"/>
      <g class="a-graze"><circle cx="-40" cy="8" r="16" fill="#c66a2c"/><path d="M-54-2c-14-2-18-10-16-16 4 8 10 10 16 8M-26-2c14-2 18-10 16-16-4 8-10 10-16 8" fill="#f2e6cf"/><path d="M-52-6q12 10 24 0q-2 10-12 12q-10-2-12-12z" fill="#9a4f1f"/><path d="M-54 2c6 8 22 8 28 0-4 10-24 10-28 0z" fill="#9a4f1f"/><ellipse cx="-40" cy="16" rx="8" ry="5" fill="#e3a07a"/></g>
    </g>
  </svg>`;
}
