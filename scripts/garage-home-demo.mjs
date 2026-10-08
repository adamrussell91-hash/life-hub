/**
 * Local mock for /api/garage-home (npm run dev, browser tests).
 * Fictional places and mail only: this repo is public.
 */
import {
  addVisit,
  applyMailAction,
  emptyGarageHomeRecord,
  emptyMailroomRecord,
  forgetSender,
  importPack,
  mergeScan,
  removePlace,
  removeVisit,
  savePlace,
  sydneyDateKey,
  toggleNeeded,
  togglePrep,
  updateAutoFile
} from '../apps/life/js/app/garage-home-model.js';

function addDays(key, days) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const dmy = key => `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}/${key.slice(0, 4)}`;

export function seedGarageHomeDemo(today) {
  let home = emptyGarageHomeRecord();
  home = savePlace(home, { type: 'car', name: 'The Hatch', match: ['Corolla Hatch'], details: { model: 'Toyota Corolla', purchasedOn: '2022-03-01', warrantyUntil: '2029-03-01', serviceIntervalKm: 10000 } }).record;
  home = savePlace(home, { type: 'home', name: 'Wattle Rd', match: ['12 Wattle Rd'], details: { address: '12 Wattle Rd, Example NSW', agent: 'Harbour Realty', weeklyRent: 720, bond: 2880, leaseEnd: addDays(today, 120) } }).record;
  home = savePlace(home, { type: 'investment', name: 'Banksia St', match: ['4 Banksia St'], details: { agent: 'Coastal Property', stillNeeded: ['Depreciation schedule', 'Landlord insurance', 'Water rates', 'Council rates notice'] } }).record;
  let n = 0;
  for (const visit of [
    { date: '2022-07-15', title: 'First service', provider: 'City Toyota', km: 1500, cost: 180 },
    { date: '2023-03-17', title: 'Regular service', provider: 'Corner Garage', km: 15000, cost: 320 },
    { date: '2024-01-10', title: 'Regular service', provider: 'Corner Garage', km: 28029, cost: 391.55 },
    { date: '2025-01-09', title: 'Regular service', provider: 'Corner Garage', km: 43881, cost: 410 },
    { date: '2025-07-07', title: 'New battery', provider: 'Battery Barn', km: 55000, cost: 209 },
    { date: addDays(today, -260), title: 'One new tyre', provider: 'Tyre Co', km: 68725, cost: 249, note: 'Three tyres flagged near the legal limit; alignment recommended.' }
  ]) home = addVisit(home, { placeId: 'the-hatch', ...visit }, { id: `demo-${(n += 1)}` }).record;

  const inspection = addDays(today, 11);
  const booking = addDays(today, -2);
  const messages = [
    { id: 'd1', threadId: 'd1', from: 'Harbour Realty <pm@harbour.example>', subject: 'Notice of routine inspection for 12 Wattle Rd', snippet: `We will be visiting the property on ${dmy(inspection)} between 10:00am and 11:00am.`, date: addDays(today, -2) },
    { id: 'd2', threadId: 't-stove', from: 'Harbour Realty <pm@harbour.example>', subject: 'Re: 12 Wattle Rd, maintenance request', snippet: 'Thanks for your email. I have reached out to the landlord for approval for this job.', date: addDays(today, -2) },
    { id: 'd3', threadId: 't-stove', from: 'You <me@example.com>', subject: '12 Wattle Rd, maintenance request', snippet: 'Following up on the stovetop knob, which has corroded and no longer turns.', date: addDays(today, -3) },
    { id: 'd4', threadId: 'd4', from: 'Tyre Co <bookings@tyres.example>', subject: `Your booking on ${dmy(booking)} is confirmed Ref# 3796662`, snippet: 'Your Toyota Corolla Hatch booking is confirmed at 5 Example Rd.', date: addDays(today, -9) },
    { id: 'd5', threadId: 'd5', from: 'Harbour Realty <pm@harbour.example>', subject: 'Receipt of payment for 12 Wattle Rd', snippet: `Thanks for your recent payment of $720.00 that we processed on ${dmy(addDays(today, -8))}.`, date: addDays(today, -8) },
    { id: 'd6', threadId: 'd6', from: 'Harbour Realty <pm@harbour.example>', subject: 'Receipt of payment for 12 Wattle Rd', snippet: `Thanks for your recent payment of $720.00 that we processed on ${dmy(addDays(today, -15))}.`, date: addDays(today, -15) },
    { id: 'd7', threadId: 'd7', from: 'Coastal Property <statements@coastal.example>', subject: 'Rental income statement #18', snippet: `We have created a statement detailing activity up to ${dmy(addDays(today, -11))} for: 4 Banksia St.`, date: addDays(today, -11) },
    { id: 'd8', threadId: 'd8', from: 'Coastal Property <jobs@coastal.example>', subject: 'Job request for your property at 4 Banksia St', snippet: 'Please attend and repair: rusted fence post behind the shed, fence panel and downpipe bracket.', date: addDays(today, -8) },
    { id: 'd9', threadId: 'd9', from: 'City Energy <hello@energy.example>', subject: 'A reminder about your upcoming payment', snippet: 'Your next direct debit payment of $19.44 for your gas account at 12 Wattle Rd will be taken soon.', date: addDays(today, -7) }
  ];
  let { mailroom } = mergeScan(emptyMailroomRecord(), messages, { home, scannedAt: new Date().toISOString() });
  for (const id of ['d1', 'd2', 'd3', 'd8']) mailroom = applyMailAction(mailroom, home, { action: 'approve', id }, { today }).mailroom;
  return { home, mailroom };
}

export function createGarageHomeMock({ now = Date.now } = {}) {
  let state = null;
  let n = 0;
  const today = () => sydneyDateKey(new Date(now()));
  const ensure = () => (state ??= seedGarageHomeDemo(today()));
  const data = extra => ({ home: state.home, mailroom: state.mailroom, gmailConnected: false, ...extra });

  return function handle(body) {
    ensure();
    if (!body) return { status: 200, data: data() };
    const newId = () => `local-${(n += 1)}`;
    if (body.action === 'scan') return { status: 409, error: ['gmail_not_connected', 'Connect Gmail first.'] };
    let result;
    if (body.action === 'mail') result = applyMailAction(state.mailroom, state.home, body.mail, { today: today() });
    else if (body.action === 'forget-sender') result = forgetSender(state.mailroom, body.from);
    else if (body.action === 'place') result = savePlace(state.home, body.place);
    else if (body.action === 'remove-place') result = removePlace(state.home, body.id);
    else if (body.action === 'visit') result = addVisit(state.home, body.visit, { id: newId() });
    else if (body.action === 'remove-visit') result = removeVisit(state.home, body.id);
    else if (body.action === 'prep') result = togglePrep(state.home, body);
    else if (body.action === 'needed') result = toggleNeeded(state.home, body);
    else if (body.action === 'autofile') result = updateAutoFile(state.home, body.patch);
    else if (body.action === 'import') result = importPack(state.home, body.pack, { newId });
    else return { status: 400, error: ['invalid_request', 'Provide a valid Garage & Home update.'] };
    if (result.error) return { status: 400, error: ['invalid_entry', result.error] };
    if (result.mailroom) state = { ...state, mailroom: result.mailroom };
    if (result.record) state = { ...state, home: result.record };
    return { status: 200, data: data(body.action === 'import' ? { imported: { places: result.placesAdded, visits: result.visitsAdded } } : {}) };
  };
}
