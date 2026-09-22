import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutor } from '../lib/executor.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

function harness(extra = {}) {
  let current = NOW;
  const executor = createExecutor({ clock: () => current, ttlMs: 1000, ...extra });
  return { executor, at: (offset) => { current = NOW + offset; } };
}

test('过期之后再来的同一个 key 会重新执行', () => {
  const { executor, at } = harness();
  let calls = 0;
  const handler = () => {
    calls += 1;
    return calls;
  };
  executor.run({ key: 'k-1', fingerprint: 'fp-1' }, handler);
  at(999);
  assert.equal(executor.run({ key: 'k-1', fingerprint: 'fp-1' }, handler).status, 'replayed');
  assert.equal(executor.has('k-1'), true);
  at(1000);
  assert.equal(executor.has('k-1'), false);
  const fresh = executor.run({ key: 'k-1', fingerprint: 'fp-2' }, handler);
  assert.deepEqual(fresh, { status: 'executed', result: 2, at: NOW + 1000 });
  assert.deepEqual(executor.stats(), { stored: 1, executed: 2, replayed: 1, conflicts: 0, pruned: 1 });
});

test('prune 只清过期的，返回清掉几条', () => {
  const { executor, at } = harness();
  executor.run({ key: 'old', fingerprint: 'f' }, () => 1);
  at(500);
  executor.run({ key: 'new', fingerprint: 'f' }, () => 2);
  at(1200);
  assert.equal(executor.prune(), 1);
  assert.deepEqual(executor.stats(), { stored: 1, executed: 2, replayed: 0, conflicts: 0, pruned: 1 });
  at(2000);
  assert.equal(executor.prune(), 1);
  assert.deepEqual(executor.stats(), { stored: 0, executed: 2, replayed: 0, conflicts: 0, pruned: 2 });
});

test('forget 手动清掉一条记录', () => {
  const { executor } = harness();
  executor.run({ key: 'k-1', fingerprint: 'f' }, () => 1);
  assert.equal(executor.forget('k-1'), true);
  assert.equal(executor.forget('k-1'), false);
  assert.equal(executor.has('k-1'), false);
  assert.equal(executor.run({ key: 'k-1', fingerprint: 'f' }, () => 2).status, 'executed');
});

test('prune 不动还没过期的记录', () => {
  const { executor, at } = harness();
  executor.run({ key: 'k-1', fingerprint: 'f' }, () => 1);
  at(500);
  assert.equal(executor.prune(), 0);
  assert.equal(executor.run({ key: 'k-1', fingerprint: 'f' }, () => 2).status, 'replayed');
  assert.deepEqual(executor.stats(), { stored: 1, executed: 1, replayed: 1, conflicts: 0, pruned: 0 });
});
