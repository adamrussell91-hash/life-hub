import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  normalizeItem,
  validateItemDraft,
  validateTrip
} from '../../netlify/functions/_shared/travel-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, '../../apps/travel/fixtures/test-trip.json'), 'utf8')
);

test('fixture trip validates', () => {
  assert.equal(validateTrip(fixture).id, 'trp_testlisbon01');
});

const cases = [
  ['unknown kind', { kind: 'spaceship', title: 'x', city_id: 'lis', date: '2027-03-03', time: null, note: '', status: 'planned' }, 'item.kind'],
  ['bad date', { kind: 'do', title: 'x', city_id: 'lis', date: '03-03-2027', time: null, note: '', status: 'planned' }, 'item.date'],
  ['bad time', { kind: 'do', title: 'x', city_id: 'lis', date: '2027-03-03', time: '9:00', note: '', status: 'planned' }, 'item.time'],
  ['http link', { kind: 'do', title: 'x', city_id: 'lis', date: '2027-03-03', time: null, note: '', status: 'planned', link: 'http://example.com' }, 'item.link']
];

for (const [name, draft, path] of cases) {
  test(`validateItemDraft rejects ${name}`, () => {
    assert.throws(() => validateItemDraft(draft), (err) => err.code === 'validation_error' && String(err.path).includes(path.replace(/^item\./, '') || path));
  });
}

test('normalizeItem accepts https link and HH:MM', () => {
  const item = normalizeItem({
    kind: 'do',
    title: 'Walk',
    city_id: 'lis',
    date: '2027-03-03',
    time: '09:30',
    note: '',
    status: 'planned',
    link: 'https://example.com/a'
  });
  assert.equal(item.time, '09:30');
  assert.equal(item.link, 'https://example.com/a');
});

const ticketBase = {
  title: 'ScotRail',
  city_id: 'lis',
  date: '2027-03-03',
  time: '08:22',
  note: '',
  status: 'booked',
  carrier: 'ScotRail',
  from_code: 'GLQ',
  to_code: 'FTW',
  depart_time: '08:22',
  arrive_time: '12:12',
  arrive_date: '2027-03-03'
};

test('normalizeItem accepts empty train number', () => {
  const item = normalizeItem({ ...ticketBase, kind: 'train', number: '' });
  assert.equal(item.number, '');
});

test('normalizeItem rejects empty flight number', () => {
  assert.throws(
    () => normalizeItem({ ...ticketBase, kind: 'flight', number: '', title: 'Flight' }),
    (err) => err.code === 'validation_error' && err.message === 'number required for tickets'
  );
});
