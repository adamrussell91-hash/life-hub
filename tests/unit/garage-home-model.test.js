import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addVisit,
  applyMailAction,
  buildGarageHomeModel,
  buildGmailQuery,
  classifyMessage,
  emptyGarageHomeRecord,
  emptyMailroomRecord,
  findAmount,
  findDate,
  importPack,
  mergeScan,
  odometer,
  parseFrom,
  parseGarageHomeRecord,
  parseMailroomRecord,
  savePlace,
  togglePrep,
  toggleNeeded
} from '../../apps/life/js/app/garage-home-model.js';

// Fictional places only: this repo is public.
function homeRecord() {
  let record = emptyGarageHomeRecord();
  record = savePlace(record, { type: 'car', name: 'The Hatch', match: ['Corolla Hatch'], details: { model: 'Corolla', serviceIntervalKm: 10000 } }).record;
  record = savePlace(record, { type: 'home', name: 'Wattle Rd', match: ['12 Wattle Rd'], details: { weeklyRent: 700 } }).record;
  record = savePlace(record, { type: 'investment', name: 'Banksia St', match: ['4 Banksia St'], details: { stillNeeded: ['Depreciation schedule', 'Water rates'] } }).record;
  return record;
}

const msg = (id, from, subject, snippet, date = '2026-10-01', threadId = id) => ({ id, threadId, from, subject, snippet, date });

test('parsing helpers read senders, dd/mm/yyyy dates and dollar amounts', () => {
  assert.deepEqual(parseFrom('Agency Mail <Notice@Agency.example>'), { name: 'Agency Mail', address: 'notice@agency.example' });
  assert.deepEqual(parseFrom('plain@example.com'), { name: 'plain@example.com', address: 'plain@example.com' });
  assert.equal(findDate('visiting on 20/10/2026 between 10 and 11'), '2026-10-20');
  assert.equal(findDate('on 7/10/26'), '2026-10-07');
  assert.equal(findDate('on 31/02/2026'), null);
  assert.equal(findAmount('payment of $1,980.00 processed'), 1980);
  assert.equal(findAmount('no money here'), null);
});

test('classifyMessage files mail to the right place and kind, and ignores everything else', () => {
  const home = homeRecord();
  const ctx = { places: home.places, autoFile: home.settings.autoFile };
  const rent = classifyMessage(msg('a', 'Agent <a@agent.example>', 'Receipt of payment for 12 Wattle Rd', 'Thanks for your payment of $700.00 processed on 1/10/2026.'), ctx);
  assert.equal(rent.placeId, 'wattle-rd');
  assert.equal(rent.kind, 'rent');
  assert.equal(rent.facts.amount, 700);
  assert.equal(rent.facts.eventDate, '2026-10-01');
  assert.equal(rent.status, 'filed', 'rent receipts file themselves by default');
  assert.equal(rent.auto, true);

  const inspection = classifyMessage(msg('b', 'Agent <a@agent.example>', 'Notice of routine inspection for 12 Wattle Rd', 'We will be visiting the property on 20/10/2026 between 10am and 11am'), ctx);
  assert.equal(inspection.kind, 'inspection');
  assert.equal(inspection.facts.eventDate, '2026-10-20');
  assert.equal(inspection.status, 'waiting');

  const statement = classifyMessage(msg('c', 'Owner Agency <o@owner.example>', 'Rental income statement #18', 'activity up to 28/09/2026 for: 4 Banksia St'), ctx);
  assert.equal(statement.placeId, 'banksia-st');
  assert.equal(statement.kind, 'statement');
  assert.equal(statement.facts.number, 18);

  const booking = classifyMessage(msg('d', 'Tyre Co <t@tyres.example>', 'Your booking on 7/10/2026 is confirmed Ref# 3796662', 'Your Toyota Corolla Hatch booking is confirmed'), ctx);
  assert.equal(booking.placeId, 'the-hatch');
  assert.equal(booking.kind, 'booking');
  assert.equal(booking.facts.ref, '3796662');

  assert.equal(classifyMessage(msg('e', 'Shop <s@shop.example>', 'Big sale', 'Everything 20% off'), ctx), null);
});

