import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTravelRepository } from '../../netlify/functions/_shared/travel-repository.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, '../../apps/travel/fixtures/test-trip.json'), 'utf8')
);

function fakeGithub({ conflictOnWrite = false } = {}) {
  const files = new Map();
  return {
    async resolveTree() {
      return {
        tree: [...files.entries()].map(([path, { sha }]) => ({ path, type: 'blob', sha }))
      };
    },
    async readBlob(sha) {
      for (const [, value] of files) {
        if (value.sha === sha) {
          return { content: Buffer.from(value.content, 'utf8').toString('base64'), encoding: 'base64' };
        }
      }
      throw new Error('missing blob');
    },
    async writeFile({ path, content, sha, message }) {
      const existing = files.get(path);
      if (existing && sha && existing.sha !== sha) {
        const err = new Error('sha does not match');
        err.status = 409;
        throw err;
      }
      if (conflictOnWrite && existing && sha) {
        const err = new Error('sha does not match');
        err.status = 409;
        throw err;
      }
      const nextSha = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${files.size}`.slice(0, 40);
      files.set(path, { content, sha: nextSha, message });
      return { sha: nextSha, commitSha: nextSha };
    },
    async deleteFile({ path, sha }) {
      const existing = files.get(path);
      if (!existing || existing.sha !== sha) {
        const err = new Error('sha does not match');
        err.status = 409;
        throw err;
      }
      files.delete(path);
    },
    _files: files
  };
}

test('createTravelRepository list/get/create/save/delete', async () => {
  const github = fakeGithub();
  const repo = createTravelRepository({ github });
  const created = await repo.createTrip(fixture);
  assert.equal(created.trip.id, fixture.id);
  assert.match(
    [...github._files.values()][0].message,
    /^travel: create /
  );

  const listed = await repo.listTrips();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, fixture.title);

  const got = await repo.getTrip(fixture.id);
  assert.equal(got.version, created.version);

  const next = { ...fixture, title: 'Renamed test trip', updated_at: new Date().toISOString() };
  const saved = await repo.saveTrip(next, got.version, 'travel: edit "Renamed test trip"');
  assert.equal(saved.trip.title, 'Renamed test trip');
  assert.match([...github._files.values()].at(-1).message, /travel: edit/);

  await repo.deleteTrip(fixture.id, saved.version);
  assert.equal(github._files.size, 0);
});

test('stale sha becomes 409 conflict', async () => {
  const github = fakeGithub();
  const repo = createTravelRepository({ github });
  const created = await repo.createTrip(fixture);
  await assert.rejects(
    () => repo.saveTrip(fixture, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'travel: edit'),
    (err) => err.code === 'conflict' && err.status === 409
  );
  assert.ok(created.version);
});
