import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addEntry,
  buildPropertyModel,
  emptyPropertyRecord,
  expectedStatementDates,
  financialYear,
  focusFinancialYear,
  guessFromText,
  markLodged,
  normalizeEntry,
  parsePropertyRecord,
  payoff,
  removeEntry,
  simulateFuture,
  taxYearSummary,
  updateSettings,
  weeklyFlow
} from '../../apps/life/js/app/property-model.js';

// Synthetic property: tenanted from 10/01/26, statements on the 12th and 28th.
function fixture() {
  const statements = [];
  const days = ['2026-01-12', '2026-01-28', '2026-02-12', '2026-02-28', '2026-03-12', '2026-03-28', '2026-04-12', '2026-04-28', '2026-05-12', '2026-05-28', '2026-06-12', '2026-06-28'];
  days.forEach((date, index) => statements.push({ id: `st-${index + 1}`, kind: 'statement', date, gross: 1000, deductions: 80, number: index + 1 }));
  const interest = [
    ['2025-10-30', 2400, 500_000],
    ['2025-12-01', 2400, 499_000],
    ['2025-12-30', 2400, 498_000]
  ].map(([date, amount, balanceAfter], index) => ({ id: `int-${index}`, kind: 'interest', date, amount, balanceAfter }));
  return parsePropertyRecord({
    version: 1,
    property: { name: '1 Test St', address: 'Testville', owners: ['A', 'B'], settledOn: '2025-01-30', purchasePrice: null },
    tenancy: { tenant: 'T', startedOn: '2026-01-10', weeklyRent: 500, agent: 'Agent', agentRate: 0.08 },
    loan: { lender: 'Bank', reference: 'x', original: 510_000, weeklyRepayment: 800, rate: 5.5 },
    annualCosts: { council: { amount: 2080, estimate: true }, water: { amount: 1040, estimate: false } },
    assumptions: { priceGrowth: 0.05, rentGrowth: 0.03, costGrowth: 0.03, taxRate: 0.3, depositTarget: 150_000 },
    lodgedYears: [],
    entries: [...statements, ...interest, { id: 'r1', kind: 'rate', date: '2025-01-30', rate: 6 }, { id: 'r2', kind: 'rate', date: '2025-08-22', rate: 5.5 }]
  });
}

test('parsePropertyRecord drops bad entries and duplicate ids, sorts by date', () => {
  const record = parsePropertyRecord({
    entries: [
      { id: 'b', kind: 'expense', date: '2026-02-01', amount: 50, category: 'repairs' },
      { id: 'a', kind: 'expense', date: '2026-01-01', amount: 20, category: 'nonsense' },
      { id: 'a', kind: 'expense', date: '2026-01-02', amount: 30 },
      { id: 'c', kind: 'statement', date: 'not-a-date', gross: 10 },
      { kind: 'valuation', date: '2026-01-01', amount: 900000 }
    ]
  });
  assert.deepEqual(record.entries.map(entry => entry.id), ['a', 'b']);
  assert.equal(record.entries[0].category, 'other');
  assert.equal(parsePropertyRecord(null), null);
  assert.equal(parsePropertyRecord([]), null);
});

test('normalizeEntry explains what is missing in plain words', () => {
  assert.match(normalizeEntry({ kind: 'statement', date: '2026-01-01' }).error, /gross rent/);
  assert.match(normalizeEntry({ kind: 'expense', date: '2026-02-30', amount: 5 }).error, /date/);
  assert.match(normalizeEntry({ kind: 'rate', date: '2026-01-01', rate: 40 }).error, /percentage/);
  assert.match(normalizeEntry({ kind: 'mystery', date: '2026-01-01' }).error, /kind/);
  const { entry } = normalizeEntry({ kind: 'expense', date: '2026-01-01', amount: '$1,250.50', category: 'insurance', renews: 'yearly', inStatement: true });
  assert.deepEqual(entry, { kind: 'expense', date: '2026-01-01', amount: 1250.5, category: 'insurance', deductible: true, renews: 'yearly', inStatement: true });
});

