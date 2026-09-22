import test from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../lib/cache.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

// 同一个缓存实例，时钟用闭包变量控制，才能真的模拟"过一会儿再读"。
function harness(extra = {}) {
  let current = NOW;
  const store = createCache({ capacity: 5, ttlMs: 1000, clock: () => current, ...extra });
  return { store, at: (offset) => { current = NOW + offset; } };
}

test('到点之前是命中，到点那一刻就算过期', () => {
  const { store, at } = harness();
  store.set('a', 1);
  at(999);
  assert.equal(store.get('a'), 1);
  at(1000);
  assert.equal(store.get('a'), undefined);
});

test('读到过期条目算一次 miss 加一次过期清理，has 不重复计', () => {
  const { store, at } = harness();
  store.set('a', 1);
  at(1000);
  assert.equal(store.get('a'), undefined);
  assert.deepEqual(store.stats(), { hits: 0, misses: 1, evictions: 0, expirations: 1, size: 0 });
  assert.equal(store.has('a'), false);
  assert.deepEqual(store.stats(), { hits: 0, misses: 1, evictions: 0, expirations: 1, size: 0 });
});

test('ttlMs 给 0 表示这格永不过期', () => {
  const { store, at } = harness();
  store.set('a', 1);
  store.set('forever', 2, { ttlMs: 0 });
  at(10 * 60000);
  assert.equal(store.get('a'), undefined);
  assert.equal(store.get('forever'), 2);
  assert.equal(store.stats().expirations, 1);
});

test('每次 set 都能单独指定 ttl', () => {
  const { store, at } = harness();
  store.set('short', 1, { ttlMs: 100 });
  store.set('long', 2, { ttlMs: 10000 });
  at(200);
  assert.equal(store.get('short'), undefined);
  assert.equal(store.get('long'), 2);
});

test('prune 和 keys 都会顺手清掉过期条目', () => {
  const { store, at } = harness();
  store.set('a', 1);
  store.set('b', 2);
  store.set('c', 3, { ttlMs: 5000 });
  at(1000);
  assert.deepEqual(store.keys(), ['c']);
  assert.equal(store.stats().expirations, 2);
  assert.equal(store.prune(), 0);
  store.set('d', 4);
  at(3000);
  assert.equal(store.prune(), 1);
  assert.equal(store.stats().expirations, 3);
  assert.deepEqual(store.keys(), ['c']);
});

test('过期条目在被发现之前仍占容量', () => {
  const { store, at } = harness({ capacity: 2 });
  store.set('a', 1);
  store.set('b', 2);
  at(1000);
  assert.equal(store.size(), 2);
  assert.deepEqual(store.set('c', 3), { evicted: ['a'] });
  assert.equal(store.stats().size, 2);
  assert.equal(store.has('b'), false);
  assert.equal(store.stats().expirations, 1);
  assert.deepEqual(store.keys(), ['c']);
});

test('命中统计只在 get 上算', () => {
  const { store } = harness();
  store.set('a', 1);
  assert.equal(store.has('a'), true);
  assert.equal(store.get('a'), 1);
  assert.equal(store.get('nope'), undefined);
  assert.deepEqual(store.stats(), { hits: 1, misses: 1, evictions: 0, expirations: 0, size: 1 });
});