test('retired cars stop catching mail; sender rules beat match words', () => {
  let home = homeRecord();
  const car = home.places.find(p => p.type === 'car');
  home = savePlace(home, { ...car, details: { ...car.details, retired: true } }).record;
  const message = msg('a', 'Tyre Co <t@tyres.example>', 'Corolla Hatch service', 'done');
  assert.equal(classifyMessage(message, { places: home.places }), null);
  const routed = classifyMessage(message, { places: home.places, senderRules: [{ from: 'tyres.example', placeId: 'wattle-rd' }] });
  assert.equal(routed.placeId, 'wattle-rd');
});

test('mergeScan dedupes by Gmail id and keeps the newest first', () => {
  const home = homeRecord();
  const first = mergeScan(emptyMailroomRecord(), [msg('a', 'x <x@x.example>', 'Receipt of payment 12 Wattle Rd', '$700', '2026-09-24')], { home, scannedAt: '2026-10-01T00:00:00Z' });
  assert.equal(first.added.length, 1);
  const second = mergeScan(first.mailroom, [
    msg('a', 'x <x@x.example>', 'Receipt of payment 12 Wattle Rd', '$700', '2026-09-24'),
    msg('b', 'x <x@x.example>', 'Receipt of payment 12 Wattle Rd', '$700', '2026-10-01')
  ], { home, scannedAt: '2026-10-02T00:00:00Z' });
  assert.equal(second.added.length, 1);
  assert.deepEqual(second.mailroom.items.map(i => i.id), ['b', 'a']);
  assert.equal(second.mailroom.lastScanAt, '2026-10-02T00:00:00Z');
});

test('approve, ignore, undo and move with a remembered sender', () => {
  const home = homeRecord();
  const { mailroom } = mergeScan(emptyMailroomRecord(), [msg('a', 'Agent <a@agent.example>', 'Maintenance request 12 Wattle Rd', 'stovetop knob')], { home });
  assert.equal(mailroom.items[0].status, 'waiting');
  const approved = applyMailAction(mailroom, home, { action: 'approve', id: 'a' }, { today: '2026-10-09' });
  assert.equal(approved.item.status, 'filed');
  assert.equal(approved.item.decidedOn, '2026-10-09');
  const undone = applyMailAction(approved.mailroom, home, { action: 'undo', id: 'a' }, { today: '2026-10-09' });
  assert.equal(undone.item.status, 'waiting');
  const moved = applyMailAction(undone.mailroom, home, { action: 'move', id: 'a', placeId: 'banksia-st', remember: true }, { today: '2026-10-09' });
  assert.equal(moved.item.placeId, 'banksia-st');
  assert.equal(moved.item.kind, 'job', 'kind is re-read for the new place type');
  assert.deepEqual(moved.mailroom.senderRules, [{ from: 'a@agent.example', placeId: 'banksia-st' }]);
  assert.match(applyMailAction(moved.mailroom, home, { action: 'move', id: 'a', placeId: 'nope' }, { today: '2026-10-09' }).error, /Pick/);
  assert.match(applyMailAction(moved.mailroom, home, { action: 'approve', id: 'missing' }, { today: '2026-10-09' }).error, /no longer/);
});

test('buildGmailQuery quotes match words, adds sender rules and skips retired cars', () => {
  const home = homeRecord();
  const mailroom = { ...emptyMailroomRecord(), senderRules: [{ from: 'agent.example', placeId: 'wattle-rd' }] };
  const query = buildGmailQuery(home, mailroom, {});
  assert.match(query, /^newer_than:21d /);
  assert.match(query, /"Corolla Hatch" OR "12 Wattle Rd" OR "4 Banksia St" OR from:agent\.example/);
  assert.match(buildGmailQuery(home, mailroom, { sinceDateKey: '2026-10-01' }), /^after:2026\/10\/01 /);
  assert.equal(buildGmailQuery(emptyGarageHomeRecord(), emptyMailroomRecord(), {}), null);
});

