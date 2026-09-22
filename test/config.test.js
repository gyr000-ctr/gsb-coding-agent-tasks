import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetryPolicy, DEFAULTS, REASONS } from '../lib/retry.js';

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

test('不传配置就用默认值', () => {
  assert.deepEqual(createRetryPolicy().limits(), DEFAULTS);
});

test('配置不合法就拒掉', () => {
  expectError(() => createRetryPolicy(null), 'ERR_BAD_CONFIG');
  expectError(() => createRetryPolicy({ maxAttempts: 0 }), 'ERR_BAD_CONFIG');
  expectError(() => createRetryPolicy({ maxAttempts: 2.5 }), 'ERR_BAD_CONFIG');
  expectError(() => createRetryPolicy({ baseDelayMs: 0 }), 'ERR_BAD_CONFIG');
  expectError(() => createRetryPolicy({ maxDelayMs: -100 }), 'ERR_BAD_CONFIG');
  expectError(() => createRetryPolicy({ jitter: 'sometimes' }), 'ERR_BAD_CONFIG');
  expectError(() => createRetryPolicy({ random: 0.5 }), 'ERR_BAD_CONFIG');
});

test('只会给出这四种 reason', () => {
  const p = createRetryPolicy({ maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 100 });
  const seen = new Set([
    p.next({ attempt: 1, error: {} }).reason,
    p.next({ attempt: 1, error: { retryAfterMs: 5 } }).reason,
    p.next({ attempt: 1, error: { retryable: false } }).reason,
    p.next({ attempt: 2, error: {} }).reason,
  ]);
  assert.deepEqual([...seen].sort(), [...REASONS].sort());
});

test('延迟永远不超过 maxDelayMs', () => {
  const p = createRetryPolicy({ maxAttempts: 20, baseDelayMs: 1000, maxDelayMs: 1500 });
  for (let attempt = 1; attempt < 20; attempt++) {
    assert.ok(p.next({ attempt, error: {} }).delayMs <= 1500, `attempt=${attempt}`);
    assert.ok(p.next({ attempt, error: { retryAfterMs: 999999 } }).delayMs <= 1500, `retry-after attempt=${attempt}`);
  }
});
