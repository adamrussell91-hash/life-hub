/** Sokcho: Seoraksan's granite peaks, the harbour lighthouse sweeping its
 * beam, and a squid boat strung with lamps crossing the bay. */
export function scene(): string {
  const bulbs = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => `<circle cx="${2 + i * 9.5}" cy="${-8 + Math.abs(i - 3) * 3}" r="2.6"/>`)
    .join('');
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="sokSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b6f8f"/><stop offset=".6" stop-color="#7fb6c8"/><stop offset="1" stop-color="#f6d2a8"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#sokSky)"/>
    <circle cx="660" cy="132" r="34" fill="#ffe2b0" opacity=".9"/>
    <!-- Seoraksan -->
    <path d="M0 176L58 122l28 18 42-74 20 26 26-38 26 42 36-22 40 52 46-22 50 42 46-16 40 26 54-24 40 22 52-16 72 14 64-8l60 4v86H0z" fill="#33586b"/>
    <path d="M128 66l20 26 26-38 26 42-14 8-12-18-14 22-16-14-14 14z" fill="#6f93a3"/>
    <path d="M148 92l-2 20M174 54l-4 30M196 96l4 18" stroke="#8fb0bd" stroke-width="2" opacity=".6"/>
    <path d="M0 192q100-30 200-12t220-8t220 4t160 8v20H0z" fill="#24485a"/>
    <!-- sea -->
    <rect y="196" width="800" height="34" fill="#1e6f8c"/>
    <g class="a-shimmer" stroke="#bfe3ee" stroke-width="2" stroke-linecap="round" opacity=".6"><path d="M40 210h40M250 220h50M640 208h40M720 222h50"/></g>
    <g class="a-shimmer" stroke="#ffe2b0" stroke-width="2.5" stroke-linecap="round" opacity=".7" style="animation-delay:-1.2s"><path d="M640 204h40M650 212h22M636 220h34"/></g>
    <!-- beam behind the lighthouse -->
    <path class="a-beam" d="M544 134L700 123v22z" fill="#fff6d0" opacity=".3"/>
    <path class="a-beam a-beam-l" style="animation-delay:-2s" d="M544 134L410 125v18z" fill="#fff6d0" opacity=".2"/>
    <!-- breakwater + lighthouse -->
    <path d="M490 200l8-10h96l8 10z" fill="#7d939b"/>
    <path d="M533 191l4-52h14l4 52z" fill="#fff"/>
    <g fill="#d0312d"><path d="M535 172h18l1 10h-20z"/><path d="M536.5 152h15l.6 9h-16.2z"/></g>
    <rect x="535" y="128" width="18" height="11" fill="#ffe8a0"/><path d="M537 128v11M544 128v11M551 128v11" stroke="#555" stroke-width="1"/>
    <path d="M532 128l12-10 12 10z" fill="#d0312d"/><rect x="532" y="138" width="24" height="3" fill="#555"/>
    <!-- gulls -->
    <g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><g class="a-bob"><path class="a-flap" d="M420 70q6-6 12 0q6-6 12 0"/></g><g class="a-bob" style="animation-delay:-1.6s"><path class="a-flap" style="animation-delay:-.2s" d="M290 40q5-5 10 0q5-5 10 0"/></g></g>
    <!-- squid boat with lamps -->
    <g class="a-drive" style="animation-duration:22s;animation-delay:-6s"><g transform="translate(0,184)"><g class="a-rock">
      <path d="M20 14V-16M20-16L2 8M20-16l44 14" stroke="#2b2b2b" stroke-width="1.4" fill="none"/>
      <g fill="#fff3b0" class="a-blink">${bulbs}</g>
      <path d="M-2 12h76l-8 13H8z" fill="#f4f1ea"/><rect x="-1" y="16" width="73" height="3" fill="#1e5aa0"/>
      <rect x="40" y="2" width="20" height="11" rx="1.5" fill="#e8e2d4"/><rect x="44" y="5" width="5" height="4" fill="#1e6f8c"/><rect x="52" y="5" width="5" height="4" fill="#1e6f8c"/>
    </g></g></g>
  </svg>`;
}
