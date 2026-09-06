import type { SequenceCompareReport } from './compare-unit-orderings';

export type SequenceCompareProposedUnit = {
  unit_id: string;
  title: string;
};

export type SequenceComparePanelInput = {
  currentTitles: string[];
  proposed: SequenceCompareProposedUnit[];
  report: SequenceCompareReport;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function titleFor(proposed: SequenceCompareProposedUnit[], unitId: string): string {
  return proposed.find((unit) => unit.unit_id === unitId)?.title ?? unitId;
}

function weekLabel(week: number | null): string {
  return week == null ? '—' : `week ${week}`;
}

export function renderSequenceComparePanel(input: SequenceComparePanelInput): string {
  const { currentTitles, proposed, report } = input;
  const liveItems = currentTitles
    .map((title) => `<li>${escapeHtml(title)}</li>`)
    .join('');
  const proposedItems = proposed
    .map((unit, index) => {
      const upDisabled = index === 0 ? ' disabled' : '';
      const downDisabled = index === proposed.length - 1 ? ' disabled' : '';
      return `<li class="scope-sequence-compare__draft-item">
        <span>${escapeHtml(unit.title)}</span>
        <span class="scope-sequence-compare__moves">
          <button type="button" class="btn btn--ghost" data-move-unit="${escapeHtml(unit.unit_id)}" data-move-dir="up"${upDisabled}>Up</button>
          <button type="button" class="btn btn--ghost" data-move-unit="${escapeHtml(unit.unit_id)}" data-move-dir="down"${downDisabled}>Down</button>
        </span>
      </li>`;
    })
    .join('');

  const proposedCollisions =
    report.collisions.proposed.length === 0
      ? '<li>None</li>'
      : report.collisions.proposed
          .map((row) => {
            const left = escapeHtml(titleFor(proposed, row.unit_id));
            const right = escapeHtml(titleFor(proposed, row.other_unit_id));
            return `<li>${left} overlaps ${right} in weeks ${row.start_week}–${row.end_week}</li>`;
          })
          .join('');

  const timingRows =
    report.outcomeTiming.length === 0
      ? '<li>No attached outcomes</li>'
      : report.outcomeTiming
          .map((row) => {
            const changed = row.currentWeek !== row.proposedWeek;
            return `<li>${escapeHtml(row.code)}: ${weekLabel(row.currentWeek)}${
              changed ? ` → ${weekLabel(row.proposedWeek)}` : ''
            }</li>`;
          })
          .join('');

  const status = report.sameOrder
    ? '<p class="scope-sequence-compare__status">Same as the live sequence</p>'
    : '';

  const confirm = report.sameOrder
    ? ''
    : `<button type="button" class="btn btn--primary" data-confirm-sequence>Confirm</button>`;

  return `<section class="glass-panel scope-sequence-compare" data-sequence-compare-panel>
    <header class="scope-sequence-compare__header">
      <p class="page-header__eyebrow">Scope</p>
      <h2 class="scope-sequence-compare__title">Compare order</h2>
      <p class="page-header__supporting">Draft a different unit order. Confirm writes it to the live timeline.</p>
    </header>
    <div class="scope-sequence-compare__cols">
      <div>
        <h3 class="scope-sequence-compare__col-title">Live</h3>
        <ol class="scope-sequence-compare__list">${liveItems}</ol>
      </div>
      <div>
        <h3 class="scope-sequence-compare__col-title">Proposed</h3>
        <ol class="scope-sequence-compare__list">${proposedItems}</ol>
      </div>
    </div>
    <dl class="scope-sequence-compare__stats">
      <div>
        <dt>Peak concurrent units</dt>
        <dd>${report.peakLoad.current} → ${report.peakLoad.proposed}</dd>
      </div>
      <div>
        <dt>Proposed overlaps</dt>
        <dd><ul>${proposedCollisions}</ul></dd>
      </div>
      <div>
        <dt>Outcome first coverage</dt>
        <dd><ul>${timingRows}</ul></dd>
      </div>
    </dl>
    ${status}
    <div class="confirm-card scope-sequence-compare__confirm">
      <div class="confirm-card__actions">
        <button type="button" class="btn btn--ghost" data-discard-sequence>Discard</button>
        ${confirm}
      </div>
    </div>
  </section>`;
}