test('addEntry and removeEntry keep the record sorted and gone means gone', () => {
  const record = emptyPropertyRecord();
  const added = addEntry(record, { kind: 'valuation', date: '2026-05-01', amount: 850000 }, { id: 'v1', today: '2026-10-08' });
  assert.equal(added.entry.recordedOn, '2026-10-08');
  const second = addEntry(added.record, { kind: 'valuation', date: '2026-01-01', amount: 800000 }, { id: 'v0', today: '2026-10-08' });
  assert.deepEqual(second.record.entries.map(entry => entry.id), ['v0', 'v1']);
  const removed = removeEntry(second.record, 'v1');
  assert.deepEqual(removed.record.entries.map(entry => entry.id), ['v0']);
  assert.match(removeEntry(removed.record, 'v1').error, /already gone/);
  assert.match(addEntry(record, { kind: 'valuation', date: '2026-01-01' }, { id: 'x', today: '2026-10-08' }).error, /worth/);
});

test('updateSettings patches known fields only and clears yearly costs', () => {
  const record = fixture();
  const { record: next } = updateSettings(record, {
    tenancy: { weeklyRent: 520, bogus: 1 },
    annualCosts: { insurance: { amount: 1500, estimate: false }, council: null },
    assumptions: { taxRate: 0.9 }
  });
  assert.equal(next.tenancy.weeklyRent, 520);
  assert.equal(next.tenancy.bogus, undefined);
  assert.deepEqual(next.annualCosts.insurance, { amount: 1500, estimate: false });
  assert.equal(next.annualCosts.council, undefined);
  assert.equal(next.assumptions.taxRate, 0.5, 'tax rate is clamped');
});

test('weeklyFlow splits the repayment into interest and money that goes into the house', () => {
  const flow = weeklyFlow(fixture(), '2026-10-08');
  assert.equal(flow.rent, 500);
  assert.equal(Math.round(flow.agent * 100) / 100, 40);
  assert.equal(Math.round(flow.rates * 100) / 100, 60);
  assert.equal(Math.round(flow.interest * 100) / 100, Math.round(((2400 * 12) / 52) * 100) / 100);
  assert.equal(Math.round((flow.interest + flow.principal) * 100) / 100, 800);
  assert.equal(Math.round(flow.pocket * 100) / 100, Math.round((flow.outflow - 500) * 100) / 100);
  assert.ok(Math.abs(flow.real - flow.holding * 0.7) < 1e-9);
  assert.equal(flow.gaps.insuranceMissing, true);
  const extra = weeklyFlow(fixture(), '2026-10-08', { extra: 100, rent: 550 });
  assert.equal(Math.round((extra.principal - flow.principal) * 100) / 100, 100);
  assert.equal(extra.rent, 550);
});

test('financial years and the focus year follow lodging', () => {
  assert.deepEqual(financialYear('2026-06-30'), { label: '2025-26', start: '2025-07-01', end: '2026-06-30', lodgeBy: '2026-10-31' });
  assert.equal(financialYear('2026-07-01').label, '2026-27');
  const record = fixture();
  assert.equal(focusFinancialYear(record, '2026-10-08').label, '2025-26');
  const lodged = markLodged(record, '2025-26').record;
  const focus = focusFinancialYear(lodged, '2026-10-08');
  assert.equal(focus.label, '2026-27');
  assert.equal(focus.inProgress, true);
  assert.match(markLodged(record, 'soon').error, /tax year/);
});

