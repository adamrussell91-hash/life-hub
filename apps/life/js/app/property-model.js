/**
 * Property engine. Pure: turns the stored property record into every figure the
 * Property page shows (weekly money flow, tax year, rent ledger, loan, time machine).
 *
 * Storage: one JSON record per property in the data repo (PROPERTY_DATA_PATH).
 * Dates are `YYYY-MM-DD` strings. Money is AUD, whole property (no ownership split
 * in the UI; the tax split happens at lodging time).
 */

export const PROPERTY_DATA_PATH = 'data/property/17-mawson.json';
export const PROPERTY_SCHEMA_VERSION = 1;

export const ENTRY_KINDS = ['statement', 'interest', 'balance', 'expense', 'valuation', 'rent', 'rate'];

export const EXPENSE_CATEGORIES = {
  repairs: 'Repairs and maintenance',
  insurance: 'Insurance',
  council: 'Council rates',
  water: 'Water rates',
  strata: 'Strata',
  agent: 'Agent and letting',
  depreciation: 'Depreciation',
  other: 'Other'
};

/** Recurring yearly costs used for the weekly flow and forecasts. */
export const ANNUAL_COST_KEYS = ['council', 'water', 'insurance', 'strata', 'depreciation'];

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const WEEKS_PER_YEAR = 52;
const MONTH_DAYS = 365.25 / 12;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXAMPLE_VALUE = 800_000;

// ── Small helpers ───────────────────────────────────────────────────────────

const isObj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const round2 = value => Math.round(value * 100) / 100;
const text = (value, max = 280) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function toTime(dateKey) {
  return Date.parse(`${dateKey}T00:00:00Z`);
}

export function toDateKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(dateKey, days) {
  return toDateKey(toTime(dateKey) + days * DAY_MS);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((toTime(toKey) - toTime(fromKey)) / DAY_MS);
}

