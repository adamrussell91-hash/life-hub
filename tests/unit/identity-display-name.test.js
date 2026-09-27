import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanIdentityDisplayName,
  dedupeIdentityRows,
  identityNameKey,
  preferIdentityTwin
} from '../../netlify/functions/_shared/identity-display-name.mjs';

test('cleanIdentityDisplayName strips trailing Notion URL parentheticals', () => {
  assert.equal(
    cleanIdentityDisplayName(
      'Joseph Histon (https://app.notion.com/p/Joseph-Histon-e9b130c709d44b04865e24bbbcc60967?pvs=21)'
    ),
    'Joseph Histon'
  );
});

test('cleanIdentityDisplayName recovers a title from a bare Notion /p/ URL', () => {
  assert.equal(
    cleanIdentityDisplayName(
      'https://app.notion.com/p/Joseph-Histon-e9b130c709d44b04865e24bbbcc60967?pvs=21'
    ),
    'Joseph Histon'
  );
});

test('cleanIdentityDisplayName strips a leaked p/ path prefix', () => {
  assert.equal(cleanIdentityDisplayName('p/Joseph-Histon-e9b130c709d44b04865e24bbbcc60967'), 'Joseph Histon');
});

test('cleanIdentityDisplayName unwraps a markdown link label', () => {
  assert.equal(
    cleanIdentityDisplayName('[Keith Pavlis](https://app.notion.com/p/Keith-Pavlis-abc123)'),
    'Keith Pavlis'
  );
});

test('cleanIdentityDisplayName leaves a clean name alone', () => {
  assert.equal(cleanIdentityDisplayName('Natalie Shih'), 'Natalie Shih');
});

test('identityNameKey matches cleaned Blob twin to GitHub name', () => {
  const blob = 'Joseph Histon (https://app.notion.com/p/Joseph-Histon-e9b130c709d44b04865e24bbbcc60967)';
  assert.equal(identityNameKey(blob), identityNameKey('Joseph Histon'));
});

test('preferIdentityTwin keeps the GitHub row with relationships over an empty Blob twin', () => {
  const blob = {
    source: 'blob',
    relationships: [],
    record: {
      display_name: 'Joseph Histon (https://app.notion.com/p/x)',
      id: 'person_blob'
    }
  };
  const github = {
    source: 'github',
    relationships: [{ link: { relationship_type: 'employee_at' } }],
    record: {
      display_name: 'Joseph Histon',
      id: 'person_github',
      professional_profile: { schema_version: 1 }
    }
  };
  assert.equal(preferIdentityTwin(blob, github), github);
  assert.equal(preferIdentityTwin(github, blob), github);
});

test('dedupeIdentityRows collapses Blob+GitHub twins and cleans the winner label', () => {
  const rows = [
    {
      person: {
        id: 'person_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        display_name: 'Joseph Histon (https://app.notion.com/p/Joseph-Histon-e9b130c709d44b04865e24bbbcc60967)'
      },
      relationships: [],
      _source: 'blob'
    },
    {
      person: {
        id: 'person_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        display_name: 'Joseph Histon',
        professional_profile: { schema_version: 1 }
      },
      relationships: [{ link: { id: 'ul_1' } }],
      _source: 'github'
    },
    {
      person: {
        id: 'person_cccccccc-cccc-cccc-cccc-cccccccccccc',
        display_name: 'Natalie Shih'
      },
      relationships: [],
      _source: 'github'
    }
  ];

  const out = dedupeIdentityRows(
    rows,
    (row) => row.person,
    (row, person) => ({ person, relationships: row.relationships }),
    (row) => (row._source === 'github' ? 'github' : 'blob')
  );

  assert.equal(out.length, 2);
  const joseph = out.find((r) => r.person.display_name === 'Joseph Histon');
  assert.ok(joseph);
  assert.equal(joseph.person.id, 'person_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  assert.equal(joseph.relationships.length, 1);
  assert.ok(out.some((r) => r.person.display_name === 'Natalie Shih'));
});

test('dedupeIdentityRows drops URL-only labels that cannot be recovered', () => {
  const out = dedupeIdentityRows(
    [
      {
        person: { id: 'person_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', display_name: 'https://example.com/x' },
        relationships: [],
        _source: 'blob'
      }
    ],
    (row) => row.person,
    (row, person) => ({ person, relationships: row.relationships }),
    () => 'blob'
  );
  assert.equal(out.length, 0);
});

test('dedupeIdentityRows keeps same-source people that share a display name', () => {
  const out = dedupeIdentityRows(
    [
      {
        person: { id: 'person_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', display_name: 'Test Person' },
        relationships: [],
        _source: 'blob'
      },
      {
        person: { id: 'person_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', display_name: 'Test Person' },
        relationships: [],
        _source: 'blob'
      }
    ],
    (row) => row.person,
    (row, person) => ({ person, relationships: row.relationships, _source: row._source }),
    (row) => row._source
  );
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((r) => r.person.id).sort(),
    [
      'person_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'person_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    ].sort()
  );
});
