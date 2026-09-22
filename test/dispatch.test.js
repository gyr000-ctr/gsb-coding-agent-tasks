import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createDispatcher } from '../lib/dispatcher.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const dispatcher = (extra = {}) => createDispatcher({ secret: 'whsec', clock: () => NOW, ...extra });

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

test('订阅之后按事件类型匹配，只有订阅了的才会收到', () => {
  const hub = dispatcher();
  const a = hub.subscribe({ url: 'https://a.example.com/hook', events: ['order.created'] });
  hub.subscribe({ url: 'https://b.example.com/hook', events: ['order.paid'] });
  assert.deepEqual(a, { id: 'ep-1', url: 'https://a.example.com/hook', events: ['order.created'] });
  const out = hub.dispatch({ id: 'evt-1', type: 'order.created', data: { id: 'A-1' } });
  assert.equal(out.created.length, 1);
  assert.equal(out.created[0].endpointId, 'ep-1');
  assert.deepEqual(out.duplicates, []);
  assert.equal(hub.dispatch({ id: 'evt-2', type: 'order.shipped' }).created.length, 0);
});

test('投递上带着签名、幂等键和规范化后的 body', () => {
  const hub = dispatcher();
  hub.subscribe({ url: 'https://a.example.com/hook', events: ['order.created'] });
  const [delivery] = hub.dispatch({ id: 'evt-1', type: 'order.created', data: { b: 2, a: 1 } }).created;
  assert.equal(delivery.headers['content-type'], 'application/json');
  assert.equal(delivery.headers['x-idempotency-key'], 'evt-1:ep-1');
  assert.equal(delivery.body, '{"data":{"a":1,"b":2},"id":"evt-1","type":"order.created"}');
  const seconds = Math.floor(NOW / 1000);
  const expected = createHmac('sha256', 'whsec').update(`${seconds}.${delivery.body}`, 'utf8').digest('hex').slice(0, 16);
  assert.equal(delivery.headers['x-signature'], `t=${seconds},v1=${expected}`);
  assert.equal(delivery.attempt, 1);
  assert.equal(delivery.dueAt, NOW);
});

test('同一个事件重复派发不会变成两条投递', () => {
  const hub = dispatcher();
  hub.subscribe({ url: 'https://a.example.com/hook', events: ['order.created'] });
  const first = hub.dispatch({ id: 'evt-1', type: 'order.created', data: {} });
  const again = hub.dispatch({ id: 'evt-1', type: 'order.created', data: { changed: true } });
  assert.deepEqual(again.created, []);
  assert.deepEqual(again.duplicates, [first.created[0].id]);
  assert.equal(hub.stats().pending, 1);
});

test('退订之后不再派发，已经派出去的还在', () => {
  const hub = dispatcher();
  const { id } = hub.subscribe({ url: 'https://a.example.com/hook', events: ['order.created'] });
  hub.dispatch({ id: 'evt-1', type: 'order.created' });
  assert.equal(hub.unsubscribe(id), true);
  assert.equal(hub.unsubscribe(id), false);
  assert.deepEqual(hub.dispatch({ id: 'evt-2', type: 'order.created' }).created, []);
  assert.equal(hub.stats().pending, 1);
  assert.equal(hub.stats().disabled, 1);
});

test('订阅和事件写错时报哪个码', () => {
  const hub = dispatcher();
  expectError(() => hub.subscribe({ url: 'ftp://a', events: ['x'] }), 'ERR_BAD_ENDPOINT');
  expectError(() => hub.subscribe({ url: 'https://a', events: [] }), 'ERR_BAD_ENDPOINT');
  expectError(() => hub.subscribe({ url: '', events: ['x'] }), 'ERR_BAD_ENDPOINT');
  expectError(() => hub.subscribe(null), 'ERR_BAD_ENDPOINT');
  expectError(() => hub.dispatch({ type: 'x' }), 'ERR_BAD_EVENT');
  expectError(() => hub.dispatch({ id: 'e', type: '' }), 'ERR_BAD_EVENT');
  expectError(() => hub.dispatch('nope'), 'ERR_BAD_EVENT');
  expectError(() => createDispatcher({ secret: '' }), 'ERR_BAD_CONFIG');
  expectError(() => createDispatcher({ clock: 1 }), 'ERR_BAD_CONFIG');
  expectError(() => createDispatcher({ maxAttempts: 0 }), 'ERR_BAD_CONFIG');
});

test('due 只给到期的，按到期时间排', () => {
  const hub = dispatcher();
  hub.subscribe({ url: 'https://a.example.com/hook', events: ['x'] });
  hub.dispatch({ id: 'evt-1', type: 'x' });
  hub.dispatch({ id: 'evt-2', type: 'x' });
  assert.deepEqual(hub.due().map((one) => one.id), ['dl-1', 'dl-2']);
  hub.report('dl-1', { status: 200 });
  assert.deepEqual(hub.due().map((one) => one.id), ['dl-2']);
});
