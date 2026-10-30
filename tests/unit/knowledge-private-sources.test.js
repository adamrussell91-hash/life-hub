import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTES_PLACE_PATH,
  UNIVERSITY_TIMELINE_PATH,
  createKnowledgePrivateSourcesHandler,
  shapeNotesPlace,
  shapeUniversitySource
} from '../../netlify/functions/knowledge-private-sources.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const signedIn = { verifySessionToken: () => ({ valid: true }) };
const req = (url, init) => new Request(`https://example.test${url}`, init);
const URL_PATH = '/api/knowledge/private-sources';

// Invented degrees, units, notebooks and events only.
const UNIVERSITY = {
  catalogue: { generated: 'test', degrees: [{ id: 'degree-1', title: 'Master of Sample Studies', units: [] }, { title: 'no id' }] },
  unitDegrees: { smpl5805: 'Master of Sample Studies', BAD: 7 },
  originLabels: { aliases: { 'Old Sample': 'Master of Sample Studies', nope: 3 }, dropped: ['Graduate Diploma of Sample', 9] },
  parseOptions: { titleOverrides: { secret: 'not served' } }
};
const PLACE = { recovered: 'test', notebook: { 'Sample Notebook': ['0123456789abcdef0123456789abcdef', 4] }, book: { 'Example Book': [] }, pd: 'bad' };

function handler(files, signed = signedIn) {
  const reads = [];
  return {
    reads,
    handle: createKnowledgePrivateSourcesHandler({
      env,
      ...signed,
      readPrivateJsonFile: async (path) => {
        reads.push(path);
        if (!(path in files)) throw Object.assign(new Error('missing'), { status: 404 });
        return files[path];
      }
    })
  };
}

test('private sources serve the catalogue, unit map, label rules and notes-place map', async () => {
  const { handle, reads } = handler({ [UNIVERSITY_TIMELINE_PATH]: UNIVERSITY, [NOTES_PLACE_PATH]: PLACE });
  const response = await handle(req(URL_PATH));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const { data } = await response.json();
  assert.equal(data.status, 'ready');
  assert.deepEqual(data.catalogue.degrees.map(d => d.id), ['degree-1']);
  assert.deepEqual(data.unitDegrees, { SMPL5805: 'Master of Sample Studies' });
  assert.deepEqual(data.originLabels, { aliases: { 'Old Sample': 'Master of Sample Studies' }, dropped: ['Graduate Diploma of Sample'] });
  assert.deepEqual(data.notesPlace, { notebook: { 'Sample Notebook': ['0123456789abcdef0123456789abcdef'] }, book: { 'Example Book': [] }, pd: {} });
  assert.equal('parseOptions' in data, false);
  await handle(req(URL_PATH));
  assert.equal(reads.length, 2, 'a complete read is cached');
});

test('private sources load each file on its own and retry a missing one', async () => {
  const { handle, reads } = handler({ [NOTES_PLACE_PATH]: PLACE });
  const { data } = await (await handle(req(URL_PATH))).json();
  assert.equal(data.status, 'ready');
  assert.equal(data.catalogue, null);
  assert.ok(data.notesPlace);
  await handle(req(URL_PATH));
  assert.equal(reads.length, 4);
  const none = handler({});
  assert.equal((await (await none.handle(req(URL_PATH))).json()).data.status, 'unavailable');
});

test('private sources need a session and GET', async () => {
  const out = handler({}, { verifySessionToken: () => ({ valid: false }) });
  assert.equal((await out.handle(req(URL_PATH))).status, 401);
  const { handle } = handler({});
  assert.equal((await handle(req(URL_PATH, { method: 'PUT' }))).status, 405);
  assert.deepEqual(shapeUniversitySource(null), { catalogue: null, unitDegrees: {}, originLabels: { aliases: {}, dropped: [] } });
  assert.equal(shapeNotesPlace({}), null);
});
