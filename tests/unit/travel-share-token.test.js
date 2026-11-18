import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { liveTripForShareToken } from '../../netlify/functions/_shared/travel-share-token.mjs';

const hash = (token) => createHash('sha256').update(token).digest('hex');

function repo(map, trips) {
  return {
    async getShareTokens() {
      return { map, version: 'v' };
    },
    async getTrip(id) {
      if (trips[id]) return { trip: trips[id], version: 'v1' };
      throw Object.assign(new Error('Trip not found.'), { status: 404, code: 'not_found' });
    }
  };
}

const trips = {
  trp_live1: { id: 'trp_live1', title: 'Invented trip' },
  trp_gone1: { id: 'trp_gone1', title: 'Old trip', lifecycle: 'deleted' }
};

test('a trip link, typed or from before links had a kind, opens its live trip', async () => {
  const map = { [hash('old')]: { trip_id: 'trp_live1' }, [hash('typed')]: { trip_id: 'trp_live1', kind: 'trip' } };
  assert.deepEqual(await liveTripForShareToken(repo(map, trips), 'old'), { tripId: 'trp_live1', trip: trips.trp_live1 });
  assert.equal((await liveTripForShareToken(repo(map, trips), 'typed')).tripId, 'trp_live1');
});

test('a journal link, a deleted trip, a missing trip and an unknown token open nothing', async () => {
  const map = {
    [hash('journal')]: { trip_id: 'trp_live1', kind: 'journal' },
    [hash('deleted')]: { trip_id: 'trp_gone1' },
    [hash('dangling')]: { trip_id: 'trp_never1' }
  };
  const r = repo(map, trips);
  assert.equal(await liveTripForShareToken(r, 'journal'), null);
  assert.equal(await liveTripForShareToken(r, 'deleted'), null);
  assert.equal(await liveTripForShareToken(r, 'dangling'), null);
  assert.equal(await liveTripForShareToken(r, 'unknown'), null);
  assert.equal(await liveTripForShareToken(r, ''), null);
  assert.equal(await liveTripForShareToken(r, null), null);
});