/** Sydney calendar day for an instant. */
export function sydneyDateKey(instant = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(instant)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Fractional calendar year, e.g. 2026-07-02 → ~2026.5. */
export function yearFraction(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (toTime(dateKey) - start) / (end - start);
}

/** Australian financial year containing a date: { label: '2025-26', start, end }. */
export function financialYear(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return {
    label: `${startYear}-${String(startYear + 1).slice(2)}`,
    start: `${startYear}-07-01`,
    end: `${startYear + 1}-06-30`,
    lodgeBy: `${startYear + 1}-10-31`
  };
}

function financialYearFromLabel(label) {
  const match = /^(\d{4})-(\d{2})$/.exec(label ?? '');
  return match ? financialYear(`${match[1]}-07-01`) : null;
}

function byDate(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

function inRange(dateKey, start, end) {
  return dateKey >= start && dateKey <= end;
}

// ── Record shape ────────────────────────────────────────────────────────────

export function emptyPropertyRecord() {
  return {
    version: PROPERTY_SCHEMA_VERSION,
    property: { name: 'Investment property', address: '', owners: [], settledOn: null, purchasePrice: null },
    tenancy: { tenant: '', startedOn: null, weeklyRent: null, agent: '', agentRate: null },
    loan: { lender: '', reference: '', original: null, weeklyRepayment: null, rate: null },
    annualCosts: {},
    assumptions: { priceGrowth: 0.05, rentGrowth: 0.03, costGrowth: 0.03, taxRate: 0.32, depositTarget: 160_000 },
    lodgedYears: [],
    entries: []
  };
}

function parseAnnualCost(raw) {
  if (!isObj(raw)) return null;
  const amount = num(raw.amount);
  if (amount === null || amount < 0) return null;
  return { amount: round2(amount), estimate: raw.estimate === true };
}

function clampRate(value, min, max, fallback) {
  const n = num(value);
  return n === null ? fallback : Math.min(max, Math.max(min, n));
}

/** Parse a stored record. Unknown fields are dropped; invalid entries are skipped. Returns null when unusable. */
export function parsePropertyRecord(raw) {
  if (!isObj(raw)) return null;
  const base = emptyPropertyRecord();
  const property = isObj(raw.property) ? raw.property : {};
  const tenancy = isObj(raw.tenancy) ? raw.tenancy : {};
  const loan = isObj(raw.loan) ? raw.loan : {};
  const assumptions = isObj(raw.assumptions) ? raw.assumptions : {};
  const annualCosts = {};
  for (const key of ANNUAL_COST_KEYS) {
    const cost = parseAnnualCost(raw.annualCosts?.[key]);
    if (cost) annualCosts[key] = cost;
  }
  const entries = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.entries) ? raw.entries : []) {
    const result = normalizeEntry(item);
    if (!result.entry || typeof item?.id !== 'string' || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    entries.push({ id: item.id, ...result.entry, ...(isDateKey(item.recordedOn) ? { recordedOn: item.recordedOn } : {}) });
  }
  entries.sort(byDate);
  return {
    version: PROPERTY_SCHEMA_VERSION,
    property: {
      name: text(property.name, 80) || base.property.name,
      address: text(property.address, 160),
      owners: Array.isArray(property.owners) ? property.owners.map(owner => text(owner, 80)).filter(Boolean).slice(0, 6) : [],
      settledOn: isDateKey(property.settledOn) ? property.settledOn : null,
      purchasePrice: num(property.purchasePrice)
    },
    tenancy: {
      tenant: text(tenancy.tenant, 80),
      startedOn: isDateKey(tenancy.startedOn) ? tenancy.startedOn : null,
      weeklyRent: num(tenancy.weeklyRent),
      agent: text(tenancy.agent, 80),
      agentRate: num(tenancy.agentRate) === null ? null : clampRate(tenancy.agentRate, 0, 0.3, null)
    },
    loan: {
      lender: text(loan.lender, 80),
      reference: text(loan.reference, 80),
      original: num(loan.original),
      weeklyRepayment: num(loan.weeklyRepayment),
      rate: num(loan.rate)
    },
    annualCosts,
    assumptions: {
      priceGrowth: clampRate(assumptions.priceGrowth, -0.05, 0.15, base.assumptions.priceGrowth),
      rentGrowth: clampRate(assumptions.rentGrowth, -0.05, 0.15, base.assumptions.rentGrowth),
      costGrowth: clampRate(assumptions.costGrowth, 0, 0.15, base.assumptions.costGrowth),
      taxRate: clampRate(assumptions.taxRate, 0, 0.5, base.assumptions.taxRate),
      depositTarget: clampRate(assumptions.depositTarget, 0, 5_000_000, base.assumptions.depositTarget)
    },
    lodgedYears: Array.isArray(raw.lodgedYears) ? raw.lodgedYears.filter(label => financialYearFromLabel(label)).slice(0, 50) : [],
    entries
  };
}

// ── Entries ─────────────────────────────────────────────────────────────────

function positive(value) {
  const n = num(typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : value);
  return n !== null && n >= 0 ? round2(n) : null;
}

/** Validate one entry (without id). Returns { entry } or { error } with a plain-language message. */
export function normalizeEntry(input) {
  if (!isObj(input)) return { error: 'Provide an entry.' };
  const kind = input.kind;
  if (!ENTRY_KINDS.includes(kind)) return { error: 'Pick what kind of record this is.' };
  if (!isDateKey(input.date)) return { error: 'Add the date it happened.' };
  const note = text(input.note);
  const base = { kind, date: input.date, ...(note ? { note } : {}) };

  if (kind === 'statement') {
    const gross = positive(input.gross);
    const deductions = positive(input.deductions ?? 0);
    if (gross === null) return { error: 'Add the gross rent on the statement.' };
    if (deductions === null || deductions > gross + 10_000) return { error: 'Check the amount the agent kept.' };
    const entry = { ...base, gross, deductions };
    if (isDateKey(input.periodFrom)) entry.periodFrom = input.periodFrom;
    if (isDateKey(input.periodTo)) entry.periodTo = input.periodTo;
    const number = num(Number(input.number));
    if (number !== null && number > 0) entry.number = Math.round(number);
    return { entry };
  }
  if (kind === 'interest') {
    const amount = positive(input.amount);
    if (amount === null) return { error: 'Add the interest charged.' };
    const entry = { ...base, amount };
    const balance = positive(input.balanceAfter);
    if (balance !== null) entry.balanceAfter = balance;
    const portion = num(input.deductiblePortion);
    if (portion !== null) entry.deductiblePortion = Math.min(1, Math.max(0, portion));
    return { entry };
  }
  if (kind === 'balance') {
    const balance = positive(input.balance ?? input.amount);
    if (balance === null) return { error: 'Add the loan balance on the statement.' };
    return { entry: { ...base, balance } };
  }
  if (kind === 'expense') {
    const amount = positive(input.amount);
    if (amount === null || amount === 0) return { error: 'Add how much it cost.' };
    const category = Object.hasOwn(EXPENSE_CATEGORIES, input.category) ? input.category : 'other';
    const entry = { ...base, amount, category, deductible: input.deductible !== false };
    if (input.renews === 'yearly') entry.renews = 'yearly';
    // Already deducted on an agent statement: kept for history, never counted twice.
    if (input.inStatement === true) entry.inStatement = true;
    return { entry };
  }
  if (kind === 'valuation') {
    const amount = positive(input.amount);
    if (amount === null || amount < 10_000) return { error: 'Add what the property is worth.' };
    return { entry: { ...base, amount } };
  }
  if (kind === 'rent') {
    const weeklyRent = positive(input.weeklyRent ?? input.amount);
    if (weeklyRent === null || weeklyRent === 0) return { error: 'Add the new weekly rent.' };
    return { entry: { ...base, weeklyRent } };
  }
  const rate = num(Number(input.rate ?? input.amount));
  if (rate === null || rate <= 0 || rate > 25) return { error: 'Add the new interest rate as a percentage, like 5.44.' };
  return { entry: { ...base, rate: round2(rate) } };
}

export function addEntry(record, input, { id, today }) {
  const result = normalizeEntry(input);
  if (result.error) return { error: result.error };
  const entry = { id, ...result.entry, recordedOn: today };
  return { record: { ...record, entries: [...record.entries, entry].sort(byDate) }, entry };
}

export function removeEntry(record, id) {
  if (!record.entries.some(entry => entry.id === id)) return { error: 'That record is already gone.' };
  return { record: { ...record, entries: record.entries.filter(entry => entry.id !== id) } };
}

/** Apply a settings patch (property, tenancy, loan, annualCosts, assumptions). Returns { record } or { error }. */
export function updateSettings(record, patch) {
  if (!isObj(patch)) return { error: 'Provide the details to change.' };
  const next = structuredClone(record);
  const sections = ['property', 'tenancy', 'loan', 'assumptions'];
  for (const section of sections) {
    if (!isObj(patch[section])) continue;
    for (const [key, value] of Object.entries(patch[section])) {
      if (!Object.hasOwn(next[section], key)) continue;
      next[section][key] = value === '' ? null : value;
    }
  }
  if (isObj(patch.annualCosts)) {
    for (const key of ANNUAL_COST_KEYS) {
      if (!Object.hasOwn(patch.annualCosts, key)) continue;
      const value = patch.annualCosts[key];
      if (value === null || value === '') delete next.annualCosts[key];
      else next.annualCosts[key] = value;
    }
  }
  const parsed = parsePropertyRecord(next);
  if (!parsed) return { error: 'Those details could not be saved.' };
  return { record: parsed };
}

export function markLodged(record, label) {
  if (!financialYearFromLabel(label)) return { error: 'Pick a tax year.' };
  if (record.lodgedYears.includes(label)) return { record };
  return { record: { ...record, lodgedYears: [...record.lodgedYears, label].sort() } };
}

// ── Derived figures ─────────────────────────────────────────────────────────

function ofKind(record, kind) {
  return record.entries.filter(entry => entry.kind === kind);
}

function latest(list) {
  return list.length ? list[list.length - 1] : null;
}

export function tenancyStart(record) {
  if (record.tenancy.startedOn) return record.tenancy.startedOn;
  const first = ofKind(record, 'statement')[0];
  return first ? first.periodFrom ?? first.date : null;
}

export function currentRent(record, today) {
  const change = latest(ofKind(record, 'rent').filter(entry => entry.date <= today));
  return change?.weeklyRent ?? record.tenancy.weeklyRent ?? null;
}

export function currentRate(record, today) {
  const change = latest(ofKind(record, 'rate').filter(entry => entry.date <= today));
  return change?.rate ?? record.loan.rate ?? null;
}

export function rateHistory(record) {
  return ofKind(record, 'rate').map(entry => ({ date: entry.date, rate: entry.rate }));
}

function annual(record, key, today) {
  const recorded = ofKind(record, 'expense').filter(entry => entry.category === key && daysBetween(entry.date, today) <= 365 && entry.date <= today);
  const setting = record.annualCosts[key];
  if (setting) return { amount: setting.amount, estimate: setting.estimate, source: 'setting' };
  if (recorded.length) return { amount: round2(recorded.reduce((sum, entry) => sum + entry.amount, 0)), estimate: true, source: 'recent' };
  return { amount: null, estimate: false, source: 'missing' };
}

/** Average monthly interest across the last three charges, and the balance it was charged on. */
function interestProfile(record) {
  const charges = ofKind(record, 'interest').filter(entry => entry.amount > 0);
  const recent = charges.slice(-3);
  const monthly = recent.length ? recent.reduce((sum, entry) => sum + entry.amount, 0) / recent.length : null;
  const anchor = latest(balancePoints(record));
  return { monthly, anchor, count: charges.length };
}

/** Effective weekly interest per dollar owed, from recent charges (captures the offset accounts). */
function effectiveWeeklyRate(record, today) {
  const { monthly, anchor } = interestProfile(record);
  if (monthly !== null && anchor?.balance) return (monthly * 12) / WEEKS_PER_YEAR / anchor.balance;
  const rate = currentRate(record, today);
  return rate ? rate / 100 / WEEKS_PER_YEAR : null;
}

/** Last known loan balance and a projection to today. */
export function loanPosition(record, today) {
  const { anchor } = interestProfile(record);
  const original = record.loan.original;
  const startDate = record.property.settledOn;
  const known = anchor ? { date: anchor.date, balance: anchor.balance } : original && startDate ? { date: startDate, balance: original } : null;
  const repayment = record.loan.weeklyRepayment;
  const eff = effectiveWeeklyRate(record, today);
  if (!known) return { known: null, today: null, estimated: false, paidOff: null, effWeekly: eff };
  let balance = known.balance;
  const weeks = Math.max(0, Math.floor(daysBetween(known.date, today) / 7));
  if (repayment && eff !== null) {
    for (let i = 0; i < weeks && balance > 0; i++) balance = balance * (1 + eff) - repayment;
  }
  balance = Math.max(0, balance);
  return {
    known,
    today: round2(balance),
    estimated: weeks >= 5,
    paidOff: original ? round2(original - balance) : null,
    effWeekly: eff
  };
}

/** Recorded balances: after each interest charge, plus balance-only statements. */
function balancePoints(record) {
  const points = [];
  for (const entry of record.entries) {
    if (entry.kind === 'interest' && num(entry.balanceAfter) !== null) points.push({ date: entry.date, balance: entry.balanceAfter });
    if (entry.kind === 'balance') points.push({ date: entry.date, balance: entry.balance });
  }
  return points.sort(byDate);
}

export function loanSeries(record) {
  const points = balancePoints(record);
  if (record.property.settledOn && record.loan.original && !points.some(point => point.date <= record.property.settledOn)) {
    points.unshift({ date: record.property.settledOn, balance: record.loan.original });
  }
  return points;
}

/** Weeks and interest to clear the loan from a balance, with optional extra weekly repayment. */
export function payoff({ balance, weeklyRepayment, effWeekly, extra = 0 }) {
  if (!balance || !weeklyRepayment || effWeekly === null || effWeekly === undefined) return null;
  const pay = weeklyRepayment + extra;
  if (balance * effWeekly >= pay) return { weeks: Infinity, interest: Infinity };
  let left = balance;
  let weeks = 0;
  let interest = 0;
  while (left > 0 && weeks < 5200) {
    const charge = left * effWeekly;
    interest += charge;
    left = left + charge - pay;
    weeks++;
  }
  return { weeks, interest: round2(interest) };
}

/** The weekly picture: where the rent and the top-up go. Whole property. */
export function weeklyFlow(record, today, { extra = 0, rent: rentOverride } = {}) {
  const rent = rentOverride ?? currentRent(record, today) ?? 0;
  const agentRate = record.tenancy.agentRate ?? 0;
  const agent = rent * agentRate;
  const council = annual(record, 'council', today);
  const water = annual(record, 'water', today);
  const insurance = annual(record, 'insurance', today);
  const strata = annual(record, 'strata', today);
  const rates = ((council.amount ?? 0) + (water.amount ?? 0) + (strata.amount ?? 0)) / WEEKS_PER_YEAR;
  const insuranceWeekly = (insurance.amount ?? 0) / WEEKS_PER_YEAR;
  const position = loanPosition(record, today);
  const { monthly } = interestProfile(record);
  const repayment = record.loan.weeklyRepayment ?? 0;
  const interest = monthly !== null
    ? (monthly * 12) / WEEKS_PER_YEAR
    : position.today && position.effWeekly ? position.today * position.effWeekly : 0;
  const principal = Math.max(0, repayment - interest) + extra;
  const outflow = interest + principal + agent + rates + insuranceWeekly;
  const pocket = outflow - rent;
  const holding = interest + agent + rates + insuranceWeekly - rent;
  const taxRate = record.assumptions.taxRate;
  const taxBack = Math.max(holding, 0) * taxRate;
  return {
    rent,
    agent,
    rates,
    insurance: insuranceWeekly,
    interest,
    principal,
    outflow,
    pocket,
    holding,
    taxBack,
    real: holding - taxBack,
    taxRate,
    gaps: {
      interestEstimated: monthly === null,
      councilEstimated: council.estimate || council.amount === null,
      waterEstimated: water.estimate || water.amount === null,
      insuranceMissing: insurance.amount === null
    }
  };
}

// ── Tax year ────────────────────────────────────────────────────────────────

/** Which tax year the page should focus on: last year until it's lodged, then this year. */
export function focusFinancialYear(record, today) {
  const current = financialYear(today);
  const previous = financialYear(addDays(current.start, -1));
  const tenancy = tenancyStart(record);
  const previousMatters = tenancy && tenancy <= previous.end;
  if (previousMatters && !record.lodgedYears.includes(previous.label)) return { ...previous, inProgress: false };
  return { ...current, inProgress: true };
}

function interestDeductiblePortion(entry, tenancy) {
  if (num(entry.deductiblePortion) !== null) return entry.deductiblePortion;
  if (!tenancy || entry.date < tenancy) return 0;
  const days = daysBetween(tenancy, entry.date);
  return days >= MONTH_DAYS ? 1 : Math.max(0, days / MONTH_DAYS);
}

/** Calendar months (YYYY-MM) from the later of FY start / tenancy start up to the earlier of FY end / today. */
function monthsCovered(start, end) {
  const months = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endKey = end.slice(0, 7);
  for (let guard = 0; guard < 24; guard++) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > endKey) break;
    months.push(key);
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return months;
}

