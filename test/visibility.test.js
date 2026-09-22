import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../lib/queue.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

function harness(extra = {}) {
  let current = NOW;
  const queue = createQueue({ clock: () => current, ...extra });
  return { queue, at: (offset) => { current = NOW + offset; } };
}

test('可见性超时之后能再被取走，次数累加、旧 receipt 作废', () => {
  const { queue, at } = harness();
  queue.enqueue({ a: 1 });
  const [first] = queue.receive({ visibilityTimeoutMs: 1000 });
  assert.equal(queue.ack(first.id, first.receipt), true);
  queue.enqueue({ b: 2 });
  const [second] = queue.receive({ visibilityTimeoutMs: 1000 });
  at(999);
  assert.deepEqual(queue.receive(), []);
  at(1000);
  const [again] = queue.receive({ visibilityTimeoutMs: 1000 });
  assert.equal(again.id, second.id);
  assert.equal(again.attempts, 2);
  assert.notEqual(again.receipt, second.receipt);
  assert.equal(queue.ack(again.id, second.receipt), false);
  assert.equal(queue.ack(again.id, again.receipt), true);
});

test('超时又没人处理的次数会算进总次数', () => {
  const { queue, at } = harness({ maxAttempts: 2 });
  queue.enqueue({ a: 1 });
  queue.receive({ visibilityTimeoutMs: 1000 });
  at(1000);
  const [second] = queue.receive({ visibilityTimeoutMs: 1000 });
  assert.equal(second.attempts, 2);
  at(2000);
  // 第三次投递已经超过上限：既不返回，也不再留在队列里
  assert.deepEqual(queue.receive(), []);
  assert.deepEqual(queue.stats(), { ready: 0, inflight: 0, delayed: 0, dead: 1 });
  assert.deepEqual(queue.deadLetters(), [
    { id: 'job-1', payload: { a: 1 }, attempts: 3, reason: 'attempts-exhausted' },
  ]);
});

test('超时中的任务既不算 ready 也不算 delayed', () => {
  const { queue, at } = harness({ maxAttempts: 5 });
  queue.enqueue({ a: 1 }, { delayMs: 5000 });
  queue.enqueue({ b: 2 });
  queue.receive({ visibilityTimeoutMs: 2000 });
  assert.deepEqual(queue.stats(), { ready: 0, inflight: 1, delayed: 1, dead: 0 });
  at(2000);
  assert.deepEqual(queue.stats(), { ready: 1, inflight: 0, delayed: 1, dead: 0 });
  at(5000);
  assert.deepEqual(queue.stats(), { ready: 2, inflight: 0, delayed: 0, dead: 0 });
});

test('receipt 是"这一轮"的凭证，重新投递之后换新的', () => {
  const { queue, at } = harness({ maxAttempts: 5 });
  queue.enqueue({ a: 1 });
  const [first] = queue.receive({ visibilityTimeoutMs: 100 });
  at(100);
  const [second] = queue.receive({ visibilityTimeoutMs: 100 });
  assert.equal(first.receipt, 'r-job-1-1');
  assert.equal(second.receipt, 'r-job-1-2');
  assert.deepEqual(queue.nack('job-1', first.receipt), { ok: false, dead: false });
});
