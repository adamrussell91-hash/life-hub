import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  listMedicalPlaceLabels,
  mapPlacesFromMedicalVisits,
  parseMapPlacesPayload
} from '../../packages/design-kit/js/hub-places-map.js';
import { classifyClipboardData, suggestIngestTarget } from '../../packages/design-kit/js/hub-rich-paste.js';

describe('map_places payload', () => {
  it('accepts a trusted agent constellation and rejects foreign types', () => {
    const ok = parseMapPlacesPayload({
      type: 'map_places',
      focus: 'a',
      places: [
        { id: 'a', name: 'North Shore Private', lng: 151.19, lat: -33.82, kind: 'medical' },
        { id: 'b', name: 'Prosper Nutrition', lng: 151.17, lat: -33.81 }
      ]
    });
    assert.equal(ok?.places.length, 2);
    assert.equal(ok?.focus, 'a');
    assert.equal(
      parseMapPlacesPayload({
        type: 'map_style',
        places: [{ id: 'a', name: 'x', lng: 1, lat: 2 }]
      }),
      null
    );
    assert.equal(parseMapPlacesPayload({ type: 'map_places', places: [{ id: 'x', name: 'no coords' }] }), null);
  });

  it('builds medical places only when coordinates are known', () => {
    const visits = [
      { id: 'v1', location: 'North Shore Private Hospital', location_kind: 'place' },
      { id: 'v2', location: 'North Shore Private Hospital', location_kind: 'place' },
      { id: 'v3', location: 'Telehealth', location_kind: 'telehealth' },
      { id: 'v4', location: 'Unknown Clinic', location_kind: 'place' }
    ];
    const labels = listMedicalPlaceLabels(visits);
    assert.equal(labels.length, 2);
    assert.equal(labels.find((l) => l.name.includes('North Shore'))?.visitIds.length, 2);

    const mapped = mapPlacesFromMedicalVisits(visits, {
      coordsByLocation: {
        'north shore private hospital': { lng: 151.1936, lat: -33.8225 }
      }
    });
    assert.equal(mapped?.places.length, 1);
    assert.equal(mapped?.places[0].visitIds.length, 2);
    assert.equal(mapPlacesFromMedicalVisits(visits), null);
  });
});

describe('capture inbox routing hints', () => {
  it('suggests knowledge for shared PDF URLs', () => {
    const payload = classifyClipboardData({
      files: [],
      getData: (type) => (type === 'text/plain' ? 'https://example.com/report.pdf' : '')
    });
    assert.equal(payload.kind, 'url');
    assert.equal(payload.subtype, 'pdf');
    const tip = suggestIngestTarget(payload, { currentHub: 'life' });
    assert.equal(tip?.hub, 'knowledge');
  });

  it('prefers Share Target url param over mixed title/text bodies', async () => {
    // Mirrors capture-inbox classifyShare precedence without DOM.
    const share = {
      title: 'Bloods PDF',
      text: 'Lab results PDF',
      url: 'https://example.com/report.pdf',
      files: []
    };
    const urlCandidate =
      (share.url || '').trim() ||
      ((share.text || '').trim().match(/^(https?:\/\/\S+)$/i)?.[1] ?? '');
    const payload = classifyClipboardData({
      files: [],
      getData: (type) => (type === 'text/plain' ? urlCandidate : '')
    });
    assert.equal(payload.kind, 'url');
    assert.equal(payload.subtype, 'pdf');
    assert.equal(suggestIngestTarget(payload, { currentHub: 'life' })?.hub, 'knowledge');
  });
});
