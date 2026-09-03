import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEACHING_BLOBS_SITE_ID,
  TEACHING_CONTENT_STORE,
  UMBRELLA_BLOBS_SITE_ID,
  teachingStoreOptions
} from '../../netlify/functions/_shared/teaching-blobs.mjs';

test('Teaching store stays on this site until a Blobs token is present', () => {
  assert.equal(teachingStoreOptions({}), TEACHING_CONTENT_STORE);
  assert.equal(teachingStoreOptions({ NETLIFY_BLOBS_TOKEN: '' }), TEACHING_CONTENT_STORE);
});

test('Teaching store still reads arteaching-hub when only the token is set', () => {
  const options = teachingStoreOptions({ NETLIFY_BLOBS_TOKEN: 'netlify-pat' });
  assert.deepEqual(options, {
    name: TEACHING_CONTENT_STORE,
    siteID: TEACHING_BLOBS_SITE_ID,
    token: 'netlify-pat'
  });
});

test('Teaching store remounts onto life-hub2 when the site id is local or umbrella', () => {
  assert.equal(teachingStoreOptions({
    NETLIFY_BLOBS_TOKEN: 'netlify-pat',
    TEACHING_BLOBS_SITE_ID: 'local'
  }), TEACHING_CONTENT_STORE);
  assert.equal(teachingStoreOptions({
    NETLIFY_BLOBS_TOKEN: 'netlify-pat',
    TEACHING_BLOBS_SITE_ID: UMBRELLA_BLOBS_SITE_ID
  }), TEACHING_CONTENT_STORE);
});

test('Teaching store site id can be overridden without changing the token env name', () => {
  const options = teachingStoreOptions({
    NETLIFY_BLOBS_TOKEN: 'netlify-pat',
    TEACHING_BLOBS_SITE_ID: '11111111-1111-1111-1111-111111111111'
  });
  assert.equal(options.siteID, '11111111-1111-1111-1111-111111111111');
});
