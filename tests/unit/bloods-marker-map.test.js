import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalMarkerKey } from '../../scripts/lib/bloods-marker-map.mjs';

test('canonicalMarkerKey merges known aliases', () => {
  assert.equal(canonicalMarkerKey('Adj. Calcium'), 'adjusted_calcium');
  assert.equal(canonicalMarkerKey('Adjusted Calcium'), 'adjusted_calcium');
  assert.equal(canonicalMarkerKey('Calcium (Adjusted)'), 'adjusted_calcium');
  assert.equal(canonicalMarkerKey('Corrected Calcium'), 'adjusted_calcium');
  assert.equal(canonicalMarkerKey('Alk. Phosphatase'), 'alp');
  assert.equal(canonicalMarkerKey('Alkaline Phosphatase'), 'alp');
  assert.equal(canonicalMarkerKey('ALP'), 'alp');
  assert.equal(canonicalMarkerKey('Bilirubin'), 'bilirubin_total');
  assert.equal(canonicalMarkerKey('Bilirubin Total'), 'bilirubin_total');
  assert.equal(canonicalMarkerKey('CRP'), 'crp');
  assert.equal(canonicalMarkerKey('C-Reactive Protein'), 'crp');
  assert.equal(canonicalMarkerKey('C-Reactive Protein (CRP)'), 'crp');
  assert.equal(canonicalMarkerKey('Fasting Glucose'), 'fasting_glucose');
  assert.equal(canonicalMarkerKey('Glucose Fasting'), 'fasting_glucose');
  assert.equal(canonicalMarkerKey('Gamma GT'), 'ggt');
  assert.equal(canonicalMarkerKey('GGT'), 'ggt');
  assert.equal(canonicalMarkerKey('Haematocrit'), 'haematocrit');
  assert.equal(canonicalMarkerKey('HCT'), 'haematocrit');
  assert.equal(canonicalMarkerKey('HDL'), 'hdl');
  assert.equal(canonicalMarkerKey('HDL-c'), 'hdl');
  assert.equal(canonicalMarkerKey('LDL'), 'ldl');
  assert.equal(canonicalMarkerKey('LDL-c'), 'ldl');
  assert.equal(canonicalMarkerKey('RBC'), 'rbc');
  assert.equal(canonicalMarkerKey('Red Cell Count'), 'rbc');
  assert.equal(canonicalMarkerKey('Triglyceride'), 'triglycerides');
  assert.equal(canonicalMarkerKey('Triglycerides'), 'triglycerides');
  assert.equal(canonicalMarkerKey('WBC'), 'wcc');
  assert.equal(canonicalMarkerKey('WCC'), 'wcc');
  assert.equal(canonicalMarkerKey('White Cells'), 'wcc');
  assert.equal(canonicalMarkerKey('25-OH Vitamin D'), 'vitamin_d');
  assert.equal(canonicalMarkerKey('Vitamin D (25-hydroxyvitamin D)'), 'vitamin_d');
});

test('canonicalMarkerKey keeps HbA1c NGSP and IFCC as separate keys', () => {
  assert.equal(canonicalMarkerKey('HbA1c'), 'hba1c_ngsp');
  assert.equal(canonicalMarkerKey('HbA1c (NGSP)'), 'hba1c_ngsp');
  assert.equal(canonicalMarkerKey('HbA1c (IFCC)'), 'hba1c_ifcc');
  assert.notEqual(canonicalMarkerKey('HbA1c (NGSP)'), canonicalMarkerKey('HbA1c (IFCC)'));
});

test('canonicalMarkerKey does not merge Calcium with adjusted calcium', () => {
  assert.equal(canonicalMarkerKey('Calcium'), 'calcium');
  assert.notEqual(canonicalMarkerKey('Calcium'), canonicalMarkerKey('Adjusted Calcium'));
});

test('canonicalMarkerKey warns then slugifies unmapped names', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const key = canonicalMarkerKey('Brand New Marker (XYZ)');
    assert.equal(key, 'brand_new_marker_xyz');
    assert.ok(warnings.some(msg => /unmapped blood marker/i.test(msg) && /Brand New Marker \(XYZ\)/.test(msg)));
  } finally {
    console.warn = original;
  }
});

test('canonicalMarkerKey is case- and whitespace-insensitive for aliases', () => {
  assert.equal(canonicalMarkerKey('  crp  '), 'crp');
  assert.equal(canonicalMarkerKey('gamma  gt'), 'ggt');
});
