import assert from 'node:assert/strict';
import test from 'node:test';
import {
  carryingCheckin,
  cleanPostcardInput,
  latestCheckinForItem,
  postcardMediaOfItem,
  publicPostcard
} from '../../netlify/functions/_shared/travel-postcard.mjs';

const base = () => ({ photo_id: 'tph_p1', orientation: 'portrait', address: ['Rua do Exemplo', 'Lisboa', 'Portugal'] });
const refuses = (raw, path) =>
  assert.throws(
    () => cleanPostcardInput(raw),
    (error) => error.code === 'validation_error' && error.path === path
  );

test('a photo, an orientation and an address make a postcard', () => {
  assert.deepEqual(cleanPostcardInput(base()), base());
});

test('address lines are tidied, blank lines dropped, and one to four are kept', () => {
  const cleaned = cleanPostcardInput({ ...base(), address: ['  Rua   do Exemplo ', '', '   ', 'Lisboa'] });
  assert.deepEqual(cleaned.address, ['Rua do Exemplo', 'Lisboa']);
  refuses({ ...base(), address: [] }, 'postcard.address');
  refuses({ ...base(), address: ['', ' '] }, 'postcard.address');
  refuses({ ...base(), address: ['a', 'b', 'c', 'd', 'e'] }, 'postcard.address');
  refuses({ ...base(), address: ['x'.repeat(61)] }, 'postcard.address');
  refuses({ ...base(), address: 'Rua do Exemplo' }, 'postcard.address');
  assert.equal(cleanPostcardInput({ ...base(), address: ['é'.repeat(60)] }).address[0].length, 60);
});

test('words are one tidy paragraph of at most 600 characters, and empty words are left out', () => {
  assert.equal(cleanPostcardInput({ ...base(), text: '  Made it \n to the   market. ' }).text, 'Made it to the market.');
  assert.equal('text' in cleanPostcardInput({ ...base(), text: '   ' }), false);
  assert.equal(cleanPostcardInput({ ...base(), text: 'x'.repeat(600) }).text.length, 600);
  refuses({ ...base(), text: 'x'.repeat(601) }, 'postcard.text');
});

test('a clip needs a valid id and a length of 1 to 30 whole seconds', () => {
  const withClip = cleanPostcardInput({ ...base(), audio_id: 'tau_a1', audio_s: 28 });
  assert.equal(withClip.audio_id, 'tau_a1');
  assert.equal(withClip.audio_s, 28);
  refuses({ ...base(), audio_id: 'nope', audio_s: 28 }, 'postcard.audio_id');
  refuses({ ...base(), audio_id: 'tau_a1' }, 'postcard.audio_s');
  refuses({ ...base(), audio_id: 'tau_a1', audio_s: 0 }, 'postcard.audio_s');
  refuses({ ...base(), audio_id: 'tau_a1', audio_s: 31 }, 'postcard.audio_s');
  refuses({ ...base(), audio_id: 'tau_a1', audio_s: 12.5 }, 'postcard.audio_s');
  assert.equal('audio_s' in cleanPostcardInput({ ...base(), audio_s: 12 }), false, 'a length with no clip is dropped');
});

test('a missing photo, a bad orientation and unknown fields are handled', () => {
  refuses(null, 'postcard');
  refuses([], 'postcard');
  refuses({ ...base(), photo_id: 'nope' }, 'postcard.photo_id');
  refuses({ ...base(), orientation: 'square' }, 'postcard.orientation');
  const cleaned = cleanPostcardInput({ ...base(), coordinates: { lat: 1, lon: 2 }, posted_at: '1999-01-01T00:00:00.000Z' });
  assert.equal('coordinates' in cleaned, false);
  assert.equal('posted_at' in cleaned, false);
});

const checkins = [
  { id: 'chk_other', at: '2027-03-04T09:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: 'itm_other' },
  { id: 'chk_a', at: '2027-03-04T10:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: 'itm_1' },
  {
    id: 'chk_b',
    at: '2027-03-04T11:00:00.000Z',
    city_id: 'lis',
    label: 'Safe',
    item_id: 'itm_1',
    photo_id: 'tph_p1',
    postcard: {
      photo_id: 'tph_p1',
      orientation: 'landscape',
      address: ['Rua do Exemplo', 'Lisboa'],
      posted_at: '2027-03-04T11:30:00.000Z',
      audio_id: 'tau_a1',
      audio_s: 21,
      text: 'All good here.',
      coordinates: { lat: 38.7, lon: -9.1 }
    }
  },
  { id: 'chk_c', at: '2027-03-04T12:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: 'itm_1' },
  { id: 'chk_city', at: '2027-03-04T13:00:00.000Z', city_id: 'lis', label: 'Safe check-in' }
];

test('the latest check-in on a stop, and the latest one that carries a postcard or photo', () => {
  assert.equal(latestCheckinForItem(checkins, 'itm_1').id, 'chk_c');
  assert.equal(carryingCheckin(checkins, 'itm_1').id, 'chk_b');
  assert.equal(carryingCheckin(checkins, 'itm_other'), null);
  assert.equal(latestCheckinForItem(checkins, 'itm_none'), null);
  assert.equal(latestCheckinForItem(undefined, 'itm_1'), null);
});

test('every file a stop\'s check-ins name, once each', () => {
  const older = [...checkins, { id: 'chk_old', at: '2027-03-04T08:00:00.000Z', city_id: 'lis', label: 'Photo', item_id: 'itm_1', photo_id: 'tph_old1' }];
  assert.deepEqual(postcardMediaOfItem(older, 'itm_1'), { photoIds: ['tph_p1', 'tph_old1'], audioIds: ['tau_a1'] });
  assert.deepEqual(postcardMediaOfItem(checkins, 'itm_other'), { photoIds: [], audioIds: [] });
});

test('what followers get: the postcard\'s own fields and nothing else', () => {
  assert.deepEqual(publicPostcard(checkins[2]), {
    id: 'chk_b',
    at: '2027-03-04T11:30:00.000Z',
    photo_id: 'tph_p1',
    orientation: 'landscape',
    address: ['Rua do Exemplo', 'Lisboa'],
    audio_id: 'tau_a1',
    audio_s: 21,
    text: 'All good here.'
  });
});

test('a photo from before postcards reads as a photo-only postcard at the check-in\'s time', () => {
  const old = { id: 'chk_old', at: '2027-03-04T08:00:00.000Z', city_id: 'lis', label: 'Photo', item_id: 'itm_1', photo_id: 'tph_old1' };
  assert.deepEqual(publicPostcard(old), { id: 'chk_old', at: '2027-03-04T08:00:00.000Z', photo_id: 'tph_old1' });
});
