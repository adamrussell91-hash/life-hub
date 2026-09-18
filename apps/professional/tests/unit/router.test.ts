import { describe, expect, it } from 'vitest';
import { organisationRoute, parseRoute, personBriefRoute, personRoute, railHighlightFor } from '@/app/router';

const VALID_PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const VALID_ORG_ID = 'organisation_00000000-0000-4000-8000-000000000002';

describe('parseRoute', () => {
  it('defaults an empty or root hash to Home', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#')).toEqual({ name: 'home' });
  });

  it('parses each flat destination', () => {
    expect(parseRoute('#/home')).toEqual({ name: 'home' });
    expect(parseRoute('#/people')).toEqual({ name: 'people' });
    expect(parseRoute('#/organisations')).toEqual({ name: 'organisations' });
    expect(parseRoute('#/relationships')).toEqual({ name: 'relationships' });
    expect(parseRoute('#/communications')).toEqual({ name: 'communications' });
  });

  it('parses the Network Ecology route', () => {
    expect(parseRoute('#/network-ecology')).toEqual({ name: 'network-ecology' });
  });

  it('parses a valid person/organisation id into a detail route', () => {
    expect(parseRoute(`#/person/${VALID_PERSON_ID}`)).toEqual({ name: 'person', id: VALID_PERSON_ID });
    expect(parseRoute(`#/organisation/${VALID_ORG_ID}`)).toEqual({ name: 'organisation', id: VALID_ORG_ID });
  });

  it('rejects an id that does not match the server contract shape', () => {
    expect(parseRoute('#/person/not-a-real-id')).toEqual({ name: 'not-found', path: 'person/not-a-real-id' });
    expect(parseRoute('#/organisation/123')).toEqual({ name: 'not-found', path: 'organisation/123' });
  });

  it('parses the 3-segment Person Brief route', () => {
    expect(parseRoute(`#/person/${VALID_PERSON_ID}/brief`)).toEqual({ name: 'person-brief', id: VALID_PERSON_ID });
  });

  it('rejects a Person Brief route with an invalid person id', () => {
    expect(parseRoute('#/person/not-a-real-id/brief')).toEqual({
      name: 'not-found',
      path: 'person/not-a-real-id/brief'
    });
  });

  it('does not treat an arbitrary 3rd segment as a Person Brief route', () => {
    expect(parseRoute(`#/person/${VALID_PERSON_ID}/edit`)).toEqual({
      name: 'not-found',
      path: `person/${VALID_PERSON_ID}/edit`
    });
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
    expect(railHighlightFor({ name: 'home' })).toBe('home');
    expect(railHighlightFor({ name: 'not-found', path: 'x' })).toBeNull();
  });

  it('maps the Person Brief route to the same rail item as Person/People', () => {
    expect(railHighlightFor({ name: 'person-brief', id: VALID_PERSON_ID })).toBe('people');
  });

  it('maps the Network Ecology route to its own rail item', () => {
    expect(railHighlightFor({ name: 'network-ecology' })).toBe('network-ecology');
  });
});

describe('route builders', () => {
  it('encode the id into the hash', () => {
    expect(personRoute(VALID_PERSON_ID)).toBe(`#/person/${VALID_PERSON_ID}`);
    expect(organisationRoute(VALID_ORG_ID)).toBe(`#/organisation/${VALID_ORG_ID}`);
  });

  it('personBriefRoute encodes the id into the 3-segment hash', () => {
    expect(personBriefRoute(VALID_PERSON_ID)).toBe(`#/person/${VALID_PERSON_ID}/brief`);
  });
});