export function taxYearSummary(record, today, fy = focusFinancialYear(record, today)) {
  const tenancy = tenancyStart(record);
  const statements = ofKind(record, 'statement').filter(entry => inRange(entry.date, fy.start, fy.end));
  const income = statements.reduce((sum, entry) => sum + entry.gross, 0);
  const agentCosts = statements.reduce((sum, entry) => sum + entry.deductions, 0);

  const charges = ofKind(record, 'interest').filter(entry => entry.amount > 0 && inRange(entry.date, fy.start, fy.end));
  const interestRecorded = charges.reduce((sum, entry) => sum + entry.amount * interestDeductiblePortion(entry, tenancy), 0);
  const periodStart = tenancy && tenancy > fy.start ? tenancy : fy.start;
  const periodEnd = today < fy.end ? today : fy.end;
  const rentedMonths = tenancy && periodStart <= periodEnd ? monthsCovered(periodStart, periodEnd) : [];
  const chargedMonths = new Set(charges.map(entry => entry.date.slice(0, 7)));
  const missingMonths = rentedMonths.filter(month => !chargedMonths.has(month));
  const { monthly } = interestProfile(record);
  const firstMonthShare = tenancy && missingMonths[0] === tenancy.slice(0, 7)
    ? Math.max(0, 1 - (Number(tenancy.slice(8, 10)) - 1) / MONTH_DAYS)
    : 1;
  const interestEstimate = monthly !== null && missingMonths.length
    ? round2(monthly * (missingMonths.length - 1 + firstMonthShare))
    : 0;

  const expenses = ofKind(record, 'expense').filter(entry => inRange(entry.date, fy.start, fy.end) && entry.deductible && !entry.inStatement);
  const byCategory = {};
  for (const entry of expenses) byCategory[entry.category] = (byCategory[entry.category] ?? 0) + entry.amount;
  const rentedDays = tenancy && periodStart <= periodEnd ? daysBetween(periodStart, periodEnd) + 1 : 0;
  const share = rentedDays / 365;
  const estimateFor = key => {
    if (byCategory[key]) return { amount: round2(byCategory[key]), estimate: false };
    const setting = record.annualCosts[key];
    return setting ? { amount: round2(setting.amount * share), estimate: true } : { amount: null, estimate: false };
  };
  const council = estimateFor('council');
  const insurance = estimateFor('insurance');
  const depreciation = estimateFor('depreciation');
  const otherExpenses = Object.entries(byCategory)
    .filter(([key]) => !['council', 'insurance', 'depreciation'].includes(key))
    .reduce((sum, [, amount]) => sum + amount, 0);

  const recordedDeductions = agentCosts + interestRecorded + otherExpenses
    + (byCategory.council ?? 0) + (byCategory.insurance ?? 0) + (byCategory.depreciation ?? 0);
  const recordedResult = round2(income - recordedDeductions);
  const correctedResult = round2(income - agentCosts - interestRecorded - interestEstimate - otherExpenses
    - (council.amount ?? 0) - (insurance.amount ?? 0) - (depreciation.amount ?? 0));
  const taxRate = record.assumptions.taxRate;
  const stake = Math.max(0, round2((recordedResult - correctedResult) * taxRate));

  const checklist = [
    { key: 'rent', label: 'Rent and recharges', detail: statements.length ? `${statements.length} agent statements` : 'No agent statements yet', status: statements.length ? 'done' : 'missing', amount: income },
    { key: 'agent', label: 'Agent fees and costs', detail: 'Management, letting, and anything paid through the agent', status: statements.length ? 'done' : 'missing', amount: agentCosts },
    {
      key: 'interest',
      label: missingMonths.length ? `Loan interest, ${monthLabel(missingMonths[0])}–${monthLabel(missingMonths.at(-1))}` : 'Loan interest',
      detail: missingMonths.length ? `${missingMonths.length} month${missingMonths.length === 1 ? '' : 's'} of charges not recorded` : `${charges.length} charges recorded`,
      status: missingMonths.length ? 'missing' : rentedMonths.length ? 'done' : 'missing',
      amount: missingMonths.length ? interestEstimate : interestRecorded,
      estimate: missingMonths.length > 0
    },
    { key: 'council', label: 'Council rates', detail: council.estimate ? 'Estimate only. Record the rates notice to confirm.' : council.amount === null ? 'Nothing recorded' : 'From recorded bills', status: council.amount === null ? 'missing' : council.estimate ? 'partial' : 'done', amount: council.amount, estimate: council.estimate },
    { key: 'insurance', label: 'Landlord and building insurance', detail: insurance.amount === null ? 'No policy recorded' : insurance.estimate ? 'From the yearly premium' : 'From recorded payments', status: insurance.amount === null ? 'missing' : insurance.estimate ? 'partial' : 'done', amount: insurance.amount, estimate: insurance.estimate },
    { key: 'depreciation', label: 'Depreciation schedule', detail: depreciation.amount === null ? "A quantity surveyor's report usually pays for itself" : 'From the schedule', status: depreciation.amount === null ? 'missing' : depreciation.estimate ? 'partial' : 'done', amount: depreciation.amount, estimate: depreciation.estimate },
    { key: 'split', label: 'Two returns, one property', detail: 'Each owner declares their share on their own return. Life Hub splits it at lodging time.', status: 'info', amount: null }
  ];
  const scored = checklist.filter(item => item.status !== 'info');
  const ready = scored.filter(item => item.status === 'done').length;
  const daysLeft = daysBetween(today, fy.lodgeBy);

  return {
    fy,
    tenancy,
    income: round2(income),
    agentCosts: round2(agentCosts),
    interestRecorded: round2(interestRecorded),
    interestEstimate,
    missingMonths,
    otherExpenses: round2(otherExpenses),
    council,
    insurance,
    depreciation,
    recordedResult,
    correctedResult,
    stake,
    taxRate,
    checklist,
    ready,
    total: scored.length,
    daysLeft
  };
}