test('taxYearSummary estimates unrecorded interest and spots the swing', () => {
  const summary = taxYearSummary(fixture(), '2026-10-08');
  assert.equal(summary.fy.label, '2025-26');
  assert.equal(summary.income, 12000);
  assert.equal(summary.agentCosts, 960);
  assert.deepEqual(summary.missingMonths, ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  // January is part-rented (from the 10th), so it counts as ~70% of a month.
  assert.ok(summary.interestEstimate > 2400 * 5.6 && summary.interestEstimate < 2400 * 5.8);
  assert.equal(summary.interestRecorded, 0, 'pre-tenancy interest is not deductible');
  assert.equal(summary.recordedResult, 11040);
  assert.ok(summary.correctedResult < 0);
  assert.equal(summary.council.estimate, true);
  assert.equal(summary.daysLeft, 23);
  assert.ok(summary.stake > 0);
  const keys = summary.checklist.map(item => `${item.key}:${item.status}`);
  assert.deepEqual(keys, ['rent:done', 'agent:done', 'interest:missing', 'council:partial', 'insurance:missing', 'depreciation:missing', 'split:info']);
  assert.equal(summary.ready, 2);
  assert.equal(summary.total, 6);
});

test('interest that straddles the tenancy start is apportioned', () => {
  const record = fixture();
  const { record: next } = addEntry(record, { kind: 'interest', date: '2026-01-30', amount: 2400 }, { id: 'jan', today: '2026-10-08' });
  const summary = taxYearSummary(next, '2026-10-08');
  assert.ok(summary.interestRecorded > 2400 * 0.6 && summary.interestRecorded < 2400 * 0.7);
  assert.equal(summary.missingMonths[0], '2026-02');
});

test('expenses already on an agent statement are never counted twice', () => {
  const record = fixture();
  const { record: next } = addEntry(record, { kind: 'expense', date: '2026-02-12', amount: 150, category: 'repairs', inStatement: true }, { id: 'mow', today: '2026-10-08' });
  assert.equal(taxYearSummary(next, '2026-10-08').otherExpenses, 0);
});

test('rent ledger expects statements on the usual days of the month', () => {
  const record = fixture();
  const statements = record.entries.filter(entry => entry.kind === 'statement');
  assert.deepEqual(expectedStatementDates(statements, '2026-08-20'), ['2026-07-12', '2026-07-28', '2026-08-12']);
  const model = buildPropertyModel(record, { today: '2026-10-08' });
  assert.equal(model.ledger.missingCount, 6);
  assert.equal(model.ledger.nextDue, '2026-10-12');
  assert.equal(model.ledger.rows.filter(row => row.expected).length, 6);
});

test('loan position projects from the last balance using the charged interest', () => {
  const model = buildPropertyModel(fixture(), { today: '2026-10-08' });
  const position = model.loan.position;
  assert.deepEqual(position.known, { date: '2025-12-30', balance: 498000 });
  assert.equal(position.estimated, true);
  assert.ok(position.today < 498000 && position.today > 480000);
  assert.equal(model.loan.rate, 5.5);
  assert.equal(model.loan.rateChange, -0.5);
});

test('payoff gets shorter and cheaper with an extra repayment', () => {
  const base = payoff({ balance: 400000, weeklyRepayment: 800, effWeekly: 0.001 });
  const faster = payoff({ balance: 400000, weeklyRepayment: 800, effWeekly: 0.001, extra: 100 });
  assert.ok(faster.weeks < base.weeks);
  assert.ok(faster.interest < base.interest);
  assert.deepEqual(payoff({ balance: 400000, weeklyRepayment: 300, effWeekly: 0.001 }), { weeks: Infinity, interest: Infinity });
  assert.equal(payoff({ balance: null, weeklyRepayment: 800, effWeekly: 0.001 }), null);
});

test('time machine grows value, runs the loan down and orders the milestones', () => {
  const record = fixture();
  const future = simulateFuture(record, '2026-10-08');
  assert.equal(future.valuation.example, true, 'no valuation yet: example value');
  const first = future.series[0];
  const last = future.series.at(-1);
  assert.ok(last.worth > first.worth * 3);
  assert.equal(last.loan, 0);
  const years = future.milestones.map(milestone => milestone.year ?? Infinity);
  assert.deepEqual([...years].sort((a, b) => a - b), years);
  const { record: valued } = addEntry(record, { kind: 'valuation', date: '2026-09-01', amount: 1_200_000 }, { id: 'v', today: '2026-10-08' });
  const valuedFuture = simulateFuture(valued, '2026-10-08');
  assert.equal(valuedFuture.valuation.example, false);
  const million = milestone => milestone.find(item => item.key === 'million').year;
  assert.ok(million(valuedFuture.milestones) < million(future.milestones));
});

test('guessFromText reads the kind, category and amount from a typed line', () => {
  assert.deepEqual(guessFromText('Paid $180 to the plumber for the hot water'), { kind: 'expense', category: 'repairs', amount: 180 });
  assert.deepEqual(guessFromText('Landlord insurance renewal $1,420.50'), { kind: 'expense', category: 'insurance', amount: 1420.5 });
  assert.equal(guessFromText('rate cut to 5.19%').amount, 5.19);
  assert.equal(guessFromText('rate cut to 5.19%').kind, 'rate');
  assert.equal(guessFromText('valuation 845,000').kind, 'valuation');
  assert.equal(guessFromText('').kind, null);
});
