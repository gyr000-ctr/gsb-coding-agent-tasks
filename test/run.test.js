import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutor } from '../lib/executor.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

function harness(extra = {}) {
  let current = NOW;
  const executor = createExecutor({ clock: () => current, ...extra });
  return { executor, at: (offset) => { current = offset === null ? NOW : NOW + offset; } };
}

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'IdempotencyError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('第一次跑 handler，第二次直接回放', () => {
  const { executor } = harness();
  let calls = 0;
  const handler = () => {
    calls += 1;
    return { orderId: 'A-1' };
  };
  const first = executor.run({ key: 'k-1', fingerprint: 'fp-1' }, handler);
  assert.deepEqual(first, { status: 'executed', result: { orderId: 'A-1' }, at: NOW });
  const second = executor.run({ key: 'k-1', fingerprint: 'fp-1' }, handler);
  assert.deepEqual(second, { status: 'replayed', result: { orderId: 'A-1' }, at: NOW });
  assert.equal(calls, 1);
  assert.deepEqual(executor.stats(), { stored: 1, executed: 1, replayed: 1, conflicts: 0, pruned: 0 });
});

test('同一个 key 换了指纹就是冲突，handler 不能跑', () => {
  const { executor } = harness();
  let calls = 0;
  executor.run({ key: 'k-1', fingerprint: 'fp-1' }, () => {
    calls += 1;
    return 1;
  });
  const err = expectError(
    () =>
      executor.run({ key: 'k-1', fingerprint: 'fp-2' }, () => {
        calls += 1;
        return 2;
      }),
    'ERR_FINGERPRINT_MISMATCH',
  );
  assert.equal(err.details.key, 'k-1');
  assert.equal(calls, 1);
  assert.equal(executor.stats().conflicts, 1);
});

test('handler 抛异常不记账，重试还能跑', () => {
  const { executor } = harness();
  let calls = 0;
  assert.throws(
    () =>
      executor.run({ key: 'k-1', fingerprint: 'fp-1' }, () => {
        calls += 1;
        throw new Error('上游挂了');
      }),
    /上游挂了/,
  );
  assert.equal(executor.has('k-1'), false);
  assert.deepEqual(executor.stats(), { stored: 0, executed: 0, replayed: 0, conflicts: 0, pruned: 0 });
  const ok = executor.run({ key: 'k-1', fingerprint: 'fp-1' }, () => {
    calls += 1;
    return 'done';
  });
  assert.equal(ok.status, 'executed');
  assert.equal(calls, 2);
});

test('存下来的结果是拷贝，改它不影响回放', () => {
  const { executor } = harness();
  const first = executor.run({ key: 'k-1', fingerprint: 'fp-1' }, () => ({ list: [1, 2] }));
  first.result.list.push(3);
  const again = executor.run({ key: 'k-1', fingerprint: 'fp-1' }, () => ({ list: [] }));
  assert.deepEqual(again.result, { list: [1, 2] });
});

test('参数不合法时报哪个码', () => {
  const { executor } = harness();
  expectError(() => executor.run({ key: '', fingerprint: 'f' }, () => 1), 'ERR_BAD_KEY');
  expectError(() => executor.run({ key: 'k' }, () => 1), 'ERR_BAD_KEY');
  expectError(() => executor.run('nope', () => 1), 'ERR_BAD_KEY');
  expectError(() => executor.run({ key: 'k', fingerprint: 'f' }, 'nope'), 'ERR_BAD_CONFIG');
  expectError(() => createExecutor({ ttlMs: 0 }), 'ERR_BAD_CONFIG');
  expectError(() => createExecutor({ clock: 1 }), 'ERR_BAD_CONFIG');
  expectError(() => createExecutor([]), 'ERR_BAD_CONFIG');
});

test('不同 key 互不影响，返回 undefined 也算执行过', () => {
  const { executor } = harness();
  assert.equal(executor.run({ key: 'k-1', fingerprint: 'f' }, () => undefined).status, 'executed');
  assert.equal(executor.run({ key: 'k-1', fingerprint: 'f' }, () => 'never').result, undefined);
  assert.equal(executor.run({ key: 'k-2', fingerprint: 'f' }, () => 'second').result, 'second');
  assert.equal(executor.stats().stored, 2);
});
