/** Scene SVG from travel-planner.html mockup. Note: CHOCO/CHOO CHOO font may later change to Archivo. */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="kSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f06a3c"/><stop offset=".6" stop-color="#f6a55a"/><stop offset="1" stop-color="#fbd38d"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#kSky)"/>
    <circle cx="610" cy="120" r="62" fill="#ffe7a8" opacity=".95"/>
    <g class="a-shimmer" stroke="#fff3cf" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"><path d="M470 150q10-8 20 0t20 0t20 0"/><path d="M520 170q10-8 20 0t20 0t20 0"/></g>
    <!-- KL tower -->
    <g fill="#8a3a12"><rect x="300" y="92" width="7" height="130"/><ellipse cx="303.5" cy="100" rx="18" ry="10"/><rect x="302" y="50" width="3" height="42"/></g>
    <!-- Petronas Twin Towers -->
    <g fill="#5a2710">
      <path d="M380 230V90l6-12 6 12 1-18 5 18 6-12 6 12v140z"/><rect x="385" y="40" width="3" height="38"/>
      <path d="M440 230V90l6-12 6 12 1-18 5 18 6-12 6 12v140z"/><rect x="455" y="40" width="3" height="38"/>
      <rect x="410" y="128" width="30" height="7"/><path d="M412 135l12 18M438 135l-12 18" stroke="#5a2710" stroke-width="3"/>
    </g>
    <g fill="#ffd59a" opacity=".55"><rect x="386" y="100" width="3" height="120"/><rect x="394" y="100" width="3" height="120"/><rect x="446" y="100" width="3" height="120"/><rect x="454" y="100" width="3" height="120"/></g>
    <!-- city block -->
    <path d="M0 230V180h60v-20h40v30h50v-40h35v50h45v-25h40v55zM520 230v-50h40v-25h50v35h40v-20h50v25h100v35z" fill="#b8522a"/>
    <!-- palms -->
    <g class="a-sway" fill="#2f5d46"><rect x="150" y="150" width="5" height="80" fill="#6b3a1c"/><path d="M152 150c-30-8-40 4-44 12 14-8 28-8 44-12zM152 150c30-8 40 4 44 12-14-8-28-8-44-12zM152 150c-12-20-30-22-40-18 16 2 28 8 40 18zM152 150c12-20 30-22 40-18-16 2-28 8-40 18z"/></g>
    <g class="a-sway" fill="#2f5d46" style="animation-delay:-1.3s"><rect x="690" y="160" width="5" height="70" fill="#6b3a1c"/><path d="M692 160c-30-8-40 4-44 12 14-8 28-8 44-12zM692 160c30-8 40 4 44 12-14-8-28-8-44-12zM692 160c-12-20-30-22-40-18 16 2 28 8 40 18zM692 160c12-20 30-22 40-18-16 2-28 8-40 18z"/></g>
    <!-- Grab scooter -->
    <g class="a-drive"><g transform="translate(0,196)"><circle cx="8" cy="22" r="7" fill="#1b1b1b"/><circle cx="46" cy="22" r="7" fill="#1b1b1b"/><path d="M4 16h40l6 6H2z" fill="#00b14f"/><rect x="20" y="0" width="16" height="14" rx="3" fill="#00b14f"/><circle cx="18" cy="-6" r="6" fill="#00b14f"/></g></g>
    <!-- no durian sign -->
    <g transform="translate(730,40)"><circle r="22" fill="#fff"/><circle r="18" fill="#9bbf3a"/><g fill="#6f8f24"><path d="M-10-6l4-4 4 4M2-8l4-4 4 4M-8 4l4-4 4 4M4 4l4-4 4 4"/></g><circle r="20" fill="none" stroke="#c0392b" stroke-width="4"/><path d="M-14-14l28 28" stroke="#c0392b" stroke-width="4"/></g>
  </svg>`;
}
