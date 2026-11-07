/** Busan at night: Gamcheon's painted houses up the hill, Gwangan Bridge with
 * its lights shifting colour, traffic crossing, and fireworks over the bay. */
export function scene(): string {
  const houseCols = ['#f2a7a7', '#9fd3c7', '#f6d186', '#a7c5eb', '#e3b5e5', '#ffffff', '#f4b183'];
  const houses: string[] = [];
  let i = 0;
  for (const [y, xs] of [
    [168, [8, 30, 52, 74, 96, 118, 140, 162, 184, 206, 228]],
    [150, [14, 36, 58, 80, 102, 124, 146, 168, 190]],
    [132, [22, 44, 66, 88, 110, 132, 154]],
    [116, [38, 60, 82, 104]]
  ] as [number, number[]][]) {
    for (const x of xs) {
      const c = houseCols[i++ % houseCols.length];
      const w = 13 + (i % 3) * 2;
      const hy = y + ((i * 5) % 4);
      const roof = i % 2 ? '#3f6fb0' : '#c0504a';
      houses.push(`<rect x="${x}" y="${hy}" width="${w}" height="14" fill="${c}"/><rect x="${x - 1}" y="${hy - 2}" width="${w + 2}" height="3" fill="${roof}"/><rect x="${x + 3}" y="${hy + 4}" width="4" height="4" fill="${i % 3 ? '#ffe9a8' : '#2c2f55'}"/>`);
    }
  }
  const hangers = [260, 290, 320, 350, 380, 460, 490, 520, 550, 580, 640, 670, 700, 730, 760]
    .map((x) => `<path d="M${x} 168V${x < 420 ? 160 - (x - 230) * 0.25 : x < 600 ? 116 + Math.abs(x - 510) * 0.5 : 120 + (x - 600) * 0.2}"/>`)
    .join('');
  const deckLights = Array.from({ length: 29 }, (_, k) => `<circle cx="${236 + k * 20}" cy="170" r="1.6"/>`).join('');
  return `<svg class="art" viewBox="0 0 800 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="buSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1a3a"/><stop offset=".65" stop-color="#27386b"/><stop offset="1" stop-color="#5b4b8a"/></linearGradient></defs>
    <rect width="800" height="230" fill="url(#buSky)"/>
    <g fill="#fff" class="a-blink"><circle cx="300" cy="24" r="1.3"/><circle cx="380" cy="50" r="1.1"/><circle cx="470" cy="20" r="1.4"/><circle cx="560" cy="44" r="1.1"/></g>
    <!-- fireworks -->
    <g transform="translate(690,58)"><g class="a-burst"><g stroke="#ffd36e" stroke-width="2" stroke-linecap="round"><path d="M0-8v-14M0 8v14M-8 0h-14M8 0h14M6-6l10-10M-6 6l-10 10M6 6l10 10M-6-6l-10-10"/></g></g></g>
    <g transform="translate(610,36)"><g class="a-burst" style="animation-delay:-1.4s"><g stroke="#ff8fd1" stroke-width="1.8" stroke-linecap="round"><path d="M0-6v-10M0 6v10M-6 0h-10M6 0h10M4-4l8-8M-4 4l-8 8M4 4l8 8M-4-4l-8-8"/></g></g></g>
    <!-- Haeundae towers far right -->
    <g fill="#1d2550"><rect x="700" y="96" width="16" height="80"/><path d="M700 96l8-14 8 14z"/><rect x="722" y="108" width="14" height="68"/><rect x="742" y="88" width="18" height="88"/><path d="M742 88l9-12 9 12z"/><rect x="766" y="118" width="20" height="58"/></g>
    <g fill="#ffe9a8" opacity=".6"><rect x="704" y="110" width="2" height="2"/><rect x="710" y="126" width="2" height="2"/><rect x="746" y="104" width="2" height="2"/><rect x="752" y="140" width="2" height="2"/><rect x="726" y="130" width="2" height="2"/><rect x="772" y="134" width="2" height="2"/></g>
    <!-- sea -->
    <rect y="176" width="800" height="54" fill="#142447"/>
    <!-- Gamcheon hill -->
    <path d="M0 200V108q60-22 130-2t120 62q20 18 40 32z" fill="#2c2f55"/>
    ${houses.join('')}
    <!-- Gwangan Bridge -->
    <path d="M230 168h570v5H230z" fill="#1b2240"/>
    <g fill="#1b2240"><rect x="416" y="96" width="8" height="96"/><rect x="596" y="96" width="8" height="96"/><rect x="412" y="120" width="16" height="3"/><rect x="592" y="120" width="16" height="3"/></g>
    <g class="a-glow" fill="none" stroke-width="2"><path d="M230 160Q330 168 420 100Q510 170 600 100Q700 168 800 130"/></g>
    <g class="a-glow" stroke-width=".9" fill="none" opacity=".7" style="animation-delay:-2s">${hangers}</g>
    <g fill="#fff3c4" opacity=".8">${deckLights}</g>
    <g class="a-glow-fill" opacity=".35"><rect x="230" y="190" width="570" height="3"/><rect x="300" y="200" width="420" height="2"/><rect x="380" y="210" width="260" height="2"/></g>
    <!-- traffic -->
    <g class="a-drive" style="animation-duration:6s"><rect x="0" y="164.5" width="5" height="2" rx="1" fill="#fff6c2"/></g>
    <g class="a-drive" style="animation-duration:6s;animation-delay:-2.5s"><rect x="0" y="164.5" width="5" height="2" rx="1" fill="#fff6c2"/></g>
    <g class="a-drive-rev" style="animation-duration:7s"><rect x="0" y="166" width="5" height="2" rx="1" fill="#ff5a5a"/></g>
    <g class="a-drive-rev" style="animation-duration:7s;animation-delay:-3.8s"><rect x="0" y="166" width="5" height="2" rx="1" fill="#ff5a5a"/></g>
    <!-- harbour boat -->
    <g class="a-drive-rev" style="animation-duration:26s;animation-delay:-9s"><g transform="translate(0,196)"><g class="a-rock"><path d="M0 8h50l-6 9H6z" fill="#e8eef6"/><rect x="12" y="0" width="26" height="8" rx="1.5" fill="#cfd8e6"/><g fill="#ffe9a8"><rect x="16" y="3" width="4" height="3"/><rect x="23" y="3" width="4" height="3"/><rect x="30" y="3" width="4" height="3"/></g></g></g></g>
  </svg>`;
}
