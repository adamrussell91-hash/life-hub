import { describe, expect, it } from 'vitest';
import { organisationRoute, parseRoute, personRoute, railHighlightFor } from '@/app/router';

const VALID_PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const VALID_ORG_ID = 'organisation_00000000-0000-4000-8000-000000000002';

describe('parseRoute', () => {
  it('defaults an empty or root hash to People', () => {
    expect(parseRoute('')).toEqual({ name: 'people' });
    expect(parseRoute('#/')).toEqual({ name: 'people' });
    expect(parseRoute('#')).toEqual({ name: 'people' });
  });

  it('parses each flat destination', () => {
    expect(parseRoute('#/people')).toEqual({ name: 'people' });
    expect(parseRoute('#/organisations')).toEqual({ name: 'organisations' });
    expect(parseRoute('#/relationships')).toEqual({ name: 'relationships' });
    expect(parseRoute('#/communications')).toEqual({ name: 'communications' });
  });

  it('parses a valid person/organisation id into a detail route', () => {
    expect(parseRoute(`#/person/${VALID_PERSON_ID}`)).toEqual({ name: 'person', id: VALID_PERSON_ID });
    expect(parseRoute(`#/organisation/${VALID_ORG_ID}`)).toEqual({ name: 'organisation', id: VALID_ORG_ID });
  });

  it('rejects an id that does not match the server contract shape', () => {
    expect(parseRoute('#/person/not-a-real-id')).toEqual({ name: 'not-found', path: 'person/not-a-real-id' });
    expect(parseRoute('#/organisation/123')).toEqual({ name: 'not-found', path: 'organisation/123' });
  });

  it('never lets a raw path separator survive as part of an id', () => {
    expect(parseRoute('#/person/../../etc/passwd')).toEqual({ name: 'not-found', path: 'person/../../etc/passwd' });
    expect(parseRoute(`#/person/${encodeURIComponent('../../etc/passwd')}`).name).toBe('not-found');
  });

  it('never lets an encoded traversal sequence decode into an id', () => {
    // %2F decodes to "/", %2E%2E decodes to ".." — both must still be rejected.
    const encoded = `#/person/${VALID_PERSON_ID}%2F..%2Fescape`;
    expect(parseRoute(encoded).name).toBe('not-found');
  });

  it('falls back to not-found for an unrecognised path', () => {
    expect(parseRoute('#/nonexistent')).toEqual({ name: 'not-found', path: 'nonexistent' });
  });
});

describe('railHighlightFor', () => {
  it('maps person/organisation detail routes back to their list destination', () => {
    expect(railHighlightFor({ name: 'person', id: VALID_PERSON_ID })).toBe('people');
    expect(railHighlightFor({ name: 'organisation', id: VALID_ORG_ID })).toBe('organisations');
    expect(railHighlightFor({ name: 'people' })).toBe('people');
    expect(railHighlightFor({ name: 'not-found', path: 'x' })).toBeNull();
  });
});

describe('route builders', () => {
  it('encode the id into the hash', () => {
    expect(personRoute(VALID_PERSON_ID)).toBe(`#/person/${VALID_PERSON_ID}`);
    expect(organisationRoute(VALID_ORG_ID)).toBe(`#/organisation/${VALID_ORG_ID}`);
  });
});