function monthLabel(yearMonth) {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[Number(yearMonth.slice(5, 7)) - 1];
}

// ── Rent ledger ─────────────────────────────────────────────────────────────

/** Statements plus the ones the usual cadence says should exist by today. */
export function rentLedger(record, today) {
  const statements = ofKind(record, 'statement');
  const rows = statements.map((entry, index) => ({ ...entry, number: entry.number ?? index + 1, net: round2(entry.gross - entry.deductions), expected: false }));
  const missing = expectedStatementDates(statements, today);
  const typicalGross = median(statements.slice(-6).map(entry => entry.gross));
  const typicalFees = median(statements.slice(-6).map(entry => entry.deductions));
  for (const date of missing) rows.push({ id: `expected-${date}`, kind: 'statement', date, gross: typicalGross ?? 0, deductions: typicalFees ?? 0, net: round2((typicalGross ?? 0) - (typicalFees ?? 0)), expected: true });
  return { rows, missingCount: missing.length, nextDue: nextStatementDate(statements, today) };
}

function median(values) {
  const list = values.filter(value => typeof value === 'number').sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function statementDays(statements) {
  if (statements.length < 3) return null;
  const days = [...new Set(statements.slice(-6).map(entry => Number(entry.date.slice(8, 10))))].sort((a, b) => a - b);
  return days.length <= 4 ? days : null;
}

function datesOnDays(fromKey, toKey, days) {
  const out = [];
  let year = Number(fromKey.slice(0, 4));
  let month = Number(fromKey.slice(5, 7));
  for (let guard = 0; guard < 36; guard++) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (const day of days) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
      if (key > fromKey && key <= toKey) out.push(key);
    }
    if (`${year}-${String(month).padStart(2, '0')}` >= toKey.slice(0, 7)) break;
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return out;
}

