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

test('removeFromRoutine calls API, reports success, and publishes membership', async () => {
  const root = createRoot();
  const calls = [];
  const changes = [];
  const membership = { schema_version: 1, am: { product_ids: [] }, pm: { product_ids: [] } };
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async removeFromRoutine(args) {
        calls.push(args);
        return membership;
      }
    },
    onShelfChanged: value => changes.push(value),
    isOnline: () => true
  });

  const result = await controller.onRemoveFromRoutine({ routine: 'am', productId: 'serum' });

  assert.equal(result, membership);
  assert.deepEqual(calls, [{ routine: 'am', productId: 'serum' }]);
  assert.deepEqual(changes, [{ membership }]);
  assert.equal(root.status.textContent, 'Removed from routine');
});

test('addFromLibrary adds each product id and publishes the last membership', async () => {
  const root = createRoot();
  const calls = [];
  const changes = [];
  const memberships = [
    { schema_version: 1, am: { product_ids: ['a'] }, pm: { product_ids: [] } },
    { schema_version: 1, am: { product_ids: ['a', 'b'] }, pm: { product_ids: [] } }
  ];
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async addToRoutine(args) {
        calls.push(args);
        return memberships[calls.length - 1];
      }
    },
    onShelfChanged: value => changes.push(value),
    isOnline: () => true
  });

  const result = await controller.onAddFromLibrary({
    routine: 'am',
    productIds: ['a', 'b']
  });

  assert.equal(result, memberships[1]);
  assert.deepEqual(calls, [
    { routine: 'am', productId: 'a' },
    { routine: 'am', productId: 'b' }
  ]);
  assert.deepEqual(changes, [{ membership: memberships[1] }]);
  assert.equal(root.status.textContent, 'Added to routine');
});

test('addFromLibrary with empty productIds does not touch API or shelf', async () => {
  const root = createRoot();
  let apiCalls = 0;
  const changes = [];
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async addToRoutine() { apiCalls += 1; }
    },
    onShelfChanged: value => changes.push(value),
    isOnline: () => true
  });

  const emptyResult = await controller.onAddFromLibrary({ routine: 'am', productIds: [] });
  const missingResult = await controller.onAddFromLibrary({ routine: 'am' });

  assert.equal(emptyResult, undefined);
  assert.equal(missingResult, undefined);
  assert.equal(apiCalls, 0);
  assert.deepEqual(changes, []);
  assert.notEqual(root.status.textContent, 'Added to routine');
});

test('addFromLibrary publishes last successful membership when a later add fails', async () => {
  const root = createRoot();
  const calls = [];
  const changes = [];
  const firstMembership = {
    schema_version: 1,
    am: { product_ids: ['a'] },
    pm: { product_ids: [] }
  };
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async addToRoutine(args) {
        calls.push(args);
        if (args.productId === 'b') throw new Error('add failed');
        return firstMembership;
      }
    },
    onShelfChanged: value => changes.push(value),
    isOnline: () => true
  });

  const result = await controller.onAddFromLibrary({
    routine: 'am',
    productIds: ['a', 'b']
  });

  assert.equal(result, undefined);
  assert.deepEqual(calls, [
    { routine: 'am', productId: 'a' },
    { routine: 'am', productId: 'b' }
  ]);
  assert.deepEqual(changes, [{ membership: firstMembership }]);
  assert.equal(root.status.textContent, 'Couldn’t update routine — try again.');
});

test('createProduct with keep saves to library then adds to routine', async () => {
  const root = createRoot();
  const apiCalls = [];
  const changes = [];
  const library = {
    schema_version: 1,
    products: [{ id: 'new-serum', name: 'New Serum', notes: '' }]
  };
  const membership = {
    schema_version: 1,
    am: { product_ids: ['new-serum'] },
    pm: { product_ids: [] }
  };
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async saveLibraryEntry(args) {
        apiCalls.push(['saveLibraryEntry', args]);
        return library;
      },
      async addToRoutine(args) {
        apiCalls.push(['addToRoutine', args]);
        return membership;
      }
    },
    onShelfChanged: value => changes.push(value),
    isOnline: () => true
  });

  const result = await controller.onCreateProduct({
    routine: 'am',
    name: 'New Serum',
    keep: true
  });

  assert.deepEqual(result, { library, membership });
  assert.deepEqual(apiCalls, [
    ['saveLibraryEntry', { name: 'New Serum', category: 'Serum', status: 'in_use' }],
    ['addToRoutine', { routine: 'am', productId: 'new-serum' }]
  ]);
  assert.deepEqual(changes, [{ library, membership }]);
  assert.equal(root.status.textContent, 'Added to routine');
});

