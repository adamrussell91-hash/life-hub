/**
 * MO-10 — Sara medical behaviour fixtures (payload → record pipeline).
 * Conversational behaviour remains Not started until a live chat turn is run.
 * Format: docs/AGENT_BEHAVIOUR_ACCEPTANCE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import {
  inferRecordType,
  joinOrCreateEpisode,
  normalizeMedicalFields,
  resolveMedicalLogCandidate
} from '../../apps/life/js/app/medical-normalize.js';
import { buildMedicalModel, deriveVirtualDoses } from '../../apps/life/js/app/medical-model.js';
import { validateLogEntry } from '../../netlify/functions/_shared/chat-schema.mjs';

const TODAY = '2026-09-26';

test('fixture: "my throat is sore" → Symptom minor + new active episode', () => {
  const fields = normalizeMedicalFields(
    { title: 'Sore throat' },
    { notes: 'my throat is sore', today: TODAY, activeEpisodes: [] }
  );
  assert.equal(fields.record_type, 'Symptom');
  assert.equal(fields.weight, 'minor');
  assert.equal(fields.episode?.status, 'active');
  assert.equal(fields.episode?.started, TODAY);

  const validated = validateLogEntry({
    type: 'medical',
    date: TODAY,
    notes: 'my throat is sore — viral likely',
    fields: { title: 'Sore throat', record_type: 'Symptom', weight: 'minor', episode: fields.episode }
  }, { id: 'fix-sore', now: `${TODAY}T12:00:00+10:00` });
  assert.equal(validated.valid, true, JSON.stringify(validated.errors));
});

test('fixture: "still congested" with active Head cold → new dated Symptom same episode', async () => {
  const yaml = `---
schema_version: 1
id: "sore-24"
type: "medical"
date: "2026-09-24"
time: "09:00"
created_at: "2026-09-24T09:00:00+10:00"
updated_at: "2026-09-24T09:00:00+10:00"
source: "chat"
title: "Sore throat, sniffles, poor sleep"
record_type: "Symptom"
lane: "symptom"
weight: "minor"
episode:
  id: "ep-head-cold"
  title: "Head cold"
  status: "active"
  started: "2026-09-23"
---
Sore throat, sniffles
`;
  const client = {
    resolveTree: async () => ({
      tree: [{
        type: 'blob',
        path: 'data/body/2026/09/2026-09-24-medical-sore-throat-0900.md',
        sha: 'sha'
      }]
    }),
    readBlob: async () => new TextEncoder().encode(yaml).buffer
  };
  const resolved = await resolveMedicalLogCandidate(client, {
    type: 'medical',
    date: TODAY,
    notes: 'still congested, throat better',
    fields: { title: 'Still congested, throat better', record_type: 'Symptom' }
  }, {
    today: TODAY,
    loadYaml: load,
    decodeBlob: bytes => new TextDecoder().decode(bytes)
  });
  assert.equal(resolved.date, TODAY);
  assert.equal(resolved.fields.episode.id, 'ep-head-cold');
  // 24/09 record unchanged — we create a new candidate, not a merge onto 24/09.
  assert.notEqual(resolved.date, '2026-09-24');
});

test('fixture: gastro visit + planned MRCP/colonoscopy/March review payloads', () => {
  const visit = validateLogEntry({
    type: 'medical',
    date: '2026-09-24',
    notes: 'calpro 15, MRCP ordered',
    fields: {
      title: 'Gastro follow-up — biologics & liver',
      record_type: 'Consultation',
      weight: 'major',
      provider: 'Dr Chris Keily'
    }
  }, { id: 'gastro', now: `${TODAY}T12:00:00+10:00` });
  assert.equal(visit.valid, true);

  const mrcp = validateLogEntry({
    type: 'medical',
    date: TODAY,
    notes: 'Ordered 24 Sep — exclude PSC',
    fields: {
      title: 'MRCP — liver / bile ducts',
      status: 'to_book',
      date_precision: 'tbd',
      weight: 'major'
    }
  }, { id: 'mrcp', now: `${TODAY}T12:00:00+10:00` });
  assert.equal(mrcp.valid, true);
  assert.equal(mrcp.record.status, 'to_book');

  const colo = validateLogEntry({
    type: 'medical',
    date: '2027-02-01',
    fields: {
      title: 'Colonoscopy',
      status: 'planned',
      date_precision: 'month',
      weight: 'major'
    }
  }, { id: 'colo', now: `${TODAY}T12:00:00+10:00` });
  assert.equal(colo.valid, true);
  assert.equal(colo.record.date_precision, 'month');

  const review = validateLogEntry({
    type: 'medical',
    date: '2027-03-01',
    fields: {
      title: 'Gastro review — Dr Chris Keily',
      status: 'planned',
      date_precision: 'month',
      weight: 'major'
    }
  }, { id: 'review', now: `${TODAY}T12:00:00+10:00` });
  assert.equal(review.valid, true);
});

test('fixture: Stelara today → cadence 56 + virtual next dose', () => {
  const dose = validateLogEntry({
    type: 'medical',
    date: TODAY,
    notes: 'had my Stelara today',
    fields: {
      title: 'Stelara 90mg',
      record_type: 'Prescription',
      weight: 'major',
      cadence_days: 56
    }
  }, { id: 'stelara', now: `${TODAY}T12:00:00+10:00` });
  assert.equal(dose.valid, true);
  assert.equal(dose.record.cadence_days, 56);

  const virtuals = deriveVirtualDoses([{
    id: dose.record.id,
    date: dose.record.date,
    title: dose.record.title,
    cadence_days: 56,
    notes: '',
    planned: false,
    virtual: false
  }], TODAY);
  assert.equal(virtuals.length, 1);
  assert.equal(virtuals[0].virtual, true);
});

test('fixture: colds gone → episode resolved', () => {
  const episode = joinOrCreateEpisode(
    {
      title: 'Cold resolved',
      record_type: 'Symptom',
      date: TODAY,
      episode: {
        id: 'ep-head-cold',
        title: 'Head cold',
        status: 'resolved',
        started: '2026-09-23',
        resolved: TODAY
      }
    },
    { today: TODAY }
  );
  assert.equal(episode.status, 'resolved');
  assert.equal(episode.resolved, TODAY);
});

test('inferRecordType: sore without provider → Symptom', () => {
  assert.equal(inferRecordType('', 'Sore throat', 'my throat is sore'), 'Symptom');
});
