import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../lib/queue.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

function harness(extra = {}) {
  let current = NOW;
  const queue = createQueue({ clock: () => current, ...extra });
  return { queue, at: (offset) => { current = NOW + offset; } };
}

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'QueueError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('入队之后能取到，带上次数和 receipt', () => {
  const { queue } = harness();
  const created = queue.enqueue({ orderId: 'A-1' });
  assert.deepEqual(created, { id: 'job-1', visibleAt: NOW });
  const [job] = queue.receive();
  assert.equal(job.id, 'job-1');
  assert.deepEqual(job.payload, { orderId: 'A-1' });
  assert.equal(job.attempts, 1);
  assert.equal(job.receipt, 'r-job-1-1');
  assert.deepEqual(queue.stats(), { ready: 0, inflight: 1, delayed: 0, dead: 0 });
});

test('延迟任务要等到点才可见', () => {
  const { queue, at } = harness();
  queue.enqueue({ a: 1 }, { delayMs: 5000 });
  assert.deepEqual(queue.receive(), []);
  assert.equal(queue.stats().delayed, 1);
  at(4999);
  assert.deepEqual(queue.receive(), []);
  at(5000);
  assert.equal(queue.receive()[0].id, 'job-1');
});

test('取走的顺序是先入先出，max 是上限', () => {
  const { queue } = harness();
  for (const id of ['a', 'b', 'c']) queue.enqueue({ id });
  const one = queue.receive({ max: 2 });
  assert.deepEqual(one.map((job) => job.id), ['job-1', 'job-2']);
  const rest = queue.receive({ max: 5 });
  assert.deepEqual(rest.map((job) => job.id), ['job-3']);
  expectError(() => queue.receive({ max: 11 }), 'ERR_BAD_OPTION');
  expectError(() => queue.receive({ visibilityTimeoutMs: 0 }), 'ERR_BAD_OPTION');
});

test('ack 之后就不见了，receipt 不对 ack 不掉', () => {
  const { queue } = harness();
  queue.enqueue({ a: 1 });
  const [job] = queue.receive();
  assert.equal(queue.ack(job.id, 'r-job-1-9'), false);
  assert.equal(queue.ack('job-9', job.receipt), false);
  assert.equal(queue.ack(job.id, job.receipt), true);
  assert.equal(queue.ack(job.id, job.receipt), false);
  assert.deepEqual(queue.stats(), { ready: 0, inflight: 0, delayed: 0, dead: 0 });
});

test('nack 可以立刻放回去，也可以延迟放回去', () => {
  const { queue, at } = harness();
  queue.enqueue({ a: 1 });
  const [first] = queue.receive();
  assert.deepEqual(queue.nack(first.id, first.receipt), { ok: true, dead: false });
  const [second] = queue.receive();
  assert.equal(second.attempts, 2);
  queue.nack(second.id, second.receipt, { delayMs: 1000 });
  assert.deepEqual(queue.receive(), []);
  at(1000);
  const [third] = queue.receive();
  assert.equal(third.attempts, 3);
  assert.deepEqual(queue.nack(third.id, third.receipt), { ok: true, dead: true });
  assert.deepEqual(queue.stats(), { ready: 0, inflight: 0, delayed: 0, dead: 1 });
  assert.equal(queue.deadLetters()[0].reason, 'attempts-exhausted');
});

test('payload 和参数不合法时报哪个码', () => {
  const { queue } = harness();
  expectError(() => queue.enqueue('nope'), 'ERR_BAD_PAYLOAD');
  expectError(() => queue.enqueue([1, 2]), 'ERR_BAD_PAYLOAD');
  expectError(() => queue.enqueue({ a: 1 }, { delayMs: -1 }), 'ERR_BAD_OPTION');
  expectError(() => queue.enqueue({ a: 1 }, { delayMs: 1.5 }), 'ERR_BAD_OPTION');
  expectError(() => queue.receive({ max: 0 }), 'ERR_BAD_OPTION');
  expectError(() => queue.nack('job-1', 'r', { delayMs: 'soon' }), 'ERR_BAD_OPTION');
  expectError(() => createQueue({ maxAttempts: 0 }), 'ERR_BAD_OPTION');
  expectError(() => createQueue({ clock: 1 }), 'ERR_BAD_CONFIG');
  expectError(() => createQueue(null), 'ERR_BAD_CONFIG');
});

test('拿到的 payload 是副本，改它不影响队列里的', () => {
  const { queue } = harness();
  queue.enqueue({ list: [1, 2] });
  const [job] = queue.receive();
  job.payload.list.push(3);
  queue.nack(job.id, job.receipt);
  assert.deepEqual(queue.receive()[0].payload, { list: [1, 2] });
});