test('createProduct keep publishes library when addToRoutine fails', async () => {
  const root = createRoot();
  const changes = [];
  const library = {
    schema_version: 1,
    products: [{ id: 'new-serum', name: 'New Serum', notes: '' }]
  };
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async saveLibraryEntry() {
        return library;
      },
      async addToRoutine() {
        throw new Error('add failed');
      }
    },
    onShelfChanged: value => changes.push(value),
    isOnline: () => true
  });

  const result = await controller.onCreateProduct({
    routine: 'am',
    name: 'New Serum',
    keep: true
  });

  assert.equal(result, undefined);
  assert.deepEqual(changes, [{ library }]);
  assert.equal(root.status.textContent, 'Couldn’t update routine — try again.');
});

test('createProduct without keep returns a one-off without API calls', async () => {
  const root = createRoot();
  let apiCalls = 0;
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async saveLibraryEntry() { apiCalls += 1; },
      async addToRoutine() { apiCalls += 1; }
    },
    onShelfChanged: () => {
      throw new Error('shelf should not change for one-off create');
    },
    isOnline: () => true
  });

  const result = await controller.onCreateProduct({
    routine: 'pm',
    name: 'One Off Oil',
    keep: false
  });

  assert.deepEqual(result, { oneOff: true, name: 'One Off Oil' });
  assert.equal(apiCalls, 0);
});

test('shelf updates report an offline status without making API requests', async () => {
  const root = createRoot();
  let apiCalls = 0;
  const controller = createSkincareController({
    root,
    chatApi: { confirm() {} },
    skincareApi: {
      async removeFromRoutine() { apiCalls += 1; },
      async addToRoutine() { apiCalls += 1; },
      async saveLibraryEntry() { apiCalls += 1; }
    },
    isOnline: () => false
  });

  await controller.onRemoveFromRoutine({ routine: 'am', productId: 'serum' });
  await controller.onAddFromLibrary({ routine: 'am', productIds: ['serum'] });
  await controller.onCreateProduct({ routine: 'am', name: 'Serum', keep: true });

  assert.equal(apiCalls, 0);
  assert.equal(root.status.textContent, 'Connect to update routine.');
});

test('onLogRoutine returns the save promise so callers can await settle', async () => {
  const root = createRoot();
  let resolveConfirm;
  const confirmPromise = new Promise(resolve => { resolveConfirm = resolve; });
  const written = [];
  const controller = createSkincareController({
    root,
    chatApi: {
      confirm() {
        return confirmPromise;
      }
    },
    skincareApi: {},
    onRecordWritten: value => written.push(value),
    isOnline: () => true
  });

  const pending = controller.onLogRoutine({
    payload: {
      candidate: { type: 'skincare', date: '2026-08-11', routine: 'am', products: ['Serum'] },
      slug: 'am',
      overwrite: true
    }
  });

  assert.equal(typeof pending?.then, 'function', 'onLogRoutine must return a thenable');
  assert.equal(root.status.textContent, 'Saving…');
  assert.equal(written.length, 0);

  resolveConfirm({ ok: true });
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(written.length, 1);
  assert.equal(root.status.textContent, 'Logged ✨');
});

test('onLogProcedure returns the save promise', async () => {
  const root = createRoot();
  const controller = createSkincareController({
    root,
    chatApi: {
      async confirm() {
        return { ok: true };
      }
    },
    skincareApi: {},
    isOnline: () => true
  });

  const result = await controller.onLogProcedure({
    payload: {
      candidate: { type: 'skincare', date: '2026-08-11', routine: 'pm', products: ['Laser'] },
      overwrite: true
    }
  });
  assert.equal(result.ok, true);
});