export function expectedStatementDates(statements, today) {
  const days = statementDays(statements);
  const last = latest(statements);
  if (!days || !last) return [];
  return datesOnDays(last.date, today, days);
}

export function nextStatementDate(statements, today) {
  const days = statementDays(statements);
  if (!days) return null;
  return datesOnDays(today, addDays(today, 62), days)[0] ?? null;
}

// ── Agenda ──────────────────────────────────────────────────────────────────

const NSW_RATES_INSTALMENTS = ['08-31', '11-30', '02-28', '05-31'];

export function propertyAgenda(record, today, summary, ledger) {
  const items = [];
  if (ledger.nextDue) items.push({ date: ledger.nextDue, title: 'Agent statement due', detail: ledger.missingCount ? `${ledger.missingCount + 1} would then be waiting to record` : 'Record it when it arrives' });
  if (!summary.fy.inProgress) items.push({ date: summary.fy.lodgeBy, title: 'Tax return due', detail: 'If you lodge it yourself. A tax agent gives you longer.', hot: summary.daysLeft <= 45 });
  const council = record.annualCosts.council?.amount;
  const year = Number(today.slice(0, 4));
  const instalment = [year, year + 1].flatMap(y => NSW_RATES_INSTALMENTS.map(md => `${y}-${md}`)).sort().find(key => key > today);
  if (instalment && council) items.push({ date: instalment, title: 'Council rates instalment', detail: `About $${Math.round(council / 4).toLocaleString('en-AU')}`, estimate: record.annualCosts.council.estimate });
  const tenancy = tenancyStart(record);
  if (tenancy) {
    let anniversary = `${year}${tenancy.slice(4)}`;
    if (anniversary <= today) anniversary = `${year + 1}${tenancy.slice(4)}`;
    const years = Number(anniversary.slice(0, 4)) - Number(tenancy.slice(0, 4));
    items.push({ date: anniversary, title: years === 1 ? 'One year of tenancy' : `${years} years of tenancy`, detail: 'Good time to review the rent.' });
  }
  for (const entry of ofKind(record, 'expense').filter(item => item.renews === 'yearly')) {
    let next = entry.date;
    while (next <= today) next = `${Number(next.slice(0, 4)) + 1}${next.slice(4)}`;
    items.push({ date: next, title: `${entry.note || EXPENSE_CATEGORIES[entry.category]} renews`, detail: `$${entry.amount.toLocaleString('en-AU')} last time` });
  }
  const seen = new Set();
  return items
    .filter(item => item.date > today && !seen.has(item.title + item.date) && seen.add(item.title + item.date))
    .sort(byDate)
    .slice(0, 6);
}

