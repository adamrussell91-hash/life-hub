/** Scene SVG from travel-planner.html mockup. Note: CHOCO/CHOO CHOO font may later change to Archivo. */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="lSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3e63"/><stop offset="1" stop-color="#7f93b5"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#lSky)"/>
    <!-- London Eye -->
    <g transform="translate(600,120)"><g class="a-spin"><circle r="72" fill="none" stroke="#c9d3e0" stroke-width="3"/><g stroke="#c9d3e0" stroke-width="1.4"><path d="M-72 0h144M0-72v144M-51-51l102 102M51-51l-102 102"/></g><g fill="#e8eef6"><circle cx="72" cy="0" r="5"/><circle cx="-72" cy="0" r="5"/><circle cx="0" cy="72" r="5"/><circle cx="0" cy="-72" r="5"/><circle cx="51" cy="51" r="5"/><circle cx="-51" cy="-51" r="5"/><circle cx="51" cy="-51" r="5"/><circle cx="-51" cy="51" r="5"/></g></g><path d="M-10 110l10-110 10 110" stroke="#c9d3e0" stroke-width="3" fill="none"/></g>
    <!-- Elizabeth Tower -->
    <g fill="#1b2740"><rect x="300" y="70" width="40" height="150"/><path d="M296 70l24-50 24 50z"/><rect x="318" y="2" width="4" height="20"/></g>
    <circle cx="320" cy="92" r="13" fill="#f6e7a8"/><path d="M320 92v-8M320 92l6 3" stroke="#1b2740" stroke-width="2"/>
    <path d="M0 200h800v30H0z" fill="#1b2740"/>
    <path d="M0 200V170h120v-18h60v48h60v-30h40v30zM380 200v-40h120v40z" fill="#26334f"/>
    <!-- lights -->
    <path d="M0 40q100 30 200 0t200 0t200 0t200 0" fill="none" stroke="#e8eef6" stroke-width="1.2" opacity=".6"/>
    <g class="a-blink" fill="#ffd36e"><circle cx="50" cy="52" r="3"/><circle cx="150" cy="52" r="3"/><circle cx="250" cy="52" r="3"/><circle cx="350" cy="52" r="3"/><circle cx="450" cy="52" r="3"/><circle cx="550" cy="52" r="3"/><circle cx="650" cy="52" r="3"/><circle cx="750" cy="52" r="3"/></g>
    <!-- bus -->
    <g class="a-drive" style="animation-duration:12s"><g transform="translate(0,150)"><rect x="0" y="0" width="120" height="52" rx="6" fill="#d7263d"/><rect x="0" y="24" width="120" height="3" fill="#a81c2f"/><g fill="#f6e7a8"><rect x="8" y="6" width="18" height="13" rx="2"/><rect x="32" y="6" width="18" height="13" rx="2"/><rect x="56" y="6" width="18" height="13" rx="2"/><rect x="80" y="6" width="18" height="13" rx="2"/><rect x="8" y="31" width="18" height="12" rx="2"/><rect x="32" y="31" width="18" height="12" rx="2"/><rect x="56" y="31" width="18" height="12" rx="2"/></g><rect x="100" y="30" width="16" height="20" fill="#1b2740"/><circle cx="24" cy="54" r="8" fill="#111"/><circle cx="96" cy="54" r="8" fill="#111"/></g></g>
    <g class="a-fall" stroke="#c9d3e0" stroke-width="1.5" opacity=".5"><path d="M80 0v10M200 30v10M320 10v10M440 40v10M560 5v10M680 25v10M140 60v10M500 70v10M740 80v10"/></g>
  </svg>`;
}
