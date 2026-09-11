import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createRelationshipRegistryHandler } from '../../netlify/functions/relationship-registry.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  method = 'GET'
} = {}) {
  return new Request('https://api.adam-russell.com/api/relationship-registry', {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {})
    }
  });
}

function deps(overrides = {}) {
  return { env, now: () => Date.parse('2026-08-01T01:00:00Z'), ...overrides };
}

test('rejects an unauthenticated request with 401', async () => {
  const handler = createRelationshipRegistryHandler(deps());
  const response = await handler(request({ cookie: false }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

test('rejects a disallowed origin', async () => {
  const handler = createRelationshipRegistryHandler(deps());
  const response = await handler(request({ origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('rejects an unsupported method', async () => {
  const handler = createRelationshipRegistryHandler(deps());
  const response = await handler(request({ method: 'POST' }));
  assert.equal(response.status, 405);
});

test('returns projectRelationshipRegistry output and omits duplicate_fields and storage details', async () => {
  const handler = createRelationshipRegistryHandler(deps());
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.ok(Array.isArray(body.data.relationships));
  assert.equal(body.data.relationships.length, 8);
  const collaborator = body.data.relationships.find(r => r.key === 'collaborator');
  assert.ok(collaborator);
  assert.deepEqual(Object.keys(collaborator).sort(), [
    'allowed_visibility',
    'cardinality',
    'inverse_label',
    'key',
    'metadata_keys',
    'role_mode',
    'source_kinds',
    'target_kinds',
    'temporal_mode'
  ]);
  for (const relationship of body.data.relationships) {
    assert.equal('duplicate_fields' in relationship, false);
  }
});
