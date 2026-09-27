/** Generic scene (§5.2) for any city without a hand-drawn one. Sky gradient
 * from the city's accent, drifting clouds, a plane crossing nose-first, and
 * a ground band in accent.ink. */
export function scene(accent: { color: string; soft: string; ink: string }): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent.color}"/><stop offset="1" stop-color="${accent.soft}"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#gSky)"/>
    <g fill="#fff" opacity=".85">
      <g class="a-drive"><ellipse cx="120" cy="60" rx="34" ry="14"/><ellipse cx="150" cy="52" rx="24" ry="11"/></g>
      <g class="a-drive" style="animation-delay:-4s"><ellipse cx="420" cy="90" rx="40" ry="16"/><ellipse cx="455" cy="82" rx="26" ry="12"/></g>
      <g class="a-drive" style="animation-delay:-8s"><ellipse cx="660" cy="50" rx="30" ry="12"/><ellipse cx="686" cy="44" rx="20" ry="9"/></g>
    </g>
    <g class="a-drive" style="animation-delay:-2s">
      <g fill="#fff">
        <path d="M0 0h44l10 6H10z" transform="translate(200,120)"/>
      </g>
    </g>
    <rect y="196" width="800" height="34" fill="${accent.ink}"/>
  </svg>`;
}
