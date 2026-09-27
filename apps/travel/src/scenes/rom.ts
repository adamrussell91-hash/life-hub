/** Scene SVG from travel-planner.html mockup. Note: CHOCO/CHOO CHOO font may later change to Archivo. */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="rSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e36f45"/><stop offset=".6" stop-color="#f3a765"/><stop offset="1" stop-color="#f8d49a"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#rSky)"/>
    <circle cx="160" cy="130" r="50" fill="#ffe4b0" opacity=".9"/>
    <!-- Colosseum -->
    <g fill="#b85c3a"><path d="M300 200V90q150-40 300 0v110z"/></g>
    <g fill="#e89b6b">
      <g id="row"><rect x="315" y="104" width="16" height="22" rx="8"/><rect x="340" y="100" width="16" height="22" rx="8"/><rect x="365" y="97" width="16" height="22" rx="8"/><rect x="390" y="95" width="16" height="22" rx="8"/><rect x="415" y="94" width="16" height="22" rx="8"/><rect x="440" y="94" width="16" height="22" rx="8"/><rect x="465" y="94" width="16" height="22" rx="8"/><rect x="490" y="95" width="16" height="22" rx="8"/><rect x="515" y="97" width="16" height="22" rx="8"/><rect x="540" y="100" width="16" height="22" rx="8"/><rect x="565" y="104" width="16" height="22" rx="8"/></g>
      <use href="#row" y="34"/><use href="#row" y="68"/>
    </g>
    <path d="M600 90q-10 10-14 40v70h14z" fill="#8f4128"/>
    <!-- cypresses -->
    <g fill="#35512f"><g class="a-sway"><path d="M230 200c-12-40-10-90 8-120 18 30 20 80 8 120z"/></g><g class="a-sway" style="animation-delay:-2s"><path d="M650 200c-10-34-8-76 7-100 15 24 17 66 7 100z"/></g><g class="a-sway" style="animation-delay:-1s"><path d="M690 200c-9-30-7-66 6-88 13 22 15 58 6 88z"/></g></g>
    <path d="M0 200h800v30H0z" fill="#8f4128"/>
    <!-- Vespa -->
    <g class="a-drive-rev" style="animation-duration:10s"><g transform="translate(0,168)"><circle cx="10" cy="30" r="9" fill="#222"/><circle cx="62" cy="30" r="9" fill="#222"/><path d="M0 26q6-20 26-18h20q14 0 22 18z" fill="#9bd4c8"/><path d="M4 10l-4-12h8" stroke="#555" stroke-width="3" fill="none"/><circle cx="40" cy="-6" r="8" fill="#e8b04a"/><path d="M34 2h14v10H34z" fill="#c0392b"/></g></g>
  </svg>`;
}
