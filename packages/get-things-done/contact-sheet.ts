// packages/get-things-done/contact-sheet.ts
// The contact sheet: Gear Shifter's charts under .gt-scope, empty, partial and full at desktop
// width and full at 390px. First the new and changed charts (the zero-min dated scales, ratings,
// and the Kanban and 5 Whys variants), then the shared Decision Book families Gear Shifter uses
// (path, list, quadrant, curve) re-skinned. Built by scripts/build-gear-shifter-contact-sheet.mjs
// into docs/mockups/gear-shifter/; for one look by Adam, not shipped in the app.
import '../design-kit/tokens.css';
import '../problem-solver/problem-solver.css';
import '../decision-book/decision-book.css';
import './get-things-done.css';
import { GT_SAMPLE_TOOLS, gtRunFor } from './fixtures.mjs';
import { SAMPLE_TOOLS, runFor } from '../decision-book/fixtures.mjs';
import { createGearChartForTool } from './render/charts';

type View = { el: HTMLElement; update(run: never): void };
type Stage = 'empty' | 'partial' | 'full';
type Row = { title: string; make: () => View; run: (stage: Stage) => unknown };

function cell(title: string, width: string, view: View): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'sheet__cell';
  figure.style.width = width;
  const caption = document.createElement('figcaption');
  caption.textContent = title;
  figure.append(caption, view.el);
  return figure;
}

const gear = (key: keyof typeof GT_SAMPLE_TOOLS): Row => ({
  title: `${GT_SAMPLE_TOOLS[key].name} (${(GT_SAMPLE_TOOLS[key] as { family?: string; variantOf?: string }).family ?? `${(GT_SAMPLE_TOOLS[key] as { variantOf?: string }).variantOf} variant`})`,
  make: () => createGearChartForTool(GT_SAMPLE_TOOLS[key] as never) as unknown as View,
  run: (stage) => gtRunFor(key, stage)
});
const shared = (key: keyof typeof SAMPLE_TOOLS): Row => ({
  title: `${SAMPLE_TOOLS[key].name} (${(SAMPLE_TOOLS[key] as { family: string }).family}, re-skinned)`,
  make: () => createGearChartForTool(SAMPLE_TOOLS[key] as never) as unknown as View,
  run: (stage) => runFor(key, stage)
});

const ROWS: Row[] = [gear('needs'), gear('ratings'), gear('kanban'), gear('fiveWhys'), shared('stages'), shared('flow'), shared('list'), shared('pyramid'), shared('quadrant'), shared('curve')];

const sheet = document.getElementById('sheet')!;
for (const row of ROWS) {
  const section = document.createElement('section');
  section.className = 'sheet__row';
  const heading = document.createElement('h2');
  heading.textContent = row.title;
  const cells = document.createElement('div');
  cells.className = 'sheet__cells';
  for (const stage of ['empty', 'partial', 'full'] as const) {
    const view = row.make();
    view.update(row.run(stage) as never);
    cells.append(cell(stage, '560px', view));
  }
  const phone = row.make();
  phone.update(row.run('full') as never);
  cells.append(cell('full at 390px', '358px', phone));
  section.append(heading, cells);
  sheet.append(section);
}
