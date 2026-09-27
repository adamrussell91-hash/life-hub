/**
 * Render Fix 01 Part A screenshots from real directory rows (playwright).
 */
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { chromium } from 'playwright';

const window = new Window({ url: 'https://life-hub.local/' });
globalThis.window = window;
globalThis.document = window.document;
globalThis.SVGElement = window.SVGElement;
globalThis.SVGGElement = window.SVGGElement;
globalThis.SVGSVGElement = window.SVGSVGElement;
globalThis.SVGPathElement = window.SVGPathElement;
globalThis.SVGRectElement = window.SVGRectElement;
globalThis.SVGCircleElement = window.SVGCircleElement;
globalThis.SVGTextElement = window.SVGTextElement;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;

const {
  renderOrganisationSparkSvg,
  ORG_SPARK_DOMAIN_START
} = await import('../apps/professional/src/domain/organisation-spark.ts');
const { renderOrganisationTimelineSvg } = await import(
  '../apps/professional/src/domain/organisation-timeline.ts'
);
const { buildOrganisationModel } = await import(
  '../apps/professional/src/domain/organisation-model.ts'
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = '/opt/cursor/artifacts/organisations-fix-01';
const OUT = join(
  __dirname,
  '../docs/professional-hub/organisations-redesign/screens/fix-01'
);
const STORE = '/cursor/stores/bc-edd8c221-029a-4512-8521-dde3d995d77e/media/organisations-fix-01';

const rows = JSON.parse(readFileSync(join(ARTIFACTS, 'part-a-directory-rows.json'), 'utf8'));
const now = rows.now;

function rowToModel(row) {
  return buildOrganisationModel({
    id: row.id,
    ref: row.ref,
    displayName: row.display_name,
    legalName: row.legal_name,
    logoKey: row.logo_key,
    chips: row.chips,
    people: row.people.map((p) => ({
      id: p.id,
      warmthBand: p.warmth_band,
      firstLinkAt: p.first_link_at
    })),
    undatedPeopleCount: row.undated_people_count,
    arcPoints: row.arc_points,
    timelineLanes: row.timeline_lanes,
    firstTouchAt: row.first_touch_at,
    firstTouchKind: row.first_touch_kind,
    lastActivityAt: row.last_activity_at,
    now
  });
}

function tileHtml(model, row) {
  const spark = renderOrganisationSparkSvg({
    points: model.arcPoints,
    now,
    workMarks: model.timelineLanes
      .filter((l) => l.kind === 'work_study' || l.kind === 'roles')
      .map((l) => ({ start: l.start, end: l.end })),
    eventMarks: model.timelineLanes
      .filter((l) => l.kind === 'events')
      .map((l) => ({ at: l.start }))
  });
  const undated = model.undatedPeopleCount;
  const aria = [
    `${model.arcPoints.length} people with a known start on the 2019–now chart`,
    undated > 0 ? `${undated} people with no known start` : null
  ]
    .filter(Boolean)
    .join('. ');

  const chips = model.chips
    .map((c) => {
      const full = c.detail ? `${c.label} · ${c.detail}` : c.label;
      return `<span class="orgs-rchip" title="${full}"><b>${c.label}</b>${
        c.detail ? `<span class="orgs-rchip__yr">${c.detail}</span>` : ''
      }</span>`;
    })
    .join('');

  const total = Math.max(1, model.warmthSpread.total);
  const spread = ['warm', 'cooling', 'cold']
    .map((k, i) => {
      const n = model.warmthSpread[k === 'warm' ? 'warm' : k === 'cooling' ? 'cooling' : 'cold'];
      if (n <= 0) return '';
      const cls = i === 0 ? 'orgs-spread__w' : i === 1 ? 'orgs-spread__c' : 'orgs-spread__k';
      return `<i class="${cls}" style="flex:${n / total}"></i>`;
    })
    .join('');

  return `<a class="orgs-tile${model.isCurrentWorkplace ? ' orgs-tile--home' : ''}">
    <div class="orgs-tile__head">
      <span class="crest">${model.monogram}</span>
      <div class="orgs-tile__stack">
        <h3 class="orgs-tile__name">${model.displayName}</h3>
        <div class="orgs-rchips">${chips}</div>
      </div>
    </div>
    <div class="orgs-tile__count"><b>${model.peopleCount} people</b>
      <span class="orgs-spread" aria-label="${model.warmthSpread.warm} warm, ${model.warmthSpread.cooling} cooling, ${model.warmthSpread.cold} cold">${spread}</span>
    </div>
    <div class="orgs-tile__spark" aria-label="${aria}">${spark.outerHTML}</div>
  </a>`;
}

const alo = rowToModel(rows.aloysius);
const tri = rowToModel(rows.trinity);
const halt = rows.halt ? rowToModel(rows.halt) : null;

const domainStart = ORG_SPARK_DOMAIN_START;
const timeline = renderOrganisationTimelineSvg({
  lanes: alo.timelineLanes,
  peopleSteps: alo.peopleSteps,
  domainStart,
  domainEnd: now,
  width: 900
});

const css = `
:root {
  --paper: #f7f5f1; --ink: #1a1f2c; --depth: #0a1536; --wave: #376fb7;
  --muted: #6b7788; --line: #d9dde5; --glass: #eef1f6; --on-dark: #fff;
  --radius-md: 12px; --radius-sm: 8px; --elev-1: 0 1px 2px rgba(10,21,54,.06);
  --space-2: 8px; --space-3: 12px; --text-sm: 13px; --text-base: 15px; --text-2xs: 11px;
}
body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #e8ebe7; color: var(--ink); }
.wrap { padding: 24px; }
.wall { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; max-width: 720px; }
.orgs-tile { display:flex; flex-direction:column; gap:8px; min-width:0; padding:12px; border-radius:12px; background:var(--paper); border:1px solid var(--line); box-shadow:var(--elev-1); text-decoration:none; color:inherit; }
.orgs-tile--home { grid-column: span 2; }
.orgs-tile__head { display:flex; gap:12px; min-width:0; }
.crest { width:48px; height:48px; border-radius:10px; background:var(--depth); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex:0 0 auto; }
.orgs-tile__name { margin:0 0 6px; font-size:15px; font-weight:650; color:var(--depth); }
.orgs-rchips { display:flex; flex-wrap:wrap; gap:4px; min-width:0; }
.orgs-rchip { display:inline-flex; align-items:baseline; gap:4px; max-width:100%; min-width:0; padding:2px 8px; border-radius:999px; background:var(--glass); border:1px solid var(--line); font-size:11px; white-space:nowrap; overflow:hidden; text-align:left; }
.orgs-rchip b { font-weight:650; flex:0 0 auto; }
.orgs-rchip__yr { color:var(--muted); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.orgs-tile__count { display:flex; align-items:center; gap:8px; font-size:13px; }
.orgs-spread { display:inline-flex; width:4.5rem; height:6px; border-radius:999px; overflow:hidden; background:var(--line); }
.orgs-spread__w { background:var(--wave); } .orgs-spread__c { background:color-mix(in srgb, var(--wave) 45%, var(--muted)); } .orgs-spread__k { background:var(--muted); }
.orgs-tile__spark svg { display:block; width:100%; height:36px; }
.hdr { margin: 28px 0 12px; }
.meta { color: var(--muted); font-size: 13px; }
.detail { max-width: 960px; background: var(--paper); border:1px solid var(--line); border-radius:12px; padding:16px; }
.chip-demo { max-width: 280px; margin-top: 24px; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="wrap" id="wall1440">
  <h1>Organisations — Fix 01 Part A (real data)</h1>
  <div class="wall">
    ${tileHtml(alo, rows.aloysius)}
    ${tileHtml(tri, rows.trinity)}
    ${halt ? tileHtml(halt, rows.halt) : ''}
  </div>
  <div class="hdr">
    <h2>${alo.displayName}</h2>
    <p class="meta">${alo.metaLine}</p>
    <div class="orgs-rchips">${alo.chips
      .map((c) => {
        const full = c.detail ? `${c.label} · ${c.detail}` : c.label;
        return `<span class="orgs-rchip" title="${full}"><b>${c.label}</b><span class="orgs-rchip__yr">${c.detail}</span></span>`;
      })
      .join('')}</div>
  </div>
  <div class="detail" id="detail1440">
    <h3>Your time with ${alo.displayName}</h3>
    ${timeline.outerHTML}
  </div>
  ${
    halt
      ? `<div class="chip-demo" id="haltChip"><h3>HALT chip (A6)</h3>${tileHtml(halt, rows.halt)}</div>`
      : ''
  }
</div>
</body></html>`;

mkdirSync(OUT, { recursive: true });
mkdirSync(ARTIFACTS, { recursive: true });
mkdirSync(STORE, { recursive: true });
const htmlPath = join(ARTIFACTS, 'part-a-preview.html');
writeFileSync(htmlPath, html);

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  headless: true
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });

