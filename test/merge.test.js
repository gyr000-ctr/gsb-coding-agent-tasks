import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfig } from '../lib/config.js';

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'ConfigError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('深层对象合并，没被覆盖的兄弟键留着', () => {
  const out = mergeConfig([
    { name: 'base', values: { a: 1, b: { x: 1, y: 2 }, port: 8080 } },
    { name: 'override', values: { b: { y: 3 }, port: 9090 } },
  ]);
  assert.deepEqual(out.values, { a: 1, b: { x: 1, y: 3 }, port: 9090 });
  assert.deepEqual(out.sources, { a: 'base', 'b.x': 'base', 'b.y': 'override', port: 'override' });
});

test('数组整体覆盖，不拼接；数组算一个叶子', () => {
  const out = mergeConfig([
    { name: 'base', values: { list: [1, 2], nested: { tags: ['a'] } } },
    { name: 'over', values: { list: [3] } },
  ]);
  assert.deepEqual(out.values, { list: [3], nested: { tags: ['a'] } });
  assert.deepEqual(out.sources, { list: 'over', 'nested.tags': 'base' });
});

test('null 是清空，undefined 是这层不管', () => {
  const out = mergeConfig([
    { name: 'base', values: { a: 1, b: 2, deep: { x: 1 } } },
    { name: 'over', values: { a: null, b: undefined, deep: null } },
  ]);
  assert.deepEqual(out.values, { a: null, b: 2, deep: null });
  assert.deepEqual(out.sources, { a: 'over', b: 'base', deep: 'over' });
});

test('空对象不会清空旧值', () => {
  const out = mergeConfig([
    { name: 'base', values: { b: { x: 1 } } },
    { name: 'over', values: { b: {} } },
  ]);
  assert.deepEqual(out.values, { b: { x: 1 } });
  assert.deepEqual(out.sources, { 'b.x': 'base' });
});

test('层的顺序就是优先级，越靠后越高', () => {
  const out = mergeConfig([
    { name: 'defaults', values: { a: 1, b: 1, c: 1 } },
    { name: 'env', values: { b: 2, c: 2 } },
    { name: 'user', values: { c: 3, d: 4 } },
  ]);
  assert.deepEqual(out.values, { a: 1, b: 2, c: 3, d: 4 });
  assert.deepEqual(out.sources, { a: 'defaults', b: 'env', c: 'user', d: 'user' });
});

test('返回的是拷贝，改它不会污染原来的层', () => {
  const layer = { name: 'base', values: { b: { x: 1 }, list: [1, 2] } };
  const out = mergeConfig([layer]);
  out.values.b.x = 99;
  out.values.list.push(3);
  assert.deepEqual(layer.values, { b: { x: 1 }, list: [1, 2] });
});

test('空配置就是空对象', () => {
  assert.deepEqual(mergeConfig([]), { values: {}, sources: {} });
  assert.deepEqual(mergeConfig([{ name: 'empty', values: {} }]), { values: {}, sources: {} });
});

test('配置和层不合法时报哪个码', () => {
  expectError(() => mergeConfig('nope'), 'ERR_BAD_LAYER');
  expectError(() => mergeConfig([null]), 'ERR_BAD_LAYER');
  expectError(() => mergeConfig([{ values: {} }]), 'ERR_BAD_LAYER');
  expectError(() => mergeConfig([{ name: '', values: {} }]), 'ERR_BAD_LAYER');
  expectError(() => mergeConfig([{ name: 'a', values: {} }, { name: 'a', values: {} }]), 'ERR_BAD_LAYER');
  expectError(() => mergeConfig([{ name: 'a', values: [] }]), 'ERR_BAD_LAYER');
  expectError(() => mergeConfig([], null), 'ERR_BAD_CONFIG');
  expectError(() => mergeConfig([], { env: 'nope' }), 'ERR_BAD_CONFIG');
});
