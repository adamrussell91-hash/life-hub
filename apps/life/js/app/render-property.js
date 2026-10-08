/**
 * Life → Property page. Builds a static shell once (controls keep focus while
 * sliders drag), then `update()` repaints the figures and charts from the engine.
 */
import { formatDisplayDate } from '../../../../packages/design-kit/js/format-display-date.js';
import { mountChartInfo } from '../../../../packages/design-kit/js/hub-chart-info.js';
import { showHubToast } from '../../../../packages/design-kit/js/hub-feedback.js';
import { buildMoneyFlow, spaceLabels } from './chart-kit/money-flow.js';
import { buildDivergingBars } from './chart-kit/diverging-bars.js';
import { buildEquityWedge, yearAtX } from './chart-kit/equity-wedge.js';
import {
  EXPENSE_CATEGORIES,
  addDays,
  buildPropertyModel,
  currentRent,
  currentValuation,
  guessFromText,
  pointAtYear,
  simulateFuture,
  sydneyDateKey,
  toTime,
  yearFraction
} from './property-model.js';

const NS = 'http://www.w3.org/2000/svg';
const PERIODS = { week: { mul: 1, suffix: '/wk', word: 'a week' }, month: { mul: 52 / 12, suffix: '/mth', word: 'a month' }, year: { mul: 52, suffix: '/yr', word: 'a year' } };
const KIND_LABELS = {
  statement: 'Agent statement',
  interest: 'Loan interest',
  balance: 'Loan balance',
  expense: 'Expense',
  valuation: 'Valuation',
  rent: 'Rent change',
  rate: 'Rate change'
};

// ── Formatting ──────────────────────────────────────────────────────────────

