import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_INTRODUCTION_PATHS, findIntroductionPaths } from '../../netlify/functions/_shared/introduction-paths.mjs';

// Hand-built `peopleWithRelationships` fixtures — the same shape
// `loadAllPeopleWithRelationships` returns, but constructed directly (pure
// unit test, no store). A link only needs to appear once, on one side's
// `relationships` array (`network-graph.mjs`'s `buildRelationshipGraph`
// adds both nodes regardless of which side records the entry, matching
// how a real Universal Link's "other endpoint" is always resolved too).

let linkCounter = 0;
function nextLinkId() {
  linkCounter += 1;
  return `link_${linkCounter}`;
}

function personEntry(ref, displayName, relationships = []) {
  return { person: { ref, display_name: displayName, id: ref }, relationships };
}

function outgoingRel({ targetRef, targetKind = 'person', targetLabel, relationshipType, role = null, status = 'current', sourceRef }) {
  const id = nextLinkId();
  return {
    link: { id, status, relationship_type: relationshipType, role, source_ref: sourceRef, target_ref: targetRef },
    endpoint: { ref: targetRef, kind: targetKind, display_label: targetLabel },
    direction: 'outgoing'
  };
}

const A = 'shared:person:alice';
const B = 'shared:person:bob';
const C = 'shared:person:carol';
const D = 'shared:person:dan';
const ORG = 'shared:organisation:unsw';

test('finds the shortest path and cites the real relationship type/role at each hop', () => {
  const peopleWithRelationships = [
    personEntry(A, 'Alice', [
      outgoingRel({ sourceRef: A, targetRef: B, targetLabel: 'Bob', relationshipType: 'professional_relationship', role: 'mentor' })
    ]),
    personEntry(B, 'Bob', [
      outgoingRel({ sourceRef: B, targetRef: C, targetLabel: 'Carol', relationshipType: 'professional_relationship', role: 'colleague' })
    ])
  ];

  const paths = findIntroductionPaths(peopleWithRelationships, A, C);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0], [
    { ref: B, via: 'mentor', relationship_type: 'professional_relationship', role: 'mentor' },
    { ref: C, via: 'colleague', relationship_type: 'professional_relationship', role: 'colleague' }
  ]);
});

test('a shorter direct path wins over a longer alternative', () => {
  const peopleWithRelationships = [
    personEntry(A, 'Alice', [
      outgoingRel({ sourceRef: A, targetRef: B, targetLabel: 'Bob', relationshipType: 'professional_relationship', role: 'mentor' }),
      outgoingRel({ sourceRef: A, targetRef: C, targetLabel: 'Carol', relationshipType: 'professional_relationship', role: 'friend' })
    ]),
    personEntry(B, 'Bob', [
      outgoingRel({ sourceRef: B, targetRef: C, targetLabel: 'Carol', relationshipType: 'professional_relationship', role: 'colleague' })
    ])
  ];

  const paths = findIntroductionPaths(peopleWithRelationships, A, C);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0], [{ ref: C, via: 'friend', relationship_type: 'professional_relationship', role: 'friend' }]);
});

test('a path can legitimately traverse a shared organisation node (employee_at/member_of), citing it as its own hop', () => {
  const peopleWithRelationships = [
    personEntry(A, 'Alice', [
      outgoingRel({ sourceRef: A, targetRef: ORG, targetKind: 'organisation', targetLabel: 'UNSW', relationshipType: 'employee_at' })
    ]),
    personEntry(B, 'Bob', [
      outgoingRel({ sourceRef: B, targetRef: ORG, targetKind: 'organisation', targetLabel: 'UNSW', relationshipType: 'employee_at' })
    ])
  ];

  const paths = findIntroductionPaths(peopleWithRelationships, A, B);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0], [
    { ref: ORG, via: 'employee at UNSW', relationship_type: 'employee_at', role: null },
    { ref: B, via: 'employee at UNSW', relationship_type: 'employee_at', role: null }
  ]);
});

