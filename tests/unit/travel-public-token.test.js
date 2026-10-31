import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTravelPublicHandler } from '../../netlify/functions/travel-public.mjs';

const hash = (token) => createHash('sha256').update(token).digest('hex');

function handlerWith(map, trip = { id: 'trp_x', title: 'Somewhere' }) {
  return createTravelPublicHandler({
    env: {},
    createTravelRepository: () => ({
      getShareTokens: async () => ({ map }),
      getTrip: async () => ({ trip })
    })
  });
}

const call = (handler, token) =>
  handler(new Request(`https://api.adam-russell.com/api/travel-public?token=${token}`));

test('a trip link opens the shared trip', async () => {
  const response = await call(handlerWith({ [hash('trip-tok')]: { trip_id: 'trp_x' } }), 'trip-tok');
  assert.equal(response.status, 200);
});

test('a journal link does not open the whole trip', async () => {
  const response = await call(handlerWith({ [hash('jrnl-tok')]: { trip_id: 'trp_x', kind: 'journal' } }), 'jrnl-tok');
  assert.equal(response.status, 404);
});

test('a deleted trip stops resolving', async () => {
  const response = await call(
    handlerWith({ [hash('trip-tok')]: { trip_id: 'trp_x' } }, { id: 'trp_x', title: 'Gone', lifecycle: 'deleted' }),
    'trip-tok'
  );
  assert.equal(response.status, 404);
});
