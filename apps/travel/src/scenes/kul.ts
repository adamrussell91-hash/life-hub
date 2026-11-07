import { wheel } from '@/scenes/parts';

/** Petronas tower outline: three setbacks, a cone and a spire. */
function tower(x: number): string {
  return `<path d="M${x} 230V100h3v-14h4v-14h4v-12l5-10 5 10v12h4v14h4v14h3V230z"/><rect x="${x + 15}" y="18" width="2" height="33"/>`;
}

/** Kuala Lumpur: sunset, KL Tower, Petronas Towers, palms, a Grab rider with
 * a food box riding past, and a no-durians street sign. */
export function scene(): string {
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="kSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f06a3c"/><stop offset=".6" stop-color="#f6a55a"/><stop offset="1" stop-color="#fbd38d"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#kSky)"/>
    <circle cx="610" cy="120" r="62" fill="#ffe7a8" opacity=".95"/>
    <g class="a-shimmer" stroke="#fff3cf" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"><path d="M470 150q10-8 20 0t20 0t20 0"/><path d="M520 170q10-8 20 0t20 0t20 0"/></g>
    <!-- birds -->
    <g fill="none" stroke="#7a3412" stroke-width="2" stroke-linecap="round" opacity=".7"><g class="a-bob"><path class="a-flap" d="M520 64q6-6 12 0q6-6 12 0"/></g><g class="a-bob" style="animation-delay:-1.4s"><path class="a-flap" style="animation-delay:-.3s" d="M552 80q5-5 10 0q5-5 10 0"/></g></g>
    <!-- KL Tower -->
    <g fill="#8a3a12"><path d="M300 230l2-130h5l2 130z"/><path d="M286 98q17-16 35 0q-17 10-35 0z"/><rect x="290" y="92" width="27" height="5" rx="2" fill="#a8501f"/><rect x="302.5" y="46" width="2" height="44"/></g>
    <circle cx="303.5" cy="46" r="2.2" fill="#ff3b30" class="a-blink"/>
    <!-- Petronas Twin Towers -->
    <g fill="#5a2710">${tower(380)}${tower(440)}
      <rect x="410" y="126" width="32" height="6" rx="1"/><path d="M414 132l11 18M438 132l-11 18" stroke="#5a2710" stroke-width="3" fill="none"/>
    </g>
    <g fill="#ffd59a" opacity=".5"><rect x="387" y="104" width="2.5" height="122"/><rect x="394.75" y="64" width="2.5" height="162"/><rect x="402.5" y="104" width="2.5" height="122"/><rect x="447" y="104" width="2.5" height="122"/><rect x="454.75" y="64" width="2.5" height="162"/><rect x="462.5" y="104" width="2.5" height="122"/></g>
    <circle cx="396" cy="18" r="2" fill="#ff3b30" class="a-blink"/><circle cx="456" cy="18" r="2" fill="#ff3b30" class="a-blink" style="animation-delay:-1s"/>
    <!-- city block -->
    <path d="M0 230V180h60v-20h40v30h50v-40h35v50h45v-25h40v55zM520 230v-50h40v-25h50v35h40v-20h50v25h100v35z" fill="#b8522a"/>
    <g fill="#ffd59a" opacity=".45"><rect x="70" y="170" width="6" height="6"/><rect x="84" y="170" width="6" height="6"/><rect x="160" y="160" width="6" height="6"/><rect x="160" y="174" width="6" height="6"/><rect x="560" y="166" width="6" height="6"/><rect x="574" y="166" width="6" height="6"/><rect x="590" y="166" width="6" height="6"/></g>
    <!-- palms -->
    <g class="a-sway" fill="#2f5d46"><path d="M150 230q-2-40 2-80h4q-2 40 0 80z" fill="#6b3a1c"/><path d="M154 150c-30-8-40 4-44 12 14-8 28-8 44-12zM154 150c30-8 40 4 44 12-14-8-28-8-44-12zM154 150c-12-20-30-22-40-18 16 2 28 8 40 18zM154 150c12-20 30-22 40-18-16 2-28 8-40 18z"/></g>
    <g class="a-sway" fill="#2f5d46" style="animation-delay:-1.3s"><path d="M690 230q-2-36 2-70h4q-2 36 0 70z" fill="#6b3a1c"/><path d="M694 160c-30-8-40 4-44 12 14-8 28-8 44-12zM694 160c30-8 40 4 44 12-14-8-28-8-44-12zM694 160c-12-20-30-22-40-18 16 2 28 8 40 18zM694 160c12-20 30-22 40-18-16 2-28 8-40 18z"/></g>
    <!-- Grab rider with food box, heading right -->
    <g class="a-drive" style="animation-duration:9s"><g transform="translate(0,184)">
      <g class="a-ride">
        <rect x="-4" y="-4" width="20" height="20" rx="3" fill="#00b14f"/><rect x="-4" y="3" width="20" height="3" fill="#fff" opacity=".85"/>
        <path d="M2 31q0-13 15-13h15l4 13z" fill="#00b14f"/>
        <rect x="8" y="14" width="22" height="5" rx="2.5" fill="#222"/>
        <rect x="18" y="30" width="28" height="4" rx="1" fill="#3a3a3a"/>
        <path d="M46 33l4-23" stroke="#00b14f" stroke-width="4" stroke-linecap="round"/>
        <path d="M44 36q10-12 20 0" fill="none" stroke="#00b14f" stroke-width="3.5"/>
        <path d="M48 9h7" stroke="#222" stroke-width="3" stroke-linecap="round"/>
        <circle cx="55" cy="14" r="2.5" fill="#fff6c2"/>
        <path d="M24 15l13 4-2 11" fill="none" stroke="#2d3436" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M18 17l2-18q1-5 7-4l6 2q4 2 3 7l-4 13z" fill="#0a8f43"/>
        <path d="M31 2l17 7" stroke="#0a8f43" stroke-width="4" stroke-linecap="round"/>
        <circle cx="30" cy="-10" r="7.5" fill="#00b14f"/><path d="M31-12h7q1 4-2 6h-5z" fill="#1d2b2a"/>
      </g>
      ${wheel(10, 36, 8)}${wheel(54, 36, 8)}
    </g></g>
    <!-- no-durians street sign -->
    <g transform="translate(760,118)">
      <rect x="-2" y="14" width="4" height="98" fill="#4a3a33"/>
      <circle r="21" fill="#fff"/>
      <ellipse rx="9" ry="11.5" fill="#8fb02f"/>
      <g stroke="#5f7d1c" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M-5-5l2-2 2 2 2-2 2 2M-6 1l2-2 2 2 2-2 2 2 2-2M-5 7l2-2 2 2 2-2 2 2"/></g>
      <path d="M0-11v-5" stroke="#6b3a1c" stroke-width="2" stroke-linecap="round"/>
      <circle r="18.5" fill="none" stroke="#d0312d" stroke-width="4"/><path d="M-13-13l26 26" stroke="#d0312d" stroke-width="4"/>
    </g>
  </svg>`;
}
