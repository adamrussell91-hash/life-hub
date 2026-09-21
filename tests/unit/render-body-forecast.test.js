import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBody } from '../../apps/life/js/app/render-body.js';

function el() {
  const node = {
    className: '',
    textContent: '',
    dataset: {},
    children: [],
    style: {},
    attributes: {},
    listeners: [],
    classList: {
      contains(name) {
        return (node.className || '').split(/\s+/).includes(name);
      },
      toggle() {}
    },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  return node;
}

function findByClass(node, className) {
  if (node.classList?.contains(className)) return node;
  for (const child of node.children ?? []) {
    const hit = findByClass(child, className);
    if (hit) return hit;
  }
  return null;
}

function textOf(node) {
  return [node.textContent, ...(node.children ?? []).map(textOf)].filter(Boolean).join(' ');
}

test('Body renders a useful live forecast surface rather than raw forecast JSON', () => {
  const dashboard = el();
  const host = el();
  const ranges = el();
  ranges.querySelectorAll = () => [];
  const root = {
    createElement: () => el(),
    querySelector(selector) {
      if (selector === '#body-dashboard') return dashboard;
      if (selector === '#body-sections') return host;
      if (selector === '#body-range-control') return ranges;
      return null;
    }
  };

  const forecast = {
    current: {
      weight_kg: 86.3,
      body_fat_pct: 18.9,
      gaps: {
        weight_to_enter_band_kg: 4.3,
        body_fat_to_enter_band_pct_points: 8.9
      }
    },
    body: {
      as_logged: { status: 'locked' },
      on_plan: { status: 'locked' }
    },
    input_quality: {
      energy_calibration: {
        attempts: [{
          weight: { trend: { observation_count: 2, max_gap_days: 49 } }
        }]
      }
    },
    tape: {
      status: 'dated',
      date: '2027-08-28',
      current_ratio: 1.3034,
      target_ratio: 1.6,
      gap: 0.2966
    },
    lifts: [{
      exercise: 'Bar Press',
      status: 'dated',
      current_e1rm_kg: 60,
      target_e1rm_kg: 65,
      date: '2026-10-24',
      deadline: '2026-10-31'
    }, {
      exercise: 'Cable Bar Wide Grip Curl',
      status: 'locked',
      current_e1rm_kg: 53.2,
      target_e1rm_kg: 60,
      missing: ['1 more comparable hard session']
    }],
    physique_binding: {
      as_logged: { status: 'locked', blockers: ['body_box', 'body_fat_8'] }
    }
  };

  renderBody(root, {
    range: 'six_month',
    scale: { id: 'scale', title: 'Scale', metrics: [] },
    composition: { id: 'composition', title: 'Composition', metrics: [] },
    tape: { id: 'tape', title: 'Tape', metrics: [] }
  }, { forecast });

  const panel = findByClass(host, 'body-forecast');
  assert.ok(panel);
  const text = textOf(panel);
  assert.match(text, /Forecast/);
  assert.match(text, /86\.3 kg/);
  assert.match(text, /18\.9%/);
  assert.match(text, /2\/5 recent weight days/);
  assert.match(text, /Bar Press/);
  assert.match(text, /60 → 65 kg/);
  assert.match(text, /24\/10\/26/);
  assert.match(text, /1 more comparable hard session/);
});
