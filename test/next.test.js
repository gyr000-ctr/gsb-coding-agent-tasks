import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetryPolicy } from '../lib/retry.js';

const policy = (extra = {}) => createRetryPolicy({ maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2000, ...extra });

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'RetryError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('默认策略：前两次退避重试，第三次不重试', () => {
  const p = policy();
  assert.deepEqual(p.next({ attempt: 1, error: {} }), { retry: true, delayMs: 100, reason: 'backoff' });
  assert.deepEqual(p.next({ attempt: 2, error: {} }), { retry: true, delayMs: 200, reason: 'backoff' });
  assert.deepEqual(p.next({ attempt: 3, error: {} }), { retry: false, delayMs: 0, reason: 'attempts-exhausted' });
  assert.deepEqual(p.limits(), { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2000, jitter: 'none' });
});

test('退避按 2 的幂往上翻，但不超过 maxDelayMs', () => {
  const p = policy({ maxAttempts: 10, baseDelayMs: 50, maxDelayMs: 300 });
  assert.deepEqual([1, 2, 3, 4, 5].map((attempt) => p.next({ attempt, error: {} }).delayMs), [50, 100, 200, 300, 300]);
});

test('retryable 为 false 时不重试，比次数上限先判', () => {
  const p = policy();
  assert.deepEqual(p.next({ attempt: 1, error: { retryable: false } }), { retry: false, delayMs: 0, reason: 'not-retryable' });
  assert.deepEqual(p.next({ attempt: 9, error: { retryable: false } }), { retry: false, delayMs: 0, reason: 'not-retryable' });
  assert.deepEqual(p.next({ attempt: 9, error: {} }), { retry: false, delayMs: 0, reason: 'attempts-exhausted' });
});

test('服务端给了 Retry-After 就听它的，仍受上限约束', () => {
  const p = policy({ maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 2000 });
  assert.deepEqual(p.next({ attempt: 1, error: { retryAfterMs: 1500 } }), { retry: true, delayMs: 1500, reason: 'retry-after' });
  assert.deepEqual(p.next({ attempt: 1, error: { retryAfterMs: 9000 } }), { retry: true, delayMs: 2000, reason: 'retry-after' });
  assert.deepEqual(p.next({ attempt: 1, error: { retryAfterMs: 0 } }), { retry: true, delayMs: 0, reason: 'retry-after' });
});

test('full jitter 会把延迟抖到 0 和原值之间', () => {
  const p = policy({ maxAttempts: 5, jitter: 'full', random: () => 0.5 });
  assert.deepEqual(p.next({ attempt: 2, error: {} }), { retry: true, delayMs: 100, reason: 'backoff' });
  const low = policy({ maxAttempts: 5, jitter: 'full', random: () => 0 });
  assert.equal(low.next({ attempt: 2, error: {} }).delayMs, 0);
  const high = policy({ maxAttempts: 5, jitter: 'full', random: () => 0.999 });
  assert.equal(high.next({ attempt: 2, error: {} }).delayMs, 199);
  const after = policy({ maxAttempts: 5, jitter: 'full', random: () => 0.5 });
  assert.equal(after.next({ attempt: 1, error: { retryAfterMs: 300 } }).delayMs, 150);
});

test('jitter 为 none 时根本不碰 random', () => {
  const p = policy({ random: () => { throw new Error('不该被调用'); } });
  assert.equal(p.next({ attempt: 1, error: {} }).delayMs, 100);
});

test('请求参数不合法时报 ERR_BAD_REQUEST', () => {
  const p = policy();
  for (const attempt of [0, -1, 1.5, '2', undefined]) {
    expectError(() => p.next({ attempt, error: {} }), 'ERR_BAD_REQUEST');
  }
  expectError(() => p.next('nope'), 'ERR_BAD_REQUEST');
  expectError(() => p.next({ attempt: 1, error: 'boom' }), 'ERR_BAD_REQUEST');
  expectError(() => p.next({ attempt: 1, error: { retryable: 'yes' } }), 'ERR_BAD_REQUEST');
  expectError(() => p.next({ attempt: 1, error: { retryAfterMs: -1 } }), 'ERR_BAD_REQUEST');
  expectError(() => p.next({ attempt: 1, error: { retryAfterMs: 1.5 } }), 'ERR_BAD_REQUEST');
  expectError(() => createRetryPolicy({ jitter: 'full', random: () => 'half' }).next({ attempt: 1, error: {} }), 'ERR_BAD_REQUEST');
});