test('odometer estimates today from the car’s own log', () => {
  const visits = [
    { date: '2025-01-01', km: 10000 },
    { date: '2026-01-01', km: 22000 },
    { date: '2026-03-01', km: null }
  ];
  const odo = odometer(visits, '2026-04-01');
  assert.equal(odo.lastKm, 22000);
  assert.equal(odo.isEstimate, true);
  assert.ok(odo.estimate > 24800 && odo.estimate < 25100, String(odo.estimate));
  assert.equal(odometer([], '2026-04-01'), null);
});

test('the page model raises inspections, unlogged bookings and tax-time gaps', () => {
  let home = homeRecord();
  home = addVisit(home, { placeId: 'the-hatch', date: '2026-01-19', title: 'Tyre', km: 68725, cost: 249 }, { id: 'v1' }).record;
  const messages = [
    msg('i', 'Agent <a@agent.example>', 'Notice of routine inspection for 12 Wattle Rd', 'visiting on 20/10/2026', '2026-10-07'),
    msg('b', 'Tyre Co <t@tyres.example>', 'Booking confirmed on 7/10/2026', 'Corolla Hatch booking', '2026-09-30'),
    msg('s', 'Owner Agency <o@owner.example>', 'Rental income statement #18', 'up to 28/09/2026 for 4 Banksia St', '2026-09-28')
  ];
  let { mailroom } = mergeScan(emptyMailroomRecord(), messages, { home });
  for (const id of ['i', 'b']) mailroom = applyMailAction(mailroom, home, { action: 'approve', id }, { today: '2026-10-09' }).mailroom;
  home = togglePrep(home, { forDate: '2026-10-20', item: home.places[1].details.prepChecklist[0] }).record;
  home = toggleNeeded(home, { placeId: 'banksia-st', item: 'Water rates' }).record;

  const model = buildGarageHomeModel(home, mailroom, { today: '2026-10-09' });
  const [rental] = model.homes;
  assert.equal(rental.daysToInspection, 11);
  assert.equal(rental.prep.doneCount, 1);
  const [car] = model.cars;
  assert.equal(car.unloggedBooking.date, '2026-10-07');
  assert.equal(car.spend, 249);
  const [inv] = model.investments;
  assert.equal(inv.fy.label, '2026-27');
  assert.equal(inv.pack.statements.length, 1, 'statements file themselves into the pack');
  assert.deepEqual(model.needsYou.map(n => n.kind), ['inspection', 'log', 'tax']);
});

test('records round-trip through the parsers and reject junk', () => {
  const home = homeRecord();
  assert.deepEqual(parseGarageHomeRecord(JSON.parse(JSON.stringify(home))), home);
  assert.equal(parseGarageHomeRecord('nope'), null);
  assert.equal(parseMailroomRecord([]), null);
  const parsed = parseGarageHomeRecord({ places: [{ type: 'boat', name: 'x' }, { type: 'car', name: '' }], visits: [{ placeId: 'ghost', date: '2026-01-01', title: 'x', id: 'v' }] });
  assert.deepEqual(parsed.places, []);
  assert.deepEqual(parsed.visits, []);
});

test('importPack merges places by id and skips duplicate visits', () => {
  const pack = {
    places: [{ id: 'the-hatch', type: 'car', name: 'The Hatch', match: ['Corolla Hatch'] }, { type: 'car', name: 'Old Ute', match: ['Ute'] }],
    visits: [
      { placeId: 'the-hatch', date: '2024-03-13', title: 'Regular service', km: 20939, cost: 377.59 },
      { placeId: 'the-hatch', date: '2024-03-13', title: 'Regular service', km: 20939, cost: 377.59 }
    ]
  };
  let n = 0;
  const result = importPack(homeRecord(), pack, { newId: () => `v${(n += 1)}` });
  assert.equal(result.placesAdded, 1);
  assert.equal(result.visitsAdded, 1);
  assert.match(importPack(result.record, pack, { newId: () => 'z' }).error, /Nothing new/);
});
