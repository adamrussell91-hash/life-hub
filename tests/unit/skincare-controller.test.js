import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkincareController } from '../../js/app/skincare-controller.js';

class FakeStatus {
  constructor() {
    this.textContent = '';
    this.hidden = true;
    this.dataset = {};
    this.classList = { add() {}, remove() {} };
    this.style = {};
  }
}

function createRoot() {
  const status = new FakeStatus();
  return {
    status,
    querySelector(selector) {
      return selector === '#skincare-status' ? status : null;
    }
  };
}

test('adding a kept product saves it, reports success, and publishes the catalog', async () => {
  const root = createRoot();
  const calls = [];
  const changes = [];
  const catalog = { am: { products: ['Cleanser', 'Serum'] } };
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async appendProduct(args) {
        calls.push(args);
        return catalog;
      }
    },
    onCatalogChanged: value => changes.push(value),
    isOnline: () => true
  });

  const result = await controller.onAddProduct({ routine: 'am', name: 'Serum', keep: true });

  assert.equal(result, catalog);
  assert.deepEqual(calls, [{ routine: 'am', name: 'Serum' }]);
  assert.deepEqual(changes, [catalog]);
  assert.equal(root.status.textContent, 'Added to routine');
});

test('retiring a product saves it, reports success, and publishes the catalog', async () => {
  const root = createRoot();
  const calls = [];
  const changes = [];
  const catalog = { pm: { products: ['Retinol'], retired: ['Moisturizer'] } };
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async retireProduct(args) {
        calls.push(args);
        return catalog;
      }
    },
    onCatalogChanged: value => changes.push(value),
    isOnline: () => true
  });

  const result = await controller.onRetireProduct({ routine: 'pm', name: 'Moisturizer' });

  assert.equal(result, catalog);
  assert.deepEqual(calls, [{ routine: 'pm', name: 'Moisturizer' }]);
  assert.deepEqual(changes, [catalog]);
  assert.equal(root.status.textContent, 'Removed from rotation');
});

test('adding a retired product reports restore-unavailable status', async () => {
  const root = createRoot();
  let apiCalls = 0;
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async appendProduct() {
        apiCalls += 1;
        throw Object.assign(new Error('retired'), { code: 'retired_product', status: 400 });
      }
    },
    onCatalogChanged: () => {
      throw new Error('catalog should not change for retired append');
    },
    isOnline: () => true
  });

  const result = await controller.onAddProduct({ routine: 'am', name: 'Old Serum', keep: true });

  assert.equal(result, undefined);
  assert.equal(apiCalls, 1);
  assert.equal(root.status.textContent, 'That product was retired — restore not available yet');
});

test('catalog updates report an offline status without making API requests', async () => {
  const root = createRoot();
  let apiCalls = 0;
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async appendProduct() { apiCalls += 1; },
      async retireProduct() { apiCalls += 1; }
    },
    isOnline: () => false
  });

  await controller.onAddProduct({ routine: 'am', name: 'Serum', keep: true });
  await controller.onRetireProduct({ routine: 'am', name: 'Cleanser' });

  assert.equal(apiCalls, 0);
  assert.equal(root.status.textContent, 'Connect to update routine.');
});
