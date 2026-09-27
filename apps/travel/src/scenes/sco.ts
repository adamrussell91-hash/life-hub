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
    <g class="a-drive" style="animation-duration:13s"><g transform="translate(0,122)">
      <g class="a-puff"><circle cx="34" cy="-2" r="9" fill="#fff" opacity=".9"/></g>
      <g class="a-puff" style="animation-delay:-.8s"><circle cx="34" cy="-2" r="7" fill="#fff" opacity=".9"/></g>
      <rect x="-150" y="8" width="66" height="22" rx="3" fill="#2f5d46"/><rect x="-80" y="8" width="66" height="22" rx="3" fill="#2f5d46"/>
      <path d="M-10 8h40l12 10v12h-52z" fill="#1f3f30"/><rect x="26" y="-2" width="8" height="10" fill="#1f3f30"/>
      <g fill="#f6e7a8"><rect x="-144" y="13" width="10" height="7"/><rect x="-128" y="13" width="10" height="7"/><rect x="-112" y="13" width="10" height="7"/><rect x="-74" y="13" width="10" height="7"/><rect x="-58" y="13" width="10" height="7"/><rect x="-42" y="13" width="10" height="7"/></g>
      <text x="48" y="-14" font-family="Archivo, sans-serif" font-weight="800" font-stretch="125%" font-size="22" fill="#fff">CHOO CHOO</text>
    </g></g>
    <!-- highland cow -->
    <g transform="translate(700,178)"><ellipse cx="0" cy="18" rx="40" ry="22" fill="#c66a2c"/><rect x="-30" y="30" width="8" height="22" fill="#9a4f1f"/><rect x="18" y="30" width="8" height="22" fill="#9a4f1f"/><circle cx="-40" cy="8" r="16" fill="#c66a2c"/><path d="M-54-2c-14-2-18-10-16-16 4 8 10 10 16 8M-26-2c14-2 18-10 16-16-4 8-10 10-16 8" fill="#f2e6cf"/><path d="M-54 2c6 8 22 8 28 0-4 10-24 10-28 0z" fill="#9a4f1f"/></g>
  </svg>`;
}