export function money(value, dp = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function shortMoney(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const roundTo = (value, step) => Math.round(value / step) * step;

function token(doc, name) {
  return doc.defaultView?.getComputedStyle?.(doc.documentElement)?.getPropertyValue(name)?.trim() || '';
}

function svgEl(doc, tag, attrs, parent) {
  const node = doc.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  parent?.append(node);
  return node;
}

function svgText(doc, parent, x, y, value, attrs = {}) {
  const node = svgEl(doc, 'text', { x, y, ...attrs }, parent);
  node.textContent = value;
  return node;
}

/** One line describing an entry, for the recent list and toasts. */
export function describeEntry(entry) {
  switch (entry.kind) {
    case 'statement': return { title: `Agent statement${entry.number ? ` #${entry.number}` : ''}`, amount: money(entry.gross, 2) };
    case 'interest': return { title: 'Loan interest', amount: money(entry.amount, 2) };
    case 'balance': return { title: 'Loan balance', amount: money(entry.balance, 2) };
    case 'expense': return { title: entry.note || EXPENSE_CATEGORIES[entry.category] || 'Expense', amount: money(entry.amount, 2) };
    case 'valuation': return { title: 'Valuation', amount: money(entry.amount) };
    case 'rent': return { title: 'Rent change', amount: `${money(entry.weeklyRent)}/wk` };
    case 'rate': return { title: 'Rate change', amount: `${entry.rate.toFixed(2)}%` };
    default: return { title: 'Record', amount: '' };
  }
}

// ── Shell ───────────────────────────────────────────────────────────────────

const SHELL = `
<div class="prop-lens" role="toolbar" aria-label="Property view">
  <div class="prop-seg" role="group" aria-label="Period">
    <button type="button" data-prop-period="week" aria-pressed="true">Week</button>
    <button type="button" data-prop-period="month" aria-pressed="false">Month</button>
    <button type="button" data-prop-period="year" aria-pressed="false">Year</button>
  </div>
  <p class="prop-lens__meta" data-prop="lens-meta"></p>
  <div class="prop-lens__actions">
    <button class="btn btn--ghost" type="button" data-prop-open="settings">Details</button>
    <button class="btn btn--primary" type="button" data-prop-open="record"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Record</button>
  </div>
</div>
<p class="prop-status" data-prop="status" role="status" hidden></p>

<div class="prop-grid">
  <article class="prop-tile prop-hero prop-s8">
    <p class="prop-kicker" data-prop-info="flow">Where the money goes</p>
    <p class="prop-hero__line" data-prop="hero-line"></p>
    <p class="prop-hero__why" data-prop="hero-why"></p>
    <div class="prop-flow"><svg data-prop="flow" role="img" aria-label="Money flow from rent and your top-up into interest, loan repayment, agent fees and rates"></svg></div>
    <dl class="prop-truth">
      <div><dt>Out of pocket</dt><dd data-prop="t-pocket"></dd></div>
      <div class="is-good"><dt>Goes into the house</dt><dd data-prop="t-equity"></dd></div>
      <div><dt>Real cost after tax <span class="prop-pill prop-pill--est">est.</span></dt><dd data-prop="t-real"></dd></div>
    </dl>
  </article>
  <article class="prop-tile prop-countdown prop-s4" data-prop="countdown"></article>
</div>

<section class="prop-tile prop-tm" aria-labelledby="prop-tm-title">
  <div class="prop-tm__top">
    <div>
      <p class="prop-kicker">Time machine</p>
      <p class="prop-tm__year" data-prop="tm-year"></p>
      <p class="prop-tm__story" data-prop="tm-story"></p>
    </div>
    <p class="prop-tm__title" id="prop-tm-title" data-prop="tm-title"></p>
  </div>
  <dl class="prop-tm__stats">
    <div class="prop-tm__stat"><dt><i class="prop-key prop-key--worth"></i>Worth</dt><dd data-prop="tm-worth"></dd></div>
    <div class="prop-tm__stat"><dt><i class="prop-key prop-key--loan"></i>Still owed</dt><dd data-prop="tm-loan"></dd></div>
    <div class="prop-tm__stat prop-tm__stat--hero"><dt><i class="prop-key prop-key--equity"></i>Yours</dt><dd data-prop="tm-equity"></dd></div>
    <div class="prop-tm__stat"><dt>Each week, before tax</dt><dd data-prop="tm-cash"></dd></div>
  </dl>
  <div class="prop-tm__chart"><svg data-prop="tm-svg" role="img" aria-label="Projected value, loan and equity"></svg></div>
  <div class="prop-tm__scrub"><label class="prop-sr" for="prop-tm-range">Year</label><input type="range" id="prop-tm-range" data-prop="tm-range" step="any"></div>
  <div class="prop-tm__moments" data-prop="tm-moments"></div>
  <div class="prop-tm__dials">
    <div class="prop-tm__dial">
      <label for="prop-tm-value">Worth today <span data-prop="tm-value-pill"></span></label>
      <div class="prop-tm__value"><input type="text" inputmode="numeric" id="prop-tm-value" data-prop="tm-value" autocomplete="off"><button class="btn btn--ghost" type="button" data-prop="tm-value-save" hidden>Save</button></div>
    </div>
    <div class="prop-tm__dial"><label for="prop-tm-growth">Price growth <output data-prop="tm-growth-out" for="prop-tm-growth"></output></label><input type="range" id="prop-tm-growth" data-prop="tm-growth" min="0" max="10" step="0.5"></div>
    <div class="prop-tm__dial"><label for="prop-tm-rentg">Rent growth <output data-prop="tm-rentg-out" for="prop-tm-rentg"></output></label><input type="range" id="prop-tm-rentg" data-prop="tm-rentg" min="0" max="8" step="0.5"></div>
  </div>
  <div class="prop-tm__foot">
    <p class="prop-tm__fine" data-prop="tm-fine"></p>
    <button class="btn btn--ghost prop-tm__keep" type="button" data-prop="tm-keep" hidden>Keep these growth rates</button>
  </div>
</section>

<dl class="prop-kpis" data-prop="kpis"></dl>

<div class="prop-section-head" id="prop-tax"><h2 data-prop="tax-heading">Tax return</h2><p data-prop="tax-sub"></p></div>
<section class="prop-tile">
  <div class="prop-tax">
    <div>
      <p class="prop-kicker" data-prop-info="tax">Rental result</p>
      <h3 class="prop-h" data-prop="tax-h"></h3>
      <p class="prop-sub" data-prop="tax-why"></p>
      <div class="prop-scroll"><svg data-prop="diverge" role="img" aria-label="Rental result as recorded compared with corrected"></svg></div>
      <div class="prop-legend">
        <span><i class="prop-key prop-key--recorded"></i>As recorded</span>
        <span><i class="prop-key prop-key--corrected"></i>Corrected</span>
        <span><i class="prop-key prop-key--ghost"></i>Not yet recorded</span>
      </div>
    </div>
    <div class="prop-tax__side">
      <ul class="prop-checklist" data-prop="checklist" aria-label="Return checklist"></ul>
      <div data-prop="next-step"></div>
    </div>
  </div>
</section>

<div class="prop-section-head"><h2>Rent ledger</h2><p>Every agent statement, and the ones still to record</p></div>
<div class="prop-grid">
  <article class="prop-tile prop-s8">
    <p class="prop-kicker" data-prop-info="ledger">Agent statements</p>
    <h3 class="prop-h" data-prop="ledger-h"></h3>
    <div class="prop-scroll"><svg data-prop="ledger" role="img" aria-label="Agent statements by date"></svg></div>
    <div class="prop-legend">
      <span><i class="prop-key prop-key--net"></i>Reached you</span>
      <span><i class="prop-key prop-key--fees"></i>Agent kept</span>
      <span><i class="prop-key prop-key--expected"></i>Expected, not recorded</span>
    </div>
  </article>
  <article class="prop-tile prop-s4 prop-stmt" data-prop="stmt" aria-live="polite"></article>
</div>

<div class="prop-section-head"><h2>The loan</h2><p data-prop="loan-sub"></p></div>
<div class="prop-grid">
  <article class="prop-tile prop-s8">
    <p class="prop-kicker" data-prop-info="loan">Balance and rate</p>
    <h3 class="prop-h" data-prop="loan-h"></h3>
    <div class="prop-scroll"><svg data-prop="glide" role="img" aria-label="Loan balance over time with interest rate steps"></svg></div>
  </article>
  <article class="prop-tile prop-s4 prop-whatif">
    <div><p class="prop-kicker">What if</p><h3 class="prop-h">Play with the numbers</h3><p class="prop-sub">Both sliders change every figure on this page. Nothing is saved.</p></div>
    <div class="prop-slider">
      <div class="prop-slider__top"><label for="prop-extra">Extra repayment</label><output data-prop="extra-out" for="prop-extra"></output></div>
      <input type="range" id="prop-extra" data-prop="extra" min="0" max="300" step="10" value="0">
      <div class="prop-slider__scale"><span>$0</span><span data-prop="extra-note"></span><span>$300</span></div>
    </div>
    <div class="prop-result">
      <div><p>Loan paid off</p><strong data-prop="r-payoff"></strong></div>
      <div><p>Interest saved</p><strong class="is-good" data-prop="r-saved"></strong></div>
    </div>
    <div class="prop-divider"></div>
    <div class="prop-slider">
      <div class="prop-slider__top"><label for="prop-rent">Rent at the next review</label><output data-prop="rent-out" for="prop-rent"></output></div>
      <input type="range" id="prop-rent" data-prop="rent" step="5">
      <div class="prop-slider__scale"><span data-prop="rent-min"></span><span data-prop="rent-note"></span><span data-prop="rent-max"></span></div>
    </div>
    <div class="prop-result">
      <div><p>Your top-up</p><strong data-prop="r-topup"></strong></div>
      <div><p>Change</p><strong data-prop="r-delta"></strong></div>
    </div>
  </article>
</div>

<div class="prop-section-head"><h2>Around the house</h2><p>What's coming, who's involved, what you've recorded</p></div>
<div class="prop-grid">
  <article class="prop-tile prop-s4"><p class="prop-kicker">Next up</p><h3 class="prop-h" data-prop="agenda-h"></h3><ul class="prop-agenda" data-prop="agenda"></ul></article>
  <article class="prop-tile prop-s4"><p class="prop-kicker">People</p><h3 class="prop-h">Who's on this property</h3><div class="prop-people" data-prop="people"></div></article>
  <article class="prop-tile prop-s4"><p class="prop-kicker">Recently recorded</p><h3 class="prop-h" data-prop="recent-h"></h3><ul class="prop-recent" data-prop="recent"></ul></article>
</div>

<dialog class="prop-sheet" data-prop="record-sheet" aria-labelledby="prop-record-title">
  <form class="prop-sheet__panel" method="dialog" data-prop="record-form" novalidate>
    <header class="prop-sheet__head"><h2 id="prop-record-title">Record</h2><p>Type it in your own words, or pick what it is.</p></header>
    <div class="prop-sheet__body">
      <div class="prop-field"><label for="prop-rec-text">What happened</label><input type="text" id="prop-rec-text" data-prop="rec-text" placeholder="Paid $180 to the plumber for the hot water" autocomplete="off"></div>
      <div class="prop-chips" role="group" aria-label="What is it" data-prop="rec-kinds"></div>
      <div class="prop-fields" data-prop="rec-fields"></div>
      <p class="prop-sheet__error" data-prop="rec-error" role="alert" hidden></p>
    </div>
    <footer class="prop-sheet__foot">
      <button class="btn btn--ghost" type="button" data-prop-close="record">Cancel</button>
      <button class="btn btn--primary" type="submit" data-prop="rec-save">Record</button>
    </footer>
  </form>
</dialog>

<dialog class="prop-sheet" data-prop="settings-sheet" aria-labelledby="prop-settings-title">
  <form class="prop-sheet__panel" method="dialog" data-prop="settings-form" novalidate>
    <header class="prop-sheet__head"><h2 id="prop-settings-title">Property details</h2><p>The facts every figure is worked out from.</p></header>
    <div class="prop-sheet__body" data-prop="settings-fields"></div>
    <p class="prop-sheet__error" data-prop="settings-error" role="alert" hidden></p>
    <footer class="prop-sheet__foot">
      <button class="btn btn--ghost" type="button" data-prop-close="settings">Cancel</button>
      <button class="btn btn--primary" type="submit">Save details</button>
    </footer>
  </form>
</dialog>
`;

const CHART_INFO = {
  flow: { id: 'property-flow', title: 'Where the money goes', what: 'Each week, the rent plus what you top up, and where every dollar lands: interest, loan repayment, agent fees, rates and insurance. Hover a ribbon to trace it.', how: 'Interest is the average of your last three loan interest charges. Repayment is the rest of the weekly repayment and goes into the house. The real cost is interest plus running costs less rent, after tax back at your tax rate.' },
  tax: { id: 'property-tax', title: 'Rental result', what: 'The rental result on your return: right of zero is taxable profit, left is a loss that lowers your other tax.', how: 'As recorded uses only what is on file. Corrected adds an estimate for each month of loan interest not yet recorded, plus yearly estimates for rates, insurance and depreciation where you have set them.' },
  ledger: { id: 'property-ledger', title: 'Agent statements', what: 'Each bar is one agent statement: what reached you, and what the agent kept. Dashed bars are statements your usual cadence says should exist but are not recorded. Tap a bar for detail.', how: 'Expected dates come from the days of the month your last six statements arrived on.' },
  loan: { id: 'property-loan', title: 'Balance and rate', what: 'Solid line: loan balances from your statements. Dashed: projected from your weekly repayment since the last recorded balance. The strip shows each rate.', how: 'The projection uses the interest you have actually been charged, so the offset accounts are already counted.' }
};

const SETTINGS_FIELDS = [
  ['Property', [
    ['property.name', 'Name', 'text'], ['property.address', 'Suburb and postcode', 'text'], ['property.settledOn', 'Settled on', 'date'], ['property.purchasePrice', 'Purchase price', 'money'],
    ['property.owners', 'Owners (comma separated)', 'list']
  ]],
  ['Tenancy', [
    ['tenancy.tenant', 'Tenant', 'text'], ['tenancy.startedOn', 'Tenancy started', 'date'], ['tenancy.weeklyRent', 'Weekly rent', 'money'],
    ['tenancy.agent', 'Agent', 'text'], ['tenancy.agentRate', 'Management fee (%)', 'percent']
  ]],
  ['Loan', [
    ['loan.lender', 'Lender', 'text'], ['loan.reference', 'Loan reference', 'text'], ['loan.original', 'Original loan', 'money'],
    ['loan.weeklyRepayment', 'Weekly repayment', 'money'], ['loan.rate', 'Interest rate (%)', 'number']
  ]],
  ['Yearly costs', [
    ['annualCosts.council', 'Council rates', 'cost'], ['annualCosts.water', 'Water rates', 'cost'], ['annualCosts.insurance', 'Landlord and building insurance', 'cost'],
    ['annualCosts.strata', 'Strata', 'cost'], ['annualCosts.depreciation', 'Depreciation (from the schedule)', 'cost']
  ]],
  ['Forecast', [
    ['assumptions.priceGrowth', 'Price growth (% a year)', 'percent'], ['assumptions.rentGrowth', 'Rent growth (% a year)', 'percent'],
    ['assumptions.costGrowth', 'Running cost growth (% a year)', 'percent'], ['assumptions.taxRate', 'Tax rate for tax back (%)', 'percent'],
    ['assumptions.depositTarget', 'Deposit target for house #2', 'money']
  ]]
];

const KIND_FIELDS = {
  statement: [['date', 'Statement date', 'date'], ['gross', 'Gross rent', 'money'], ['deductions', 'Agent kept', 'money'], ['periodFrom', 'Rent from', 'date'], ['periodTo', 'Rent to', 'date'], ['note', 'Note', 'text']],
  interest: [['date', 'Date charged', 'date'], ['amount', 'Interest charged', 'money'], ['balanceAfter', 'Balance after (optional)', 'money'], ['note', 'Note', 'text']],
  balance: [['date', 'Statement date', 'date'], ['balance', 'Loan balance', 'money'], ['note', 'Note', 'text']],
  expense: [['date', 'Date paid', 'date'], ['amount', 'Amount', 'money'], ['category', 'Type', 'category'], ['note', 'What for', 'text'], ['deductible', 'Tax deductible', 'check'], ['inStatement', 'Already on an agent statement', 'check'], ['renews', 'Renews every year', 'check']],
  valuation: [['date', 'Date', 'date'], ['amount', 'Worth', 'money'], ['note', 'Source (agent appraisal, bank, sold nearby)', 'text']],
  rent: [['date', 'Starts on', 'date'], ['weeklyRent', 'New weekly rent', 'money'], ['note', 'Note', 'text']],
  rate: [['date', 'Effective date', 'date'], ['rate', 'New rate (%)', 'number'], ['note', 'Note', 'text']]
};

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

// ── View ────────────────────────────────────────────────────────────────────

export function createPropertyView({ root, api, now = () => new Date(), setTitle = () => {} }) {
  const doc = root.ownerDocument ?? root;
  const host = () => root.querySelector('#property-dashboard');
  const q = name => host()?.querySelector(`[data-prop="${name}"]`);
  const state = {
    record: null,
    status: 'idle',
    error: '',
    period: 'week',
    extra: 0,
    rent: null,
    selected: null,
    tmYear: null,
    tmGrowth: null,
    tmRentGrowth: null,
    nextStepDismissed: false,
    recordKind: 'expense',
    removing: null
  };
  let built = false;
  let model = null;

  const today = () => sydneyDateKey(now());

  function build() {
    const el = host();
    if (!el || built) return;
    el.innerHTML = SHELL;
    built = true;
    for (const [key, spec] of Object.entries(CHART_INFO)) {
      const anchor = el.querySelector(`[data-prop-info="${key}"]`);
      if (anchor) mountChartInfo(anchor, spec);
    }
    wire(el);
  }

  function wire(el) {
    el.addEventListener('click', event => {
      const period = event.target.closest('[data-prop-period]');
      if (period) {
        state.period = period.dataset.propPeriod;
        update();
        return;
      }
      const open = event.target.closest('[data-prop-open]');
      if (open) {
        if (open.dataset.propOpen === 'record') openRecord(open.dataset.propKind, { date: open.dataset.propDate });
        else openSettings();
        return;
      }
      const close = event.target.closest('[data-prop-close]');
      if (close) {
        closeSheet(close.dataset.propClose);
        return;
      }
      const statement = event.target.closest('[data-prop-statement]');
      if (statement) {
        state.selected = statement.dataset.propStatement;
        paintLedger();
        return;
      }
      const moment = event.target.closest('[data-prop-moment]');
      if (moment) {
        state.tmYear = Number(moment.dataset.propMoment) + 0.02;
        paintTimeMachine();
        return;
      }
      const remove = event.target.closest('[data-prop-remove]');
      if (remove) {
        void onRemove(remove.dataset.propRemove);
        return;
      }
      const kind = event.target.closest('[data-prop-kind-chip]');
      if (kind) {
        state.recordKind = kind.dataset.propKindChip;
        paintRecordFields({});
        return;
      }
      if (event.target.closest('[data-prop="next-dismiss"]')) {
        state.nextStepDismissed = true;
        paintTax();
        return;
      }
      if (event.target.closest('[data-prop="lodged"]')) void onLodged();
      if (event.target.closest('[data-prop="tm-value-save"]')) void onSaveValuation();
      if (event.target.closest('[data-prop="tm-keep"]')) void onKeepGrowth();
      if (event.target.closest('[data-prop="retry"]')) void load();
    });

    q('extra').addEventListener('input', event => { state.extra = Number(event.target.value); update(); });
    q('rent').addEventListener('input', event => { state.rent = Number(event.target.value); update(); });
    q('tm-range').addEventListener('input', event => { state.tmYear = Number(event.target.value); paintTimeMachine(); });
    q('tm-growth').addEventListener('input', event => { state.tmGrowth = Number(event.target.value) / 100; paintTimeMachine(); });
    q('tm-rentg').addEventListener('input', event => { state.tmRentGrowth = Number(event.target.value) / 100; paintTimeMachine(); });
    q('tm-value').addEventListener('input', () => { q('tm-value-save').hidden = false; });
    q('tm-value').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void onSaveValuation(); } });
    q('rec-text').addEventListener('input', event => {
      const guess = guessFromText(event.target.value);
      if (guess.kind && guess.kind !== state.recordKind) state.recordKind = guess.kind;
      paintRecordFields({ ...(guess.amount !== null ? amountField(guess) : {}), ...(guess.category ? { category: guess.category } : {}), note: event.target.value.trim() }, { keepValues: true });
    });
    q('record-form').addEventListener('submit', event => { event.preventDefault(); void onRecord(); });
    q('settings-form').addEventListener('submit', event => { event.preventDefault(); void onSaveSettings(); });

    const svg = q('tm-svg');
    svg.addEventListener('pointerdown', event => {
      svg.setPointerCapture?.(event.pointerId);
      scrubTo(event);
      const move = next => scrubTo(next);
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerup', () => svg.removeEventListener('pointermove', move), { once: true });
    });
    doc.defaultView?.addEventListener?.('resize', () => { if (model && !host()?.hidden) { paintFlow(); paintTimeMachine(); } });
  }

  function amountField(guess) {
    if (guess.kind === 'rent') return { weeklyRent: guess.amount };
    if (guess.kind === 'rate') return { rate: guess.amount };
    if (guess.kind === 'statement') return { gross: guess.amount };
    if (guess.kind === 'balance') return { balance: guess.amount };
    return { amount: guess.amount };
  }

  function scrubTo(event) {
    const svg = q('tm-svg');
    const wedge = svg?._wedge;
    if (!wedge) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * wedge.width;
    state.tmYear = yearAtX(wedge, x);
    paintTimeMachine();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  async function load() {
    build();
    state.status = 'loading';
    paintStatus();
    try {
      state.record = await api.getRecord();
      state.status = 'ready';
      state.rent = null;
    } catch (error) {
      state.status = 'error';
      state.error = error?.status === 401 ? 'Sign in again to see the property.' : 'The property could not load. Check your connection and try again.';
    }
    update();
  }

  async function mutate(run, success) {
    try {
      const result = await run();
      const record = result?.record ?? result;
      if (record) state.record = record;
      update();
      if (success) showHubToast(success, { tone: 'success' });
      return true;
    } catch (error) {
      showHubToast(error?.message || 'That did not save. Try again.', { tone: 'danger' });
      return false;
    }
  }

  async function onRemove(id) {
    if (state.removing !== id) {
      state.removing = id;
      paintRecent();
      setTimeout(() => { if (state.removing === id) { state.removing = null; paintRecent(); } }, 4000);
      return;
    }
    state.removing = null;
    await mutate(() => api.removeEntry(id), 'Removed');
  }

  async function onLodged() {
    if (!model) return;
    await mutate(() => api.markLodged(model.summary.fy.label), `Marked ${model.summary.fy.label} as lodged`);
  }

  async function onSaveValuation() {
    const amount = Number(String(q('tm-value').value).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount < 10_000) {
      showHubToast('Type what the property is worth, like 820,000.', { tone: 'danger' });
      return;
    }
    const ok = await mutate(() => api.addEntry({ kind: 'valuation', date: today(), amount, note: 'From the time machine' }), 'Valuation recorded');
    if (ok) q('tm-value-save').hidden = true;
  }

  async function onKeepGrowth() {
    const patch = { assumptions: {} };
    if (state.tmGrowth !== null) patch.assumptions.priceGrowth = state.tmGrowth;
    if (state.tmRentGrowth !== null) patch.assumptions.rentGrowth = state.tmRentGrowth;
    const ok = await mutate(() => api.saveSettings(patch), 'Growth rates saved');
    if (ok) { state.tmGrowth = null; state.tmRentGrowth = null; paintTimeMachine(); }
  }

  // ── Sheets ────────────────────────────────────────────────────────────────

  function openSheet(name) {
    const sheet = q(`${name}-sheet`);
    if (sheet && typeof sheet.showModal === 'function' && !sheet.open) sheet.showModal();
  }

  function closeSheet(name) {
    const sheet = q(`${name}-sheet`);
    if (sheet?.open) sheet.close();
  }

  function openRecord(kind, preset = {}) {
    state.recordKind = kind && KIND_FIELDS[kind] ? kind : state.recordKind;
    q('rec-text').value = '';
    q('rec-error').hidden = true;
    paintRecordFields({ date: preset.date || today() });
    openSheet('record');
    q('rec-text').focus?.();
  }

  function paintRecordFields(values, { keepValues = false } = {}) {
    const fields = q('rec-fields');
    const current = keepValues ? readForm(fields) : {};
    const merged = { date: today(), deductible: true, ...current, ...values };
    if (state.recordKind === 'expense' && !merged.category) merged.category = 'repairs';
    q('rec-kinds').innerHTML = Object.entries(KIND_LABELS)
      .map(([kind, label]) => `<button type="button" class="prop-chip" data-prop-kind-chip="${kind}" aria-pressed="${kind === state.recordKind}">${label}</button>`)
      .join('');
    fields.innerHTML = KIND_FIELDS[state.recordKind].map(([name, label, type]) => fieldHtml(`rec-${name}`, name, label, type, merged[name])).join('');
  }

  function fieldHtml(id, name, label, type, value) {
    if (type === 'check') {
      const checked = name === 'renews' ? value === 'yearly' || value === true : value === true;
      return `<label class="prop-check" for="prop-${id}"><input type="checkbox" id="prop-${id}" name="${name}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
    }
    if (type === 'category') {
      return `<div class="prop-field"><label for="prop-${id}">${label}</label><select id="prop-${id}" name="${name}">${Object.entries(EXPENSE_CATEGORIES).map(([key, text]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`;
    }
    const inputType = type === 'date' ? 'date' : 'text';
    const mode = type === 'money' || type === 'number' || type === 'percent' ? ' inputmode="decimal"' : '';
    const shown = value === null || value === undefined ? '' : String(value);
    return `<div class="prop-field"><label for="prop-${id}">${label}</label><input type="${inputType}" id="prop-${id}" name="${name}"${mode} value="${escapeHtml(shown)}" autocomplete="off"></div>`;
  }

  function readForm(container) {
    const out = {};
    for (const input of container.querySelectorAll('input, select')) {
      if (!input.name) continue;
      if (input.type === 'checkbox') out[input.name] = input.checked;
      else out[input.name] = input.value;
    }
    return out;
  }

  async function onRecord() {
    const values = readForm(q('rec-fields'));
    const entry = { kind: state.recordKind };
    for (const [key, value] of Object.entries(values)) {
      if (key === 'renews') { if (value) entry.renews = 'yearly'; continue; }
      if (typeof value === 'boolean') { entry[key] = value; continue; }
      if (value === '') continue;
      entry[key] = ['date', 'periodFrom', 'periodTo', 'note', 'category'].includes(key) ? value : Number(String(value).replace(/[$,\s%]/g, ''));
    }
    const ok = await mutate(async () => {
      const data = await api.addEntry(entry);
      return data?.record;
    }, `Recorded: ${KIND_LABELS[state.recordKind].toLowerCase()}`);
    if (ok) closeSheet('record');
    else {
      q('rec-error').hidden = false;
      q('rec-error').textContent = 'Check the fields above and try again.';
    }
  }

  function openSettings() {
    const record = state.record;
    if (!record) return;
    const fields = SETTINGS_FIELDS.map(([group, rows]) => `<fieldset class="prop-fieldset"><legend>${group}</legend>${rows.map(([path, label, type]) => settingsField(record, path, label, type)).join('')}</fieldset>`).join('');
    q('settings-fields').innerHTML = fields;
    q('settings-error').hidden = true;
    openSheet('settings');
  }

  function settingsField(record, path, label, type) {
    const id = `set-${path.replace('.', '-')}`;
    const value = getPath(record, path);
    if (type === 'cost') {
      const cost = value ?? null;
      return `<div class="prop-field prop-field--cost"><label for="prop-${id}">${label}</label><input type="text" inputmode="decimal" id="prop-${id}" name="${path}" value="${cost ? cost.amount : ''}" placeholder="Yearly amount" autocomplete="off">
        <label class="prop-check" for="prop-${id}-est"><input type="checkbox" id="prop-${id}-est" name="${path}.estimate" ${cost?.estimate ? 'checked' : ''}><span>Estimate</span></label></div>`;
    }
    let shown = value ?? '';
    if (type === 'percent' && typeof value === 'number') shown = String(Math.round(value * 10000) / 100);
    if (type === 'list' && Array.isArray(value)) shown = value.join(', ');
    const inputType = type === 'date' ? 'date' : 'text';
    const mode = type === 'money' || type === 'number' || type === 'percent' ? ' inputmode="decimal"' : '';
    return `<div class="prop-field"><label for="prop-${id}">${label}</label><input type="${inputType}" id="prop-${id}" name="${path}"${mode} value="${escapeHtml(shown)}" autocomplete="off"></div>`;
  }

  async function onSaveSettings() {
    const values = readForm(q('settings-fields'));
    const patch = {};
    for (const [, rows] of SETTINGS_FIELDS) {
      for (const [path, , type] of rows) {
        const [section, key] = path.split('.');
        patch[section] ??= {};
        const raw = values[path];
        const numeric = String(raw ?? '').replace(/[$,\s%]/g, '');
        if (type === 'cost') {
          patch[section][key] = numeric === '' ? null : { amount: Number(numeric), estimate: values[`${path}.estimate`] === true };
        } else if (type === 'money' || type === 'number') {
          patch[section][key] = numeric === '' ? null : Number(numeric);
        } else if (type === 'percent') {
          patch[section][key] = numeric === '' ? null : Number(numeric) / 100;
        } else if (type === 'list') {
          patch[section][key] = String(raw ?? '').split(',').map(part => part.trim()).filter(Boolean);
        } else {
          patch[section][key] = raw ?? '';
        }
      }
    }
    for (const key of ['priceGrowth', 'rentGrowth', 'costGrowth', 'taxRate', 'depositTarget']) {
      if (patch.assumptions[key] === null) delete patch.assumptions[key];
    }
    const ok = await mutate(() => api.saveSettings(patch), 'Details saved');
    if (ok) closeSheet('settings');
    else { q('settings-error').hidden = false; q('settings-error').textContent = 'Those details did not save. Check the numbers and try again.'; }
  }

  // ── Paint ─────────────────────────────────────────────────────────────────

  function paintStatus() {
    const status = q('status');
    if (!status) return;
    host().dataset.state = state.status;
    if (state.status === 'loading' && !state.record) {
      status.hidden = false;
      status.textContent = 'Loading the property…';
    } else if (state.status === 'error') {
      status.hidden = false;
      status.innerHTML = `${escapeHtml(state.error)} <button class="btn btn--ghost" type="button" data-prop="retry">Try again</button>`;
    } else {
      status.hidden = true;
    }
  }

  function update() {
    paintStatus();
    if (!state.record) return;
    const date = today();
    model = buildPropertyModel(state.record, { today: date, extra: state.extra, rent: state.rent ?? undefined });
    setTitle(state.record.property.name || 'Property');
    for (const button of host().querySelectorAll('[data-prop-period]')) button.setAttribute('aria-pressed', String(button.dataset.propPeriod === state.period));
    const supporting = [state.record.property.address, state.record.property.owners.join(' & '), model.summary.tenancy ? `tenanted since ${formatDisplayDate(model.summary.tenancy)}` : null].filter(Boolean).join(' · ');
    q('lens-meta').textContent = supporting;
    paintFlow();
    paintCountdown();
    paintTimeMachine();
    paintKpis();
    paintTax();
    paintLedger();
    paintLoan();
    paintWhatIf();
    paintAgenda();
    paintPeople();
    paintRecent();
  }

  function periodOf() {
    return PERIODS[state.period];
  }

  function paintFlow() {
    if (!model) return;
    const flow = model.flow;
    const period = periodOf();
    const k = period.mul;
    const name = state.record.property.name || 'The property';
    const svg = q('flow');
    svg.replaceChildren();
    const hasData = flow.rent > 0 || flow.interest > 0;
    if (!hasData) {
      q('hero-line').textContent = 'Add the rent and loan to see where the money goes';
      q('hero-why').innerHTML = 'Open <b>Details</b> and fill in the weekly rent, agent fee and weekly repayment. Record a loan statement for the interest.';
      for (const key of ['t-pocket', 't-equity', 't-real']) q(key).textContent = '—';
      return;
    }
    const pays = flow.real < 0;
    q('hero-line').innerHTML = pays
      ? `${escapeHtml(name)} pays you about <em>${money(-flow.real * k)}</em> ${period.word}`
      : `${escapeHtml(name)} costs you about <em>${money(flow.real * k)}</em> ${period.word}`;
    q('hero-why').innerHTML = flow.pocket > 0
      ? `You put in <b>${money(flow.pocket * k)}</b> ${period.word} on top of the rent, but <b>${money(flow.principal * k)}</b> of that pays down the loan. That's savings, not cost. What's left is <b>${money(flow.holding * k)}</b>, and tax back at ${Math.round(flow.taxRate * 100)}% brings it to <b>${money(flow.real * k)}</b>.`
      : `The rent covers every cost with <b>${money(-flow.pocket * k)}</b> ${period.word} to spare.`;
    q('t-pocket').innerHTML = `${money(Math.max(flow.pocket, 0) * k)}<small>${period.suffix}</small>`;
    q('t-equity').innerHTML = `${money(flow.principal * k)}<small>${period.suffix}</small>`;
    q('t-real').innerHTML = `${money(flow.real * k)}<small>${period.suffix}</small>`;

    const width = Math.round(Math.min(560, Math.max(300, svg.parentNode?.clientWidth || 560)));
    const narrow = width < 460;
    const height = 300;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const xLeft = narrow ? 84 : 112;
    const xRight = width - (narrow ? 112 : 180);
    const layout = buildMoneyFlow(
      [{ id: 'rent', label: 'Rent', value: flow.rent }, { id: 'pocket', label: 'Your top-up', value: Math.max(flow.pocket, 0) }],
      [
        { id: 'agent', label: 'Agent fees', value: flow.agent },
        { id: 'rates', label: 'Rates & water', value: flow.rates },
        { id: 'insurance', label: 'Insurance', value: flow.insurance },
        { id: 'interest', label: 'Interest', value: flow.interest },
        { id: 'principal', label: 'Into the house', value: flow.principal }
      ],
      { height, xLeft, xRight }
    );
    const colours = { rent: token(doc, '--wave'), pocket: token(doc, '--high-sea-ink'), agent: token(doc, '--muted'), rates: token(doc, '--muted'), insurance: token(doc, '--muted'), interest: token(doc, '--marine'), principal: token(doc, '--success') };
    const group = svgEl(doc, 'g', {}, svg);
    for (const ribbon of layout.ribbons) {
      const principal = ribbon.target === 'principal';
      const path = svgEl(doc, 'path', { d: ribbon.path, fill: principal ? colours.principal : colours[ribbon.source], 'fill-opacity': principal ? 0.32 : 0.2, class: 'prop-ribbon', 'data-source': ribbon.source, 'data-target': ribbon.target }, group);
      const title = svgEl(doc, 'title', {}, path);
      title.textContent = `${ribbon.source === 'rent' ? 'Rent' : 'Your top-up'} → ${layout.nodes.find(node => node.id === ribbon.target)?.label}: ${money(ribbon.value * k)}${period.suffix}`;
    }
    const focus = pick => { svg.classList.add('is-focus'); for (const path of svg.querySelectorAll('.prop-ribbon')) path.classList.toggle('is-on', pick(path)); };
    const clear = () => svg.classList.remove('is-focus');
    for (const path of svg.querySelectorAll('.prop-ribbon')) {
      path.addEventListener('mouseenter', () => focus(other => other === path));
      path.addEventListener('mouseleave', clear);
    }
    for (const side of ['left', 'right']) {
      const nodes = layout.nodes.filter(node => node.side === side);
      const labelY = spaceLabels(nodes);
      nodes.forEach((node, index) => {
        const rect = svgEl(doc, 'rect', { x: node.x, y: node.y, width: 12, height: Math.max(node.h, 2), rx: 3, fill: colours[node.id], class: 'prop-node' }, svg);
        rect.addEventListener('mouseenter', () => focus(path => path.dataset.source === node.id || path.dataset.target === node.id));
        rect.addEventListener('mouseleave', clear);
        const x = side === 'left' ? node.x - 10 : node.x + 22;
        const anchor = side === 'left' ? 'end' : 'start';
        svgText(doc, svg, x, labelY[index] - 2, node.label, { 'text-anchor': anchor, class: 'prop-svg-label', 'font-size': narrow ? 12.5 : 14 });
        svgText(doc, svg, x, labelY[index] + 15, `${money(node.value * k)}${period.suffix}`, { 'text-anchor': anchor, class: node.id === 'principal' ? 'prop-svg-value is-good' : 'prop-svg-value', 'font-size': narrow ? 12 : 13 });
      });
    }
  }

  function paintCountdown() {
    const box = q('countdown');
    const summary = model.summary;
    const ringC = 251.33;
    const fraction = summary.total ? summary.ready / summary.total : 0;
    const ring = `<svg class="prop-ring" viewBox="0 0 96 96" aria-hidden="true"><circle class="prop-ring__track" cx="48" cy="48" r="40" fill="none" stroke-width="8"/><circle class="prop-ring__fill" cx="48" cy="48" r="40" fill="none" stroke-width="8" stroke-linecap="round" transform="rotate(-90 48 48)" stroke-dasharray="${ringC}" stroke-dashoffset="${ringC * (1 - fraction)}"/><text x="48" y="46" text-anchor="middle" class="prop-ring__big">${summary.ready}/${summary.total}</text><text x="48" y="62" text-anchor="middle" class="prop-ring__small">ready</text></svg>`;
    const fy = summary.fy.label.replace('-', '–');
    const flags = summary.checklist.filter(item => item.status === 'missing').slice(0, 2).map(item => `<li>${escapeHtml(item.label)}: ${escapeHtml(item.detail.toLowerCase())}</li>`).join('');
    if (summary.fy.inProgress) {
      box.innerHTML = `<p class="prop-kicker">Tax year ${fy}</p><h2>This year so far</h2>
        <div class="prop-countdown__row">${ring}<div><div class="prop-countdown__days">${money(summary.correctedResult)}</div><p class="prop-countdown__meta">rental result so far, with estimates</p></div></div>
        ${flags ? `<ul class="prop-flagline">${flags}</ul>` : ''}<a class="btn btn--high-sea" href="#prop-tax">See the year</a>`;
      return;
    }
    const overdue = summary.daysLeft < 0;
    const ready = summary.ready === summary.total;
    box.innerHTML = `<p class="prop-kicker">Tax return ${fy}</p><h2>${ready ? 'Your return is ready to lodge' : "Your return isn't ready yet"}</h2>
      <div class="prop-countdown__row">${ring}<div><div class="prop-countdown__days">${Math.abs(summary.daysLeft)}<small>${overdue ? 'days late' : Math.abs(summary.daysLeft) === 1 ? 'day' : 'days'}</small></div><p class="prop-countdown__meta">${overdue ? 'past' : 'to'} the ${formatDisplayDate(summary.fy.lodgeBy)} deadline if you lodge it yourself</p></div></div>
      ${summary.stake > 0 ? `<div class="prop-stake"><p>Tax you could overpay if you lodge it as recorded <span class="prop-pill prop-pill--est">est.</span></p><strong>≈ ${money(roundTo(summary.stake, 10))}</strong></div>` : ''}
      ${flags ? `<ul class="prop-flagline">${flags}</ul>` : ''}
      <div class="prop-countdown__actions"><a class="btn btn--high-sea" href="#prop-tax">${ready ? 'Review the return' : 'Fix my return'}</a><button class="btn prop-btn--on-dark" type="button" data-prop="lodged">Mark as lodged</button></div>`;
  }

  function paintKpis() {
    const position = model.loan.position;
    const rent = currentRent(state.record, model.today);
    const last = model.lastStatement;
    const original = state.record.loan.original;
    const items = [
      { label: 'Loan today', pill: position.estimated ? 'est.' : '', value: position.today === null ? '—' : money(roundTo(position.today, 100)), note: position.known ? `Last statement ${formatDisplayDate(position.known.date)}: ${money(position.known.balance)}` : 'Record a loan statement' },
      { label: 'Paid off so far', pill: position.estimated ? 'est.' : '', value: position.paidOff === null ? '—' : money(roundTo(position.paidOff, 100)), note: original && position.paidOff !== null ? `<span class="is-good">${((position.paidOff / original) * 100).toFixed(1)}%</span> of the original loan` : 'Add the original loan in Details' },
      { label: 'Interest rate', value: model.loan.rate === null ? '—' : `${model.loan.rate.toFixed(2)}%`, note: model.loan.rateChange ? `<span class="${model.loan.rateChange < 0 ? 'is-good' : 'is-bad'}">${model.loan.rateChange > 0 ? '+' : '−'}${Math.abs(model.loan.rateChange).toFixed(2)} pts</span> since ${formatDisplayDate(model.loan.rateSince)}` : 'Record rate changes as they happen' },
      { label: 'Rent', value: rent === null ? '—' : `${money(rent * periodOf().mul)}${periodOf().suffix}`, pill: last?.periodTo && daysSince(last.periodTo) > 21 ? 'stale' : '', note: last?.periodTo ? `Paid to ${formatDisplayDate(last.periodTo)}` : 'Record an agent statement' },
      { label: `Net rent ${model.summary.fy.label.replace('-', '–')}`, value: money(model.netRentYear), note: `After agent costs, ${model.summary.checklist[0].detail.toLowerCase()}` }
    ];
    q('kpis').innerHTML = items.map(item => `<div class="prop-tile prop-kpi"><dt>${item.label}${item.pill ? ` <span class="prop-pill prop-pill--${item.pill === 'stale' ? 'stale' : 'est'}">${item.pill}</span>` : ''}</dt><dd>${item.value}</dd><p>${item.note}</p></div>`).join('');
  }

  function daysSince(dateKey) {
    return Math.round((toTime(model.today) - toTime(dateKey)) / 86_400_000);
  }

  function paintTax() {
    const summary = model.summary;
    const fy = summary.fy.label.replace('-', '–');
    q('tax-heading').textContent = `Your ${fy} return`;
    q('tax-sub').textContent = summary.fy.inProgress ? 'The year so far, and what it should look like' : "What's recorded now, and what it should be";
    const moved = Math.abs(summary.recordedResult - summary.correctedResult) >= 1;
    const word = value => (value >= 0 ? 'profit' : 'loss');
    q('tax-h').textContent = moved
      ? `A ${money(Math.abs(summary.recordedResult))} ${word(summary.recordedResult)} should be a ${money(Math.abs(summary.correctedResult))} ${word(summary.correctedResult)}`
      : `A ${money(Math.abs(summary.recordedResult))} ${word(summary.recordedResult)}, with nothing missing`;
    q('tax-why').textContent = summary.missingMonths.length
      ? "The rent and the agent's costs are recorded, but some loan interest isn't. It's your biggest deduction, and without it the property looks like it made money."
      : 'Everything the return needs is either recorded or estimated from your yearly costs.';

    const svg = q('diverge');
    svg.replaceChildren();
    const width = 560;
    svg.setAttribute('viewBox', `0 0 ${width} 210`);
    const layout = buildDivergingBars([
      { key: 'recorded', value: summary.recordedResult },
      { key: 'corrected', value: summary.correctedResult, from: summary.correctedResult + summary.interestEstimate }
    ], { width, left: 150 });
    for (const tick of layout.ticks) {
      svgEl(doc, 'line', { x1: tick.x, x2: tick.x, y1: 22, y2: 172, class: tick.value === 0 ? 'prop-zero' : 'prop-grid-line' }, svg);
      svgText(doc, svg, tick.x, 192, tick.value === 0 ? '$0' : shortMoney(tick.value), { 'text-anchor': 'middle', class: 'prop-axis' });
    }
    svgText(doc, svg, 150, 14, '← loss lowers your tax', { class: 'prop-axis' });
    svgText(doc, svg, width - 16, 14, 'profit is taxed →', { 'text-anchor': 'end', class: 'prop-axis' });
    const [recorded, corrected] = layout.bars;
    // Value sits outside the bar's far end, or inside it when there's no room past the edge.
    const barLabel = (bar, y, tone) => {
      const outsideX = bar.positive ? bar.x + bar.width + 6 : bar.x - 6;
      const fits = bar.positive ? outsideX + 70 <= width : outsideX - 70 >= 150;
      const x = fits ? outsideX : bar.positive ? bar.x + bar.width - 8 : bar.x + 8;
      const anchor = fits === bar.positive ? 'start' : 'end';
      svgText(doc, svg, x, y, money(bar.value), { 'text-anchor': anchor, class: `prop-svg-value ${fits ? tone : 'is-inverse'}` });
    };
    svgText(doc, svg, 0, 54, 'As recorded', { class: 'prop-svg-label', 'font-size': 13 });
    svgText(doc, svg, 0, 71, summary.missingMonths.length ? 'missing interest' : 'on file', { class: 'prop-axis' });
    svgEl(doc, 'rect', { x: recorded.x, y: 38, width: recorded.width, height: 34, rx: 6, class: 'prop-bar--recorded' }, svg);
    barLabel(recorded, 60, 'is-strong');
    svgText(doc, svg, 0, 124, 'Corrected', { class: 'prop-svg-label', 'font-size': 13 });
    svgText(doc, svg, 0, 141, 'with estimates', { class: 'prop-axis' });
    if (corrected.ghost && corrected.ghost.width > 1) {
      svgEl(doc, 'rect', { x: corrected.ghost.x, y: 108, width: corrected.ghost.width, height: 34, rx: 6, class: 'prop-bar--ghost' }, svg);
      svgText(doc, svg, corrected.ghost.x + corrected.ghost.width / 2, 102, `− ${money(summary.interestEstimate)} interest`, { 'text-anchor': 'middle', class: 'prop-axis is-wave' });
    }
    svgEl(doc, 'rect', { x: corrected.x, y: 108, width: corrected.width, height: 34, rx: 6, class: 'prop-bar--corrected' }, svg);
    barLabel(corrected, 130, 'is-wave');

    const marks = { done: '✓', partial: '~', missing: '!', info: '?' };
    q('checklist').innerHTML = summary.checklist.map(item => `<li><span class="prop-ck prop-ck--${item.status}" aria-label="${item.status}">${marks[item.status]}</span><div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.detail)}</span></div><span class="prop-amt${item.status === 'done' ? '' : ' is-ghost'}">${item.amount === null ? (item.status === 'info' ? 'Auto' : 'Missing') : `${item.estimate ? '≈ ' : ''}${money(item.amount)}`}</span></li>`).join('');

    const next = state.nextStepDismissed ? null : nextStep(summary);
    q('next-step').innerHTML = next ? `<div class="confirm-card" role="group" aria-label="${escapeHtml(next.title)}">
        <div class="confirm-card__head"><p class="confirm-card__title">${escapeHtml(next.title)}</p><span class="confirm-card__meta">Next step</span></div>
        <p class="confirm-card__body">${escapeHtml(next.body)}</p>
        <div class="prop-cc-foot"><button class="btn btn--ghost" type="button" data-prop="next-dismiss">Not now</button><button class="btn btn--primary" type="button" data-prop-open="${next.open}" data-prop-kind="${next.kind ?? ''}">${escapeHtml(next.action)}</button></div>
      </div>` : '';
  }

  function nextStep(summary) {
    if (summary.missingMonths.length) {
      return { title: `Record ${summary.missingMonths.length} month${summary.missingMonths.length === 1 ? '' : 's'} of loan interest`, body: 'Each loan statement has an interest line. Record them one at a time and the estimate on this page turns into the real figure.', action: 'Record interest', open: 'record', kind: 'interest' };
    }
    const insurance = summary.checklist.find(item => item.key === 'insurance');
    if (insurance?.status === 'missing') return { title: 'Record your landlord insurance', body: 'Add the yearly premium in Details, or record each payment as an expense.', action: 'Open details', open: 'settings' };
    const depreciation = summary.checklist.find(item => item.key === 'depreciation');
    if (depreciation?.status === 'missing') return { title: 'Add a depreciation schedule', body: "A quantity surveyor's schedule lists the yearly deduction for the building and fittings. Add the yearly figure in Details.", action: 'Open details', open: 'settings' };
    return null;
  }

  function paintLedger() {
    const ledger = model.ledger;
    const svg = q('ledger');
    svg.replaceChildren();
    const rows = ledger.rows.slice(-24);
    q('ledger-h').textContent = ledger.missingCount
      ? `${ledger.missingCount} statement${ledger.missingCount === 1 ? '' : 's'} since ${formatDisplayDate(model.lastStatement.date)} ${ledger.missingCount === 1 ? "hasn't" : "haven't"} been recorded`
      : rows.length ? 'Every statement is recorded' : 'No statements recorded yet';
    const width = 640;
    const height = 230;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (!rows.length) {
      paintStatement(null);
      return;
    }
    const padL = 48;
    const base = 186;
    const top = 18;
    const slot = (width - padL - 8) / Math.max(rows.length, 6);
    const bar = slot * 0.62;
    const maxGross = Math.max(...rows.map(row => row.gross), 1);
    const step = maxGross > 1500 ? 600 : maxGross > 600 ? 300 : 100;
    const maxV = Math.ceil(maxGross / step) * step;
    const sy = value => base - (value / maxV) * (base - top);
    for (let value = 0; value <= maxV; value += step) {
      svgEl(doc, 'line', { x1: padL, x2: width - 8, y1: sy(value), y2: sy(value), class: 'prop-grid-line' }, svg);
      svgText(doc, svg, padL - 8, sy(value) + 4, money(value), { 'text-anchor': 'end', class: 'prop-axis' });
    }
    if (!state.selected || !rows.some(row => row.id === state.selected)) state.selected = rows.filter(row => !row.expected).at(-1)?.id ?? rows[0].id;
    let lastMonth = '';
    let fyMarked = false;
    const currentFyStart = model.summary.fy.inProgress ? null : addDays(model.summary.fy.end, 1);
    rows.forEach((row, index) => {
      const x = padL + index * slot + (slot - bar) / 2;
      const group = svgEl(doc, 'g', { class: `prop-bar${row.id === state.selected ? ' is-on' : ''}`, tabindex: 0, role: 'button', 'data-prop-statement': row.id, 'aria-label': row.expected ? `Expected statement ${formatDisplayDate(row.date)}, not recorded` : `Statement ${row.number}, ${formatDisplayDate(row.date)}` }, svg);
      svgEl(doc, 'rect', { class: 'prop-bar__sel', x: x - 4, y: top - 8, width: bar + 8, height: base - top + 12, rx: 6 }, group);
      if (row.expected) {
        svgEl(doc, 'rect', { class: 'prop-bar__expected', x, y: sy(row.gross), width: bar, height: base - sy(row.gross), rx: 4 }, group);
        svgText(doc, group, x + bar / 2, sy(row.gross) + 18, '?', { 'text-anchor': 'middle', class: 'prop-axis is-strong' });
      } else {
        svgEl(doc, 'rect', { class: 'prop-bar__net', x, y: sy(row.net), width: bar, height: Math.max(base - sy(row.net), 0), rx: 3 }, group);
        svgEl(doc, 'rect', { class: 'prop-bar__fees', x, y: sy(row.gross), width: bar, height: Math.max(sy(row.net) - sy(row.gross), 0), rx: 3 }, group);
        svgText(doc, group, x + bar / 2, base + 14, `#${row.number}`, { 'text-anchor': 'middle', class: 'prop-axis prop-axis--tiny' });
      }
      const month = new Date(`${row.date}T00:00:00Z`).toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' });
      if (month !== lastMonth) {
        svgText(doc, svg, padL + index * slot + 2, base + 34, month, { class: `prop-axis${row.expected ? '' : ' is-strong'}` });
        lastMonth = month;
      }
      if (currentFyStart && !fyMarked && row.date >= currentFyStart) {
        fyMarked = true;
        const fx = padL + index * slot;
        svgEl(doc, 'line', { x1: fx, x2: fx, y1: top - 10, y2: base, class: 'prop-fy-line' }, svg);
        svgText(doc, svg, fx + 6, top - 2, `${financialLabel(currentFyStart)} →`, { class: 'prop-axis is-strong' });
      }
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.selected = row.id;
          paintLedger();
        }
      });
    });
    paintStatement(rows.find(row => row.id === state.selected));
  }

  function financialLabel(start) {
    const year = Number(start.slice(0, 4));
    return `${year}–${String(year + 1).slice(2)}`;
  }

  function paintStatement(row) {
    const box = q('stmt');
    if (!row) {
      box.innerHTML = `<p class="prop-kicker">Statements</p><h3 class="prop-h">Record your first agent statement</h3><p class="prop-sub">Gross rent and what the agent kept. Two statements a month builds the ledger and spots any that go missing.</p><button class="btn btn--primary" type="button" data-prop-open="record" data-prop-kind="statement">Record a statement</button>`;
      return;
    }
    if (row.expected) {
      box.innerHTML = `<p class="prop-kicker">Expected statement</p><div class="prop-stmt__head"><span class="prop-stmt__no">${formatDisplayDate(row.date)}</span><span class="prop-pill prop-pill--stale">Not recorded</span></div>
        <p class="prop-sub">Your statements usually arrive on these days of the month. This one should be in the agent's portal.</p>
        <dl><div><dt>Expected rent</dt><dd>≈ ${money(row.gross, 2)}</dd></div><div><dt>Expected fees</dt><dd>≈ ${money(row.deductions, 2)}</dd></div></dl>
        <button class="btn btn--primary" type="button" data-prop-open="record" data-prop-kind="statement" data-prop-date="${row.date}">Record this statement</button>`;
      return;
    }
    const period = row.periodFrom && row.periodTo ? `Rent ${formatDisplayDate(row.periodFrom)} to ${formatDisplayDate(row.periodTo)}` : 'Rent statement';
    box.innerHTML = `<p class="prop-kicker">Statement ${formatDisplayDate(row.date)}</p><div class="prop-stmt__head"><span class="prop-stmt__no">#${row.number}</span><span class="prop-pill prop-pill--ok">Recorded</span></div>
      <p class="prop-sub">${period}</p>
      <dl><div><dt>Gross rent</dt><dd>${money(row.gross, 2)}</dd></div><div><dt>Agent kept</dt><dd>${money(-row.deductions, 2)}</dd></div><div><dt>Reached you</dt><dd>${money(row.net, 2)}</dd></div></dl>
      ${row.note ? `<p class="prop-stmt__note">${escapeHtml(row.note)}</p>` : ''}`;
  }

  function paintLoan() {
    const loan = state.record.loan;
    q('loan-sub').textContent = [loan.lender && `${loan.lender} home loan`, loan.reference, loan.weeklyRepayment && `${money(loan.weeklyRepayment, 2)} a week`].filter(Boolean).join(' · ') || 'Add the loan in Details';
    const position = model.loan.position;
    const cuts = model.loan.rates.filter((rate, index, list) => index > 0 && rate.rate < list[index - 1].rate).length;
    q('loan-h').textContent = position.paidOff !== null && state.record.property.settledOn
      ? `Down ${money(roundTo(position.paidOff, 100))} since ${formatDisplayDate(state.record.property.settledOn)}${cuts ? `, and ${cuts} rate cut${cuts === 1 ? '' : 's'}` : ''}`
      : 'Record loan statements to draw the balance';
    const svg = q('glide');
    svg.replaceChildren();
    const series = model.loan.series;
    const width = 640;
    const height = 270;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (series.length < 2) return;
    const padL = 54;
    const padR = 12;
    const top = 14;
    const base = 186;
    const endKey = `${Number(model.today.slice(0, 4)) + (Number(model.today.slice(5, 7)) >= 7 ? 1 : 0)}-12-31`;
    const startKey = `${series[0].date.slice(0, 4)}-01-01`;
    const t0 = toTime(startKey);
    const t1 = toTime(endKey);
    const sx = key => padL + ((toTime(key) - t0) / (t1 - t0)) * (width - padL - padR);
    const projection = [];
    const eff = position.effWeekly ?? 0;
    let balance = position.known?.balance ?? series.at(-1).balance;
    let cursor = position.known?.date ?? series.at(-1).date;
    while (cursor <= endKey) {
      projection.push({ date: cursor, balance });
      const extra = cursor >= model.today ? state.extra : 0;
      balance = Math.max(0, balance * (1 + eff) - (state.record.loan.weeklyRepayment ?? 0) - extra);
      cursor = addDays(cursor, 7);
    }
    const all = [...series.map(point => point.balance), ...projection.map(point => point.balance)];
    const span = Math.max(...all) - Math.min(...all);
    const pad = Math.max(span * 0.12, 2000);
    const lo = Math.min(...all) - pad;
    const hi = Math.max(...all) + pad;
    const sy = value => base - ((value - lo) / (hi - lo)) * (base - top);
    const tickStep = span > 60000 ? 20000 : span > 25000 ? 10000 : 5000;
    for (let value = Math.ceil(lo / tickStep) * tickStep; value <= hi; value += tickStep) {
      svgEl(doc, 'line', { x1: padL, x2: width - padR, y1: sy(value), y2: sy(value), class: 'prop-grid-line' }, svg);
      svgText(doc, svg, padL - 8, sy(value) + 4, shortMoney(value), { 'text-anchor': 'end', class: 'prop-axis' });
    }
    for (let year = Number(startKey.slice(0, 4)); year <= Number(endKey.slice(0, 4)); year++) {
      for (const month of ['01', '07']) {
        const key = `${year}-${month}-01`;
        if (key < startKey || key > endKey) continue;
        svgText(doc, svg, sx(key), base + 16, `${month === '01' ? 'Jan' : 'Jul'} ${String(year).slice(2)}`, { class: 'prop-axis' });
      }
    }
    const path = points => points.map((point, index) => `${index ? 'L' : 'M'}${sx(point.date).toFixed(1)},${sy(point.balance).toFixed(1)}`).join(' ');
    const line = path(series);
    svgEl(doc, 'path', { d: `${line} L${sx(series.at(-1).date)},${base} L${sx(series[0].date)},${base} Z`, class: 'prop-area' }, svg);
    svgEl(doc, 'path', { d: line, class: 'prop-line' }, svg);
    const upTo = projection.filter(point => point.date <= model.today);
    const after = projection.filter(point => point.date >= (upTo.at(-1)?.date ?? model.today));
    if (upTo.length > 1) svgEl(doc, 'path', { d: path(upTo), class: 'prop-line prop-line--projected' }, svg);
    if (after.length > 1) svgEl(doc, 'path', { d: path(after), class: `prop-line prop-line--future${state.extra ? ' is-extra' : ''}` }, svg);
    const last = series.at(-1);
    svgEl(doc, 'circle', { cx: sx(last.date), cy: sy(last.balance), r: 4, class: 'prop-dot' }, svg);
    svgText(doc, svg, sx(last.date) - 8, sy(last.balance) + 20, 'Last statement', { 'text-anchor': 'end', class: 'prop-svg-label', 'font-size': 11 });
    if (upTo.length && position.estimated) {
      const now = upTo.at(-1);
      const tx = sx(model.today);
      svgEl(doc, 'line', { x1: tx, x2: tx, y1: top, y2: base, class: 'prop-today-line' }, svg);
      svgEl(doc, 'circle', { cx: tx, cy: sy(now.balance), r: 4.5, class: 'prop-dot prop-dot--today' }, svg);
      svgText(doc, svg, tx - 6, top + 10, 'Today', { 'text-anchor': 'end', class: 'prop-axis is-sea' });
      svgText(doc, svg, tx - 6, sy(now.balance) + 18, `${money(position.today)} est.`, { 'text-anchor': 'end', class: 'prop-svg-label', 'font-size': 11 });
    }
    const rates = model.loan.rates.length ? model.loan.rates : state.record.loan.rate ? [{ date: startKey, rate: state.record.loan.rate }] : [];
    const stripTop = 214;
    svgText(doc, svg, padL - 8, stripTop + 17, 'Rate', { 'text-anchor': 'end', class: 'prop-axis is-strong' });
    rates.forEach((rate, index) => {
      const x = Math.max(sx(rate.date < startKey ? startKey : rate.date), padL);
      const xe = index < rates.length - 1 ? sx(rates[index + 1].date) : width - padR;
      const shade = 0.95 - (index / Math.max(rates.length - 1, 1)) * 0.75;
      svgEl(doc, 'rect', { x, y: stripTop, width: Math.max(xe - x - 2, 1), height: 26, rx: 4, class: 'prop-rate', 'fill-opacity': shade.toFixed(2) }, svg);
      if (xe - x > 40) svgText(doc, svg, x + 6, stripTop + 17, `${rate.rate.toFixed(2)}%`, { class: `prop-rate__label${shade > 0.5 ? ' is-light' : ''}` });
    });
  }

  function paintWhatIf() {
    const rentNow = currentRent(state.record, model.today) ?? 0;
    const rentInput = q('rent');
    if (rentNow > 0) {
      const min = Math.max(0, roundTo(rentNow - 50, 5));
      const max = roundTo(rentNow + 100, 5);
      rentInput.min = String(min);
      rentInput.max = String(max);
      if (state.rent === null) rentInput.value = String(rentNow);
      q('rent-min').textContent = money(min);
      q('rent-max').textContent = money(max);
      fillTrack(rentInput);
    }
    rentInput.disabled = rentNow <= 0;
    const tenancy = model.summary.tenancy;
    const nextReview = model.agenda.find(item => /tenancy/.test(item.title));
    q('rent-note').textContent = nextReview ? `Review ${formatDisplayDate(nextReview.date)}` : tenancy ? '' : 'Add the rent in Details';
    const rent = state.rent ?? rentNow;
    q('rent-out').textContent = `${money(rent)}/wk`;
    q('extra-out').textContent = `${money(state.extra)}/wk`;
    q('extra-note').textContent = state.record.loan.weeklyRepayment ? `On top of ${money(state.record.loan.weeklyRepayment, 2)}/wk` : '';
    fillTrack(q('extra'));
    const plan = model.loan.plan;
    if (plan && Number.isFinite(plan.weeks)) {
      const end = new Date(toTime(model.today) + plan.weeks * 7 * 86_400_000);
      const part = end.getUTCMonth() < 4 ? 'early' : end.getUTCMonth() < 8 ? 'mid' : 'late';
      q('r-payoff').textContent = `${part} ${end.getUTCFullYear()}`;
    } else {
      q('r-payoff').textContent = '—';
    }
    q('r-saved').textContent = money(roundTo(model.loan.interestSaved, 100));
    const period = periodOf();
    q('r-topup').textContent = `${money(Math.max(model.flow.pocket, 0) * period.mul)}${period.suffix}`;
    const base = buildPropertyModel(state.record, { today: model.today, extra: state.extra }).flow;
    const delta = (model.flow.pocket - base.pocket) * period.mul;
    const deltaEl = q('r-delta');
    deltaEl.textContent = Math.abs(delta) < 0.5 ? 'no change' : delta < 0 ? `${money(-delta)} less` : `${money(delta)} more`;
    deltaEl.className = delta < -0.5 ? 'is-good' : delta > 0.5 ? 'is-bad' : '';
  }

  function fillTrack(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 1;
    input.style?.setProperty?.('--prop-fill', `${((Number(input.value) - min) / Math.max(max - min, 1)) * 100}%`);
  }

  function paintTimeMachine() {
    if (!model) return;
    const record = state.record;
    const valuation = currentValuation(record, model.today);
    const growth = state.tmGrowth ?? record.assumptions.priceGrowth;
    const rentGrowth = state.tmRentGrowth ?? record.assumptions.rentGrowth;
    const future = simulateFuture(record, model.today, { extra: state.extra, rent: state.rent ?? undefined, priceGrowth: growth, rentGrowth });
    const startYear = future.startYear;
    const endYear = Math.ceil(startYear) + 30;
    const series = future.series.filter(point => point.year <= endYear);
    if (state.tmYear === null) state.tmYear = Math.round(startYear) + 10;
    state.tmYear = Math.min(endYear, Math.max(startYear, state.tmYear));
    const at = pointAtYear(series, state.tmYear);
    const name = record.property.name || 'the property';
    q('tm-title').innerHTML = `Drag through the years to see<br>what ${escapeHtml(name)} becomes`;

    const svg = q('tm-svg');
    svg.replaceChildren();
    const width = Math.round(Math.min(900, Math.max(320, svg.parentNode?.clientWidth || 900)));
    const narrow = width < 600;
    const height = narrow ? 240 : 260;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const wedge = buildEquityWedge(series, { width, height, padLeft: narrow ? 48 : 58 });
    svg._wedge = wedge;
    if (wedge && at && (record.loan.weeklyRepayment || at.loan === 0)) {
      for (const tick of wedge.yTicks) {
        svgEl(doc, 'line', { x1: wedge.padLeft, x2: width - wedge.padRight, y1: tick.y, y2: tick.y, class: 'prop-tm-grid' }, svg);
        svgText(doc, svg, wedge.padLeft - 10, tick.y + 4, tick.value === 0 ? '$0' : shortMoney(tick.value), { 'text-anchor': 'end', class: 'prop-tm-axis' });
      }
      for (const tick of wedge.xTicks) {
        if (narrow && tick.year % 10) continue;
        svgText(doc, svg, tick.x, wedge.base + 22, String(tick.year), { 'text-anchor': 'middle', class: 'prop-tm-axis' });
      }
      const defs = svgEl(doc, 'defs', {}, svg);
      const clip = svgEl(doc, 'clipPath', { id: 'prop-tm-past' }, defs);
      svgEl(doc, 'rect', { x: 0, y: 0, width: wedge.sx(at.year), height }, clip);
      svgEl(doc, 'path', { d: wedge.wedgePath, class: 'prop-tm-wedge' }, svg);
      svgEl(doc, 'path', { d: wedge.wedgePath, class: 'prop-tm-wedge is-lit', 'clip-path': 'url(#prop-tm-past)' }, svg);
      svgEl(doc, 'path', { d: wedge.loanPath, class: 'prop-tm-loan' }, svg);
      svgEl(doc, 'path', { d: wedge.worthPath, class: 'prop-tm-worth' }, svg);
      for (const milestone of future.milestones) {
        if (!milestone.year || milestone.year > endYear) continue;
        const x = wedge.sx(milestone.year);
        const passed = milestone.year <= at.year;
        svgEl(doc, 'line', { x1: x, x2: x, y1: wedge.top, y2: wedge.base, class: `prop-tm-pin${passed ? ' is-passed' : ''}` }, svg);
        svgEl(doc, 'circle', { cx: x, cy: wedge.base, r: 5, class: `prop-tm-pin-dot${passed ? ' is-passed' : ''}` }, svg);
        if (milestone.key === 'million') {
          const point = pointAtYear(series, milestone.year);
          svgText(doc, svg, x + 8, wedge.sy(point.worth) - 10, '$1M equity', { class: 'prop-tm-million' });
        }
      }
      const cx = wedge.sx(at.year);
      svgEl(doc, 'line', { x1: cx, x2: cx, y1: wedge.top - 6, y2: wedge.base, class: 'prop-tm-cursor' }, svg);
      svgEl(doc, 'line', { x1: cx, x2: cx, y1: wedge.sy(at.worth), y2: wedge.sy(at.loan), class: 'prop-tm-gap' }, svg);
      svgEl(doc, 'circle', { cx, cy: wedge.sy(at.worth), r: 5.5, class: 'prop-tm-dot' }, svg);
      svgEl(doc, 'circle', { cx, cy: wedge.sy(at.loan), r: 5.5, class: 'prop-tm-dot is-loan' }, svg);
      const flip = cx > width * 0.75;
      svgText(doc, svg, cx + (flip ? -10 : 10), (wedge.sy(at.worth) + wedge.sy(at.loan)) / 2 + 4, `${shortMoney(at.equity)} yours`, { 'text-anchor': flip ? 'end' : 'start', class: 'prop-tm-yours' });
    }

    const year = Math.floor(at.year + 0.03);
    const yearsOut = Math.round(at.year - startYear);
    q('tm-year').innerHTML = `${year}<small>${yearsOut <= 0 ? 'Today' : `${yearsOut} year${yearsOut === 1 ? '' : 's'} from now`}</small>`;
    q('tm-worth').textContent = money(roundTo(at.worth, 1000));
    q('tm-loan').textContent = at.loan <= 0 ? 'Nothing' : money(roundTo(at.loan, 1000));
    q('tm-equity').textContent = money(roundTo(at.equity, 1000));
    const cash = at.cash * periodOf().mul;
    const cashEl = q('tm-cash');
    cashEl.textContent = `${cash >= 0 ? '+' : ''}${money(Math.round(cash))}${periodOf().suffix}`;
    cashEl.className = cash >= 0 ? 'is-pos' : '';
    const next = future.milestones.find(milestone => milestone.year && milestone.year > at.year);
    const cashLine = at.cash >= 0 ? `The rent <b>pays you ${money(Math.round(at.cash))} a week</b>` : `You top it up by <b>${money(Math.round(-at.cash))} a week</b>`;
    q('tm-story').innerHTML = yearsOut <= 0
      ? `Today the house is worth about <b>${shortMoney(at.worth)}</b> and you owe <b>${shortMoney(at.loan)}</b>. Drag forward to watch the gap between them grow.`
      : `In ${year} the house is worth about <b>${shortMoney(at.worth)}</b>, you owe <b>${at.loan <= 0 ? 'nothing' : shortMoney(at.loan)}</b>, and <b>${shortMoney(at.equity)}</b> of it is yours. ${cashLine}.${next ? ` Next: ${next.title.toLowerCase()} in ${Math.floor(next.year)}.` : ''}`;
    q('tm-moments').innerHTML = future.milestones.map(milestone => {
      const passed = milestone.year && milestone.year <= at.year;
      const label = milestone.year ? Math.floor(milestone.year) : `After ${endYear}`;
      return `<button type="button" class="prop-moment${passed ? ' is-passed' : ''}" ${milestone.year ? `data-prop-moment="${milestone.year.toFixed(2)}"` : 'disabled'}><b>${label}</b><span>${escapeHtml(milestone.title)}</span><em>${escapeHtml(milestone.detail)}</em></button>`;
    }).join('');
    const range = q('tm-range');
    range.min = startYear.toFixed(2);
    range.max = String(endYear);
    range.value = String(state.tmYear);
    range.style?.setProperty?.('--prop-fill', `${((state.tmYear - startYear) / (endYear - startYear)) * 100}%`);

    const valueInput = q('tm-value');
    if (doc.activeElement !== valueInput && q('tm-value-save').hidden) valueInput.value = money(valuation.amount);
    q('tm-value-pill').innerHTML = valuation.example
      ? '<span class="prop-pill prop-pill--est">example</span>'
      : `<span class="prop-pill prop-pill--ok">${valuation.fromPurchase ? 'purchase price' : formatDisplayDate(valuation.date)}</span>`;
    const growthInput = q('tm-growth');
    if (doc.activeElement !== growthInput) growthInput.value = String(growth * 100);
    q('tm-growth-out').textContent = `${(growth * 100).toFixed(1)}% a year`;
    const rentGrowthInput = q('tm-rentg');
    if (doc.activeElement !== rentGrowthInput) rentGrowthInput.value = String(rentGrowth * 100);
    q('tm-rentg-out').textContent = `${(rentGrowth * 100).toFixed(1)}% a year`;
    q('tm-keep').hidden = state.tmGrowth === null && state.tmRentGrowth === null;
    const repayment = record.loan.weeklyRepayment;
    q('tm-fine').textContent = `Starts from today's loan${model.loan.position.estimated ? ' (est.)' : ''}${repayment ? `, your ${money(repayment, 2)} weekly repayment${state.extra ? ` plus ${money(state.extra)} extra` : ''}` : ''}, and rent of ${money(state.rent ?? currentRent(record, model.today) ?? 0)} a week. Running costs rise ${(record.assumptions.costGrowth * 100).toFixed(1)}% a year. ${valuation.example ? 'Type what the house is worth to replace the example. ' : ''}A forecast, not advice.`;
  }

  function paintAgenda() {
    const items = model.agenda;
    q('agenda-h').textContent = items.length ? `${items.length} date${items.length === 1 ? '' : 's'} to know` : 'Nothing coming up';
    q('agenda').innerHTML = items.map(item => {
      const date = new Date(`${item.date}T00:00:00Z`);
      const month = date.toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' });
      return `<li class="${item.hot ? 'is-hot' : ''}"><div class="prop-agenda__date" title="${formatDisplayDate(item.date)}"><b>${date.getUTCDate()}</b><span>${month}</span></div><div><p class="prop-agenda__t">${escapeHtml(item.title)}</p><p class="prop-agenda__s">${escapeHtml(item.detail)}${item.estimate ? ' <span class="prop-pill prop-pill--est">est.</span>' : ''}</p></div></li>`;
    }).join('');
  }

  function paintPeople() {
    const record = state.record;
    const initials = value => value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
    const people = [
      ...record.property.owners.map(owner => ({ name: owner, role: 'Owner', tone: 'blue' })),
      record.tenancy.tenant && { name: record.tenancy.tenant, role: `Tenant${model.summary.tenancy ? ` since ${formatDisplayDate(model.summary.tenancy)}` : ''}${currentRent(record, model.today) ? ` · ${money(currentRent(record, model.today))}/wk` : ''}`, tone: 'gold' },
      record.tenancy.agent && { name: record.tenancy.agent, role: `Property manager${record.tenancy.agentRate ? ` · ${(record.tenancy.agentRate * 100).toFixed(1)}% incl. GST` : ''}`, tone: 'peach' }
    ].filter(Boolean);
    q('people').innerHTML = people.length
      ? people.map(person => `<div class="prop-person"><span class="prop-avatar prop-avatar--${person.tone}">${escapeHtml(initials(person.name))}</span><div><b>${escapeHtml(person.name)}</b><span>${escapeHtml(person.role)}</span></div></div>`).join('')
      : '<p class="prop-sub">Add owners, the tenant and the agent in Details.</p>';
  }

  function paintRecent() {
    if (!model) return;
    const recent = model.recent;
    q('recent-h').textContent = `${state.record.entries.length} record${state.record.entries.length === 1 ? '' : 's'} on file`;
    q('recent').innerHTML = recent.length
      ? recent.map(entry => {
        const { title, amount } = describeEntry(entry);
        const confirming = state.removing === entry.id;
        return `<li><div><b>${escapeHtml(title)}</b><span>${KIND_LABELS[entry.kind]} · ${formatDisplayDate(entry.date)}</span></div><span class="prop-recent__amt">${amount}</span><button type="button" class="prop-remove${confirming ? ' is-confirm' : ''}" data-prop-remove="${escapeHtml(entry.id)}" aria-label="${confirming ? 'Confirm remove' : 'Remove'} ${escapeHtml(title)}">${confirming ? 'Remove?' : '×'}</button></li>`;
      }).join('')
      : '<li class="prop-recent__empty">Nothing recorded yet. Tap Record to add the first one.</li>';
  }

  return {
    show() {
      build();
      if (!state.record && state.status !== 'loading') void load();
      else update();
    },
    reload: load,
    getState: () => state
  };
}

export const __test = { SHELL, KIND_FIELDS, SETTINGS_FIELDS, yearFraction };
