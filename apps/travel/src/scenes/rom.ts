import { wheel } from '@/scenes/parts';

/** Rome: sunset, the Colosseum, cypresses, and a Vespa riding left with a
 * scarf flying behind the rider. */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="rSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e36f45"/><stop offset=".6" stop-color="#f3a765"/><stop offset="1" stop-color="#f8d49a"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#rSky)"/>
    <circle cx="160" cy="130" r="50" fill="#ffe4b0" opacity=".9"/>
    <!-- swallows -->
    <g fill="none" stroke="#7d3720" stroke-width="2" stroke-linecap="round" opacity=".7"><g class="a-bob"><path class="a-flap" d="M640 50q6-6 12 0q6-6 12 0"/></g><g class="a-bob" style="animation-delay:-1.7s"><path class="a-flap" style="animation-delay:-.25s" d="M676 70q5-5 10 0q5-5 10 0"/></g></g>
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
    <g fill="#a34c30"><rect x="40" y="212" width="40" height="3" rx="1.5"/><rect x="250" y="218" width="50" height="3" rx="1.5"/><rect x="520" y="211" width="44" height="3" rx="1.5"/></g>
    <!-- Vespa heading left -->
    <g class="a-drive-rev" style="animation-duration:10s"><g transform="translate(0,160)">
      <g class="a-ride">
        <path class="a-flutter" d="M50-12q12 0 18 4q-6 1-4 5q-8-4-14-3z" fill="#e8b04a"/>
        <path d="M40 35q0-21 22-21q13 0 15 21z" fill="#9bd4c8"/>
        <rect x="14" y="30" width="30" height="4" rx="1" fill="#9bd4c8"/>
        <path d="M12 32q-3-15 7-27l5 2q-6 11-4 25z" fill="#9bd4c8"/>
        <path d="M3 35q9-12 18 0" fill="none" stroke="#9bd4c8" stroke-width="4"/>
        <path d="M19 6l-3-11" stroke="#7a7f85" stroke-width="3" stroke-linecap="round"/>
        <path d="M11-6h10" stroke="#3a3a3a" stroke-width="3" stroke-linecap="round"/>
        <circle cx="14" cy="-1" r="3.5" fill="#fff6c2" stroke="#7a7f85" stroke-width="1.2"/>
        <rect x="42" y="10" width="24" height="5" rx="2.5" fill="#5a2a1a"/>
        <path d="M52 12l-14 4 0 14" fill="none" stroke="#2c3e63" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M58 13l-2-19q-1-5-7-4l-5 1q-4 2-3 6l4 16z" fill="#c0392b"/>
        <path d="M45-8l-26 1" stroke="#c0392b" stroke-width="4" stroke-linecap="round"/>
        <circle cx="47" cy="-17" r="7" fill="#e0a878"/>
        <path d="M39-18q0-9 9-9q8 0 8 8z" fill="#f4e6c8"/>
      </g>
      ${wheel(12, 36, 8, -1)}${wheel(62, 36, 8, -1)}
    </g></g>
  </svg>`;
}
