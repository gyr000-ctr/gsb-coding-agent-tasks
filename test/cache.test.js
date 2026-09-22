import test from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../lib/cache.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const cache = (extra = {}) => createCache({ capacity: 2, clock: () => NOW, ...extra });

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'CacheError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('基本的写读删', () => {
  const store = cache();
  assert.deepEqual(store.set('a', 1), { evicted: [] });
  store.set('b', { deep: true });
  assert.equal(store.get('a'), 1);
  assert.deepEqual(store.get('b'), { deep: true });
  assert.equal(store.size(), 2);
  assert.equal(store.has('a'), true);
  assert.equal(store.has('zz'), false);
  assert.equal(store.delete('a'), true);
  assert.equal(store.delete('a'), false);
  assert.equal(store.size(), 1);
});

test('容量满了先挤掉最久没用的', () => {
  const store = cache();
  store.set('a', 1);
  store.set('b', 2);
  store.set('c', 3);
  assert.deepEqual(store.keys(), ['c', 'b']);
  assert.equal(store.get('a'), undefined);
  assert.equal(store.stats().evictions, 1);
});

test('读过的键会被挪到最新，淘汰的是别人', () => {
  const store = cache();
  store.set('a', 1);
  store.set('b', 2);
  assert.equal(store.get('a'), 1);
  assert.deepEqual(store.set('c', 3), { evicted: ['b'] });
  assert.deepEqual(store.keys(), ['c', 'a']);
});

test('覆盖同一个键不算淘汰，值和使用顺序都更新', () => {
  const store = cache();
  store.set('a', 1);
  store.set('b', 2);
  assert.deepEqual(store.set('a', 9), { evicted: [] });
  assert.equal(store.size(), 2);
  assert.equal(store.get('a'), 9);
  assert.deepEqual(store.set('c', 3), { evicted: ['b'] });
  assert.equal(store.stats().evictions, 1);
});

test('一次塞太多会连着挤掉好几个', () => {
  const store = cache({ capacity: 3 });
  store.set('a', 1);
  store.set('b', 2);
  const out = store.set('c', 3);
  assert.deepEqual(out.evicted, []);
  const many = cache({ capacity: 1 });
  many.set('a', 1);
  assert.deepEqual(many.set('b', 2), { evicted: ['a'] });
  assert.deepEqual(many.keys(), ['b']);
});

test('keys 按最近使用从新到旧', () => {
  const store = createCache({ capacity: 5, ttlMs: 1000, clock: () => NOW });
  store.set('a', 1);
  store.set('b', 2);
  assert.deepEqual(store.keys(), ['b', 'a']);
  assert.equal(store.get('a'), 1);
  assert.deepEqual(store.keys(), ['a', 'b']);
});

test('配置和 key 不合法时报哪个码', () => {
  expectError(() => createCache({ capacity: 0 }), 'ERR_BAD_CONFIG');
  expectError(() => createCache({ capacity: 1.5 }), 'ERR_BAD_CONFIG');
  expectError(() => createCache({ ttlMs: -1 }), 'ERR_BAD_CONFIG');
  expectError(() => createCache({ ttlMs: '60' }), 'ERR_BAD_CONFIG');
  expectError(() => createCache({ clock: 123 }), 'ERR_BAD_CONFIG');
  expectError(() => createCache({ clock: () => 'later' }).now(), 'ERR_BAD_CONFIG');
  const store = cache();
  expectError(() => store.set('', 1), 'ERR_BAD_KEY');
  expectError(() => store.get(''), 'ERR_BAD_KEY');
  expectError(() => store.set('a', 1, { ttlMs: 1.5 }), 'ERR_BAD_CONFIG');
});
