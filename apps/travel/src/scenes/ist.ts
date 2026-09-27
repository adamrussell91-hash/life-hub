/** Scene SVG from travel-planner.html mockup. Note: CHOCO/CHOO CHOO font may later change to Archivo. */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="iSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c5d7a"/><stop offset=".65" stop-color="#3d8ea8"/><stop offset="1" stop-color="#f4b07a"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#iSky)"/>
    <circle cx="660" cy="150" r="40" fill="#ffd3a1" opacity=".8"/>
    <!-- mosque -->
    <g fill="#12384b">
      <rect x="330" y="120" width="190" height="70"/><path d="M365 125a60 55 0 0 1 120 0z"/><path d="M340 140a28 24 0 0 1 56 0zM454 140a28 24 0 0 1 56 0z"/>
      <rect x="422" y="58" width="6" height="14"/><path d="M425 50l3 8h-6z"/>
      <path d="M300 190V70l5-24 5 24v120z"/><path d="M540 190V70l5-24 5 24v120z"/><path d="M318 190V92l4-20 4 20v98z"/><path d="M526 190V92l4-20 4 20v98z"/>
    </g>
    <!-- Galata tower -->
    <g fill="#0e2e3d"><rect x="130" y="100" width="34" height="90"/><path d="M125 100l22-44 22 44z"/><rect x="126" y="96" width="42" height="6"/></g>
    <path d="M0 190h160v-18h40v18h600v40H0z" fill="#0e2e3d"/>
    <rect y="196" width="800" height="34" fill="#1e6f8c"/>
    <g stroke="#bfe3ee" stroke-width="2" opacity=".6" class="a-shimmer"><path d="M60 210h40M240 218h60M520 212h50M700 220h40"/></g>
    <!-- ferry -->
    <g class="a-drive-rev"><g transform="translate(0,178)"><path d="M0 18h96l-10 14H8z" fill="#fff"/><rect x="14" y="6" width="64" height="12" rx="2" fill="#f4f1ea"/><rect x="40" y="-6" width="10" height="12" fill="#c0392b"/><g fill="#1e6f8c"><rect x="20" y="9" width="8" height="5"/><rect x="34" y="9" width="8" height="5"/><rect x="48" y="9" width="8" height="5"/><rect x="62" y="9" width="8" height="5"/></g></g></g>
    <!-- gulls -->
    <g fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><g class="a-bob"><path class="a-flap" d="M600 60q8-8 16 0q8-8 16 0"/></g><g class="a-bob" style="animation-delay:-1s"><path class="a-flap" style="animation-delay:-.3s" d="M230 40q7-7 14 0q7-7 14 0"/></g><g class="a-bob" style="animation-delay:-2s"><path class="a-flap" d="M700 90q6-6 12 0q6-6 12 0"/></g></g>
  </svg>`;
}