// ── Time machine ────────────────────────────────────────────────────────────

export function currentValuation(record, today) {
  const valuation = latest(ofKind(record, 'valuation').filter(entry => entry.date <= today));
  if (valuation) return { amount: valuation.amount, date: valuation.date, example: false };
  if (record.property.purchasePrice) return { amount: record.property.purchasePrice, date: record.property.settledOn, example: false, fromPurchase: true };
  return { amount: EXAMPLE_VALUE, date: today, example: true };
}

/**
 * Weekly simulation from today to `untilYear`. Value grows from the latest valuation
 * (compounded from its date), the loan runs down at the weekly repayment plus `extra`,
 * rent and running costs grow with their assumptions.
 */
export function simulateFuture(record, today, { extra = 0, rent, value, priceGrowth, rentGrowth, untilYear = 2056 } = {}) {
  const valuation = value !== undefined ? { amount: value, date: today } : currentValuation(record, today);
  const growth = priceGrowth ?? record.assumptions.priceGrowth;
  const rentG = rentGrowth ?? record.assumptions.rentGrowth;
  const costG = record.assumptions.costGrowth;
  const flow = weeklyFlow(record, today, { rent });
  const position = loanPosition(record, today);
  const repayment = (record.loan.weeklyRepayment ?? 0) + extra;
  const eff = position.effWeekly ?? 0;
  const runningCosts = flow.rates + flow.insurance;
  const startYear = yearFraction(today);
  const valueYears = (toTime(today) - toTime(valuation.date)) / (365.25 * DAY_MS);
  const valueToday = valuation.amount * Math.pow(1 + growth, Math.max(0, valueYears));
  const weeks = Math.max(0, Math.ceil((untilYear - startYear) * WEEKS_PER_YEAR));
  const series = [];
  let loan = position.today ?? 0;
  for (let w = 0; w <= weeks; w++) {
    const years = w / WEEKS_PER_YEAR;
    const worth = valueToday * Math.pow(1 + growth, years);
    const weeklyRent = flow.rent * Math.pow(1 + rentG, years);
    const net = weeklyRent * (1 - (record.tenancy.agentRate ?? 0)) - runningCosts * Math.pow(1 + costG, years);
    const interest = loan > 0 ? loan * eff : 0;
    const pay = loan > 0 ? Math.min(repayment, loan + interest) : 0;
    series.push({ year: startYear + years, worth, loan: Math.max(0, loan), equity: worth - Math.max(0, loan), profit: net - interest, cash: net - pay });
    loan = loan + interest - pay;
  }
  const first = test => series.find(test)?.year ?? null;
  const deposit = record.assumptions.depositTarget;
  const milestones = [
    { key: 'profit', year: first(point => point.profit >= 0), title: 'Turns a profit', detail: 'Rent beats interest and costs' },
    { key: 'deposit', year: first(point => point.worth * 0.8 - point.loan >= deposit), title: 'Second deposit', detail: `$${Math.round(deposit / 1000)}k usable equity for house #2` },
    { key: 'million', year: first(point => point.equity >= 1_000_000), title: 'Million-dollar day', detail: 'Your equity passes $1M' },
    { key: 'free', year: first(point => point.loan <= 0), title: 'Loan gone', detail: 'Every dollar of rent is yours' }
  ].sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
  return { series, milestones, startYear, valuation, valueToday, growth, rentGrowth: rentG };
}

