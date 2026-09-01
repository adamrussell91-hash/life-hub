import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMealProteinPie } from '../../apps/life/js/app/render-nutrition.js';

function makeRoot() {
  const empty = { hidden: true, removeAttribute(name) { if (name === 'hidden') this.hidden = false; }, setAttribute(name) { if (name === 'hidden') this.hidden = true; } };
  const slices = { replaceChildren(...nodes) { this.children = nodes; }, children: [] };
  const legend = { replaceChildren(...nodes) { this.children = nodes; }, children: [] };
  const svg = {
    querySelector(sel) {
      if (sel === '[data-role="slices"]') return slices;
      return null;
    },
    setAttribute() {},
    removeAttribute() {}
  };
  const created = [];
  return {
    empty,
    slices,
    legend,
    created,
    querySelector(sel) {
      if (sel === '#nutrition-meal-protein-pie') return svg;
      if (sel === '[data-meal-protein-empty]') return empty;
      if (sel === '[data-role="meal-protein-legend"]') return legend;
      return null;
    },
    createElementNS(_ns, tag) {
      const el = { tag, attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; } };
      created.push(el);
      return el;
    },
    createElement(tag) {
      const el = { tag, textContent: '', children: [], className: '', style: {}, append(...nodes) { this.children.push(...nodes); } };
      created.push(el);
      return el;
    }
  };
}

test('renderMealProteinPie shows empty state when no protein', () => {
  const root = makeRoot();
  renderMealProteinPie(root, {
    breakfast: { protein_g: 0 }, lunch: { protein_g: 0 }, dinner: { protein_g: 0 }, snack: { protein_g: 0 }
  });
  assert.equal(root.empty.hidden, false);
  assert.equal(root.slices.children.length, 0);
});

test('renderMealProteinPie draws slices and legend for meals with protein', () => {
  const root = makeRoot();
  renderMealProteinPie(root, {
    breakfast: { protein_g: 30 }, lunch: { protein_g: 40 }, dinner: { protein_g: 0 }, snack: { protein_g: 0 }
  });
  assert.equal(root.empty.hidden, true);
  assert.equal(root.slices.children.length, 2);
  assert.equal(root.legend.children.length, 2);
});
