/** Generic scene (§5.2) for any city without a hand-drawn one. Sky gradient
 * from the city's accent, slow drifting clouds, an airliner crossing nose-first
 * with a contrail, and rolling ground in accent.ink. */
export function scene(accent: { color: string; soft: string; ink: string }): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent.color}"/><stop offset="1" stop-color="${accent.soft}"/></linearGradient>
      <linearGradient id="gTrail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".75"/></linearGradient>
    </defs>
    <rect width="800" height="230" fill="url(#gSky)"/>
    <circle cx="640" cy="70" r="30" fill="#fff" opacity=".35"/>
    <g fill="#fff" opacity=".85">
      <g class="a-drive" style="animation-duration:46s"><ellipse cx="120" cy="60" rx="34" ry="14"/><ellipse cx="150" cy="52" rx="24" ry="11"/><ellipse cx="96" cy="64" rx="18" ry="9"/></g>
      <g class="a-drive" style="animation-duration:46s;animation-delay:-16s"><ellipse cx="420" cy="90" rx="40" ry="16"/><ellipse cx="455" cy="82" rx="26" ry="12"/></g>
      <g class="a-drive" style="animation-duration:46s;animation-delay:-31s"><ellipse cx="660" cy="44" rx="30" ry="12"/><ellipse cx="686" cy="38" rx="20" ry="9"/></g>
    </g>
    <!-- airliner -->
    <g class="a-drive" style="animation-duration:14s;animation-delay:-3s"><g transform="translate(160,112)"><g class="a-bob">
      <rect x="-150" y="9" width="152" height="2.5" rx="1.25" fill="url(#gTrail)"/><rect x="-120" y="14" width="122" height="2" rx="1" fill="url(#gTrail)"/>
      <path d="M4 6l-6-16h9l14 16z" fill="#e9eef3"/>
      <path d="M2 12q0-7 9-7h54q12 0 19 7q-7 7-19 7H11q-9 0-9-7z" fill="#fff"/>
      <path d="M72 7q7 1 11 4h-10q-2-2-1-4z" fill="${accent.ink}" opacity=".8"/>
      <g fill="${accent.ink}" opacity=".6"><circle cx="22" cy="10.5" r="1.4"/><circle cx="29" cy="10.5" r="1.4"/><circle cx="36" cy="10.5" r="1.4"/><circle cx="43" cy="10.5" r="1.4"/><circle cx="50" cy="10.5" r="1.4"/><circle cx="57" cy="10.5" r="1.4"/><circle cx="64" cy="10.5" r="1.4"/></g>
      <path d="M34 14l-12 15h9l20-15z" fill="#d7dee6"/>
      <rect x="30" y="17" width="12" height="5" rx="2.5" fill="#c3ccd6"/>
    </g></g></g>
    <path d="M0 196q120-22 260-6t280-4t260 6v38H0z" fill="${accent.ink}" opacity=".55"/>
    <rect y="204" width="800" height="26" fill="${accent.ink}"/>
  </svg>`;
}