async function shot(sel, name, width, height) {
  await page.setViewportSize({ width, height });
  const el = page.locator(sel);
  const path = join(OUT, name);
  await el.screenshot({ path });
  copyFileSync(path, join(ARTIFACTS, name));
  copyFileSync(path, join(STORE, name));
  console.log('wrote', name);
}

await shot('#wall1440', 'wall-aloysius-trinity-1440.png', 1440, 900);
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('.wall').screenshot({ path: join(OUT, 'wall-aloysius-trinity-390.png') });
copyFileSync(join(OUT, 'wall-aloysius-trinity-390.png'), join(ARTIFACTS, 'wall-aloysius-trinity-390.png'));
copyFileSync(join(OUT, 'wall-aloysius-trinity-390.png'), join(STORE, 'wall-aloysius-trinity-390.png'));
await shot('#detail1440', 'aloysius-timeline-1440.png', 1440, 900);
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('#detail1440').screenshot({ path: join(OUT, 'aloysius-timeline-390.png') });
copyFileSync(join(OUT, 'aloysius-timeline-390.png'), join(ARTIFACTS, 'aloysius-timeline-390.png'));
copyFileSync(join(OUT, 'aloysius-timeline-390.png'), join(STORE, 'aloysius-timeline-390.png'));
if (halt) {
  await shot('#haltChip', 'halt-chip-1440.png', 1440, 500);
  await page.setViewportSize({ width: 390, height: 500 });
  await page.locator('#haltChip').screenshot({ path: join(OUT, 'halt-chip-390.png') });
  copyFileSync(join(OUT, 'halt-chip-390.png'), join(ARTIFACTS, 'halt-chip-390.png'));
  copyFileSync(join(OUT, 'halt-chip-390.png'), join(STORE, 'halt-chip-390.png'));
}

await browser.close();
console.log('done');