export function pointAtYear(series, year) {
  if (!series.length) return null;
  return series.reduce((best, point) => (Math.abs(point.year - year) < Math.abs(best.year - year) ? point : best), series[0]);
}

// ── Record quick-parse ──────────────────────────────────────────────────────

/** Guess what a typed line is: "Paid $180 to the plumber" → expense / repairs / 180. */
export function guessFromText(input) {
  const raw = typeof input === 'string' ? input : '';
  const lower = raw.toLowerCase();
  const amountMatch = raw.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s?(?:dollars|aud)\b|\b(\d[\d,]*\.\d{2})\b|\b(\d{2,}[\d,]*)\b/i);
  const amount = amountMatch ? Number((amountMatch[1] ?? amountMatch[2] ?? amountMatch[3] ?? amountMatch[4]).replace(/,/g, '')) : null;
  const pct = raw.match(/(\d{1,2}(?:\.\d{1,2})?)\s?%/);
  let kind = null;
  let category = null;
  if (/\bstatement\b|\bagent\b.*\brent\b/.test(lower)) kind = 'statement';
  else if (/\binterest\b|\bbankwest\b|\bloan statement\b/.test(lower)) kind = 'interest';
  else if (/\brate\b.*%|\bcash rate\b|\brate (?:cut|rise|change)\b/.test(lower) && pct) kind = 'rate';
  else if (/\bvalu|\bworth\b|\bapprais/.test(lower)) kind = 'valuation';
  else if (/\brent\b.*\b(?:up|rise|increase|now|to)\b|\bnew rent\b/.test(lower)) kind = 'rent';
  else if (lower.trim()) {
    kind = 'expense';
    if (/plumb|repair|fix|electric|mow|garden|hot water|leak|paint|lock|appliance|pest|clean/.test(lower)) category = 'repairs';
    else if (/insur/.test(lower)) category = 'insurance';
    else if (/council/.test(lower)) category = 'council';
    else if (/water/.test(lower)) category = 'water';
    else if (/strata/.test(lower)) category = 'strata';
    else if (/deprec|quantity surveyor/.test(lower)) category = 'depreciation';
    else if (/letting|advert|agent|lease/.test(lower)) category = 'agent';
    else category = 'other';
  }
  const value = kind === 'rate' ? (pct ? Number(pct[1]) : null) : amount;
  return { kind, category, amount: Number.isFinite(value) ? value : null };
}

