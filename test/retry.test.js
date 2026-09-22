import test from 'node:test';
import assert from 'node:assert/strict';
import { createDispatcher } from '../lib/dispatcher.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

function harness(extra = {}) {
  let current = NOW;
  const hub = createDispatcher({ secret: 'whsec', clock: () => current, baseDelayMs: 1000, ...extra });
  hub.subscribe({ url: 'https://a.example.com/hook', events: ['x'] });
  hub.dispatch({ id: 'evt-1', type: 'x' });
  return { hub, at: (offset) => { current = NOW + offset; } };
}

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'WebhookError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('2xx 就算成功，不用再重试', () => {
  const { hub } = harness();
  assert.deepEqual(hub.report('dl-1', { status: 200 }), { ok: true, retry: false, dead: false, disabled: false });
  assert.deepEqual(hub.due(), []);
  assert.deepEqual(hub.stats(), { pending: 0, delivered: 1, dead: 0, duplicates: 0, endpoints: 1, disabled: 0 });
});

test('失败按指数退避重试，最多 maxAttempts 次', () => {
  const { hub, at } = harness({ maxAttempts: 3 });
  assert.equal(hub.report('dl-1', { status: 500 }).retry, true);
  assert.deepEqual(hub.due(), []);
  at(1000);
  assert.equal(hub.due()[0].attempt, 2);
  assert.equal(hub.report('dl-1', { status: 500 }).retry, true);
  at(1000 + 2000);
  assert.equal(hub.due()[0].attempt, 3);
  const last = hub.report('dl-1', { status: 500 });
  assert.deepEqual(last, { ok: true, retry: false, dead: true, disabled: false });
  assert.equal(hub.stats().dead, 1);
  assert.deepEqual(hub.due(), []);
});

test('Retry-After 优先，但要被 maxDelayMs 截断', () => {
  const { hub, at } = harness({ maxAttempts: 5, maxDelayMs: 2000 });
  hub.report('dl-1', { status: 503, retryAfterMs: 5000 });
  at(1999);
  assert.deepEqual(hub.due(), []);
  at(2000);
  assert.equal(hub.due().length, 1);
});

test('410 说明对方不要了：停投并禁用这个订阅', () => {
  const { hub } = harness();
  const out = hub.report('dl-1', { status: 410 });
  assert.deepEqual(out, { ok: true, retry: false, dead: true, disabled: true });
  assert.deepEqual(hub.dispatch({ id: 'evt-2', type: 'x' }).created, []);
  assert.deepEqual(hub.stats(), { pending: 0, delivered: 0, dead: 1, duplicates: 0, endpoints: 1, disabled: 1 });
});

test('report 的参数不合法时报哪个码', () => {
  const { hub } = harness();
  expectError(() => hub.report('dl-404', { status: 200 }), 'ERR_BAD_DELIVERY');
  expectError(() => hub.report('dl-1', { status: 'ok' }), 'ERR_BAD_DELIVERY');
  expectError(() => hub.report('dl-1', { status: 99 }), 'ERR_BAD_DELIVERY');
  expectError(() => hub.report('dl-1', null), 'ERR_BAD_DELIVERY');
  expectError(() => hub.report('dl-1', { status: 500, retryAfterMs: -1 }), 'ERR_BAD_DELIVERY');
});
