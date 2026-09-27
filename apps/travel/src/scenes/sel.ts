/** Scene SVG from travel-planner.html mockup. Note: CHOCO/CHOO CHOO font may later change to Archivo. */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="kSeoul" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a4a"/><stop offset=".7" stop-color="#3e5c8a"/><stop offset="1" stop-color="#a8b8d8"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#kSeoul)"/>
    <path d="M380 200q80-120 170-120t170 120z" fill="#2a3d63"/>
    <!-- N Seoul Tower -->
    <g fill="#e8eef6"><rect x="546" y="40" width="8" height="46"/><rect x="538" y="36" width="24" height="10" rx="3"/><rect x="549" y="6" width="2" height="30"/></g>
    <circle cx="550" cy="41" r="3" fill="#ff8fb1" class="a-blink"/>
    <!-- hanok roof -->
    <g fill="#16223d"><path d="M60 150q140-30 280 0l-12 14q-128-24-256 0z"/><rect x="90" y="162" width="220" height="40"/><g fill="#d65a5a"><rect x="110" y="168" width="10" height="34"/><rect x="190" y="168" width="10" height="34"/><rect x="270" y="168" width="10" height="34"/></g></g>
    <path d="M0 200h800v30H0z" fill="#e8eef6"/>
    <g class="a-fall" fill="#fff"><circle cx="40" cy="10" r="2.5"/><circle cx="130" cy="60" r="2"/><circle cx="220" cy="20" r="3"/><circle cx="310" cy="80" r="2"/><circle cx="400" cy="30" r="2.5"/><circle cx="490" cy="90" r="2"/><circle cx="600" cy="10" r="3"/><circle cx="690" cy="70" r="2"/><circle cx="770" cy="30" r="2.5"/></g>
    <g class="a-fall" fill="#fff" style="animation-delay:-3.5s"><circle cx="80" cy="40" r="2"/><circle cx="170" cy="0" r="2.5"/><circle cx="260" cy="70" r="2"/><circle cx="360" cy="10" r="3"/><circle cx="450" cy="50" r="2"/><circle cx="640" cy="60" r="2.5"/><circle cx="730" cy="0" r="2"/></g>
    <!-- two hearts -->
    <g transform="translate(470,200)"><g class="a-rise"><path d="M0 8C-10-2-16 6-10 12L0 20 10 12C16 6 10-2 0 8z" fill="#ff8fb1"/></g><g class="a-rise" style="animation-delay:-3s"><path transform="translate(26,0)" d="M0 8C-10-2-16 6-10 12L0 20 10 12C16 6 10-2 0 8z" fill="#ffc2d4"/></g></g>
  </svg>`;
}