// ── Whole page model ────────────────────────────────────────────────────────

export function buildPropertyModel(record, { today, extra = 0, rent } = {}) {
  const flow = weeklyFlow(record, today, { extra, rent });
  const summary = taxYearSummary(record, today);
  const ledger = rentLedger(record, today);
  const position = loanPosition(record, today);
  const repaymentPlan = payoff({ balance: position.today, weeklyRepayment: record.loan.weeklyRepayment, effWeekly: position.effWeekly, extra });
  const basePlan = payoff({ balance: position.today, weeklyRepayment: record.loan.weeklyRepayment, effWeekly: position.effWeekly });
  const rates = rateHistory(record);
  const firstRate = rates[0]?.rate ?? null;
  const rate = currentRate(record, today);
  return {
    today,
    record,
    flow,
    summary,
    ledger,
    agenda: propertyAgenda(record, today, summary, ledger),
    loan: {
      position,
      series: loanSeries(record),
      rates,
      rate,
      rateChange: firstRate !== null && rate !== null ? round2(rate - firstRate) : null,
      rateSince: rates[0]?.date ?? null,
      plan: repaymentPlan,
      basePlan,
      interestSaved: repaymentPlan && basePlan && Number.isFinite(basePlan.interest) ? round2(basePlan.interest - repaymentPlan.interest) : 0
    },
    netRentYear: round2(summary.income - summary.agentCosts),
    lastStatement: latest(ofKind(record, 'statement')),
    recent: [...record.entries].sort((a, b) => ((b.recordedOn ?? b.date) < (a.recordedOn ?? a.date) ? -1 : (b.recordedOn ?? b.date) > (a.recordedOn ?? a.date) ? 1 : byDate(b, a))).slice(0, 8)
  };
}

export const __test = { interestDeductiblePortion, monthsCovered, median, WEEK_MS };