test('an ended (non-current) link is never traversed', () => {
  const peopleWithRelationships = [
    personEntry(A, 'Alice', [
      outgoingRel({ sourceRef: A, targetRef: B, targetLabel: 'Bob', relationshipType: 'professional_relationship', role: 'mentor', status: 'ended' })
    ])
  ];

  const paths = findIntroductionPaths(peopleWithRelationships, A, B);
  assert.deepEqual(paths, []);
});

test('no path found returns an empty array, not an error', () => {
  const peopleWithRelationships = [
    personEntry(A, 'Alice', [
      outgoingRel({ sourceRef: A, targetRef: B, targetLabel: 'Bob', relationshipType: 'professional_relationship', role: 'mentor' })
    ]),
    personEntry(D, 'Dan', [])
  ];

  const paths = findIntroductionPaths(peopleWithRelationships, A, D);
  assert.deepEqual(paths, []);
});

test('from === to returns an empty array', () => {
  const peopleWithRelationships = [personEntry(A, 'Alice', [])];
  assert.deepEqual(findIntroductionPaths(peopleWithRelationships, A, A), []);
});

test('an unknown ref returns an empty array', () => {
  const peopleWithRelationships = [personEntry(A, 'Alice', [])];
  assert.deepEqual(findIntroductionPaths(peopleWithRelationships, A, 'shared:person:nobody'), []);
});

test('path count is capped even when many equally-short paths exist', () => {
  const Z = 'shared:person:zara';
  const fanSize = 5;
  const peopleWithRelationships = [];
  const fanRefs = [];
  for (let i = 0; i < fanSize; i += 1) {
    const bridgeRef = `shared:person:bridge${i}`;
    fanRefs.push(bridgeRef);
    peopleWithRelationships.push(
      personEntry(A, 'Alice', [
        outgoingRel({ sourceRef: A, targetRef: bridgeRef, targetLabel: `Bridge ${i}`, relationshipType: 'professional_relationship', role: 'colleague' })
      ]),
      personEntry(bridgeRef, `Bridge ${i}`, [
        outgoingRel({ sourceRef: bridgeRef, targetRef: Z, targetLabel: 'Zara', relationshipType: 'professional_relationship', role: 'colleague' })
      ])
    );
  }

  const paths = findIntroductionPaths(peopleWithRelationships, A, Z);
  assert.ok(fanSize > MAX_INTRODUCTION_PATHS, 'fixture must offer more equally-short paths than the cap');
  assert.equal(paths.length, MAX_INTRODUCTION_PATHS);
  // Every returned path is a genuine shortest (2-hop) path, not padding.
  for (const path of paths) {
    assert.equal(path.length, 2);
    assert.equal(path[1].ref, Z);
    assert.ok(fanRefs.includes(path[0].ref));
  }
});

test('respects maxHops — a path longer than maxHops intermediate people is not returned', () => {
  const peopleWithRelationships = [
    personEntry(A, 'Alice', [
      outgoingRel({ sourceRef: A, targetRef: B, targetLabel: 'Bob', relationshipType: 'professional_relationship', role: 'colleague' })
    ]),
    personEntry(B, 'Bob', [
      outgoingRel({ sourceRef: B, targetRef: C, targetLabel: 'Carol', relationshipType: 'professional_relationship', role: 'colleague' })
    ]),
    personEntry(C, 'Carol', [
      outgoingRel({ sourceRef: C, targetRef: D, targetLabel: 'Dan', relationshipType: 'professional_relationship', role: 'colleague' })
    ])
  ];

  // A -> B -> C -> D is 2 intermediate people (B, C).
  const withEnoughHops = findIntroductionPaths(peopleWithRelationships, A, D, { maxHops: 2 });
  assert.equal(withEnoughHops.length, 1);

  const withTooFewHops = findIntroductionPaths(peopleWithRelationships, A, D, { maxHops: 1 });
  assert.deepEqual(withTooFewHops, []);
});
