import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../lib/gateway.js';

function build(config = {}) {
  const calls = [];
  const gateway = createGateway(config);
  gateway.addRoute({
    method: 'POST',
    path: '/orders',
    requireHeaders: ['X-Api-Key'],
    handler: ({ body }) => {
      calls.push(body);
      return { status: 201, body };
    },
  });
  gateway.addRoute({ method: 'GET', path: '/ping', handler: () => ({ body: 'pong' }) });
  return { gateway, calls };
}

const json = (body) => ({ 'content-type': 'application/json' });

test('请求体太大直接 413，handler 不会被调用', () => {
  const { gateway, calls } = build({ maxBodyBytes: 10 });
  const out = gateway.handle({ method: 'POST', path: '/orders', headers: json(), body: '{"a":"1234567890"}' });
  assert.equal(out.status, 413);
  assert.deepEqual(out.body, { error: 'payload-too-large' });
  assert.deepEqual(calls, []);
});

test('content-type 不对是 415，JSON 坏了是 400', () => {
  const { gateway, calls } = build();
  assert.equal(gateway.handle({ method: 'POST', path: '/orders', headers: { 'content-type': 'text/plain' }, body: '{}' }).status, 415);
  assert.equal(gateway.handle({ method: 'POST', path: '/orders', headers: json(), body: '{oops' }).status, 400);
  assert.deepEqual(calls, []);
  assert.equal(gateway.handle({ method: 'POST', path: '/orders', headers: json(), body: '' }).status, 401);
});

test('必填头缺失是 401，带上就放行', () => {
  const { gateway, calls } = build();
  const missing = gateway.handle({ method: 'POST', path: '/orders', headers: json(), body: '{"a":1}' });
  assert.equal(missing.status, 401);
  assert.deepEqual(missing.body, { error: 'missing-header', header: 'x-api-key' });
  const ok = gateway.handle({
    method: 'POST',
    path: '/orders',
    headers: { ...json(), 'x-api-key': 'k-1' },
    body: '{"a":1}',
  });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body, { a: 1 });
  assert.deepEqual(calls, [{ a: 1 }]);
});

test('content-type 带 charset 也认，头名大小写不敏感', () => {
  const { gateway } = build();
  const out = gateway.handle({
    method: 'POST',
    path: '/orders',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-API-KEY': 'k-2' },
    body: '{"ok":true}',
  });
  assert.equal(out.status, 201);
  assert.equal(out.headers['content-type'], 'application/json');
});

test('空 body 的 GET 不需要 content-type', () => {
  const { gateway } = build();
  assert.equal(gateway.handle({ method: 'GET', path: '/ping' }).body, 'pong');
  assert.equal(gateway.handle({ method: 'GET', path: '/ping', headers: { 'content-type': 'text/plain' } }).status, 200);
});

test('handle 的请求形状不对直接抛；handler 报错不计 rejected', () => {
  const { gateway } = build();
  assert.throws(() => gateway.handle('nope'), { name: 'GatewayError', code: 'ERR_BAD_ROUTE' });
  const boom = createGateway();
  boom.addRoute({
    method: 'GET',
    path: '/boom',
    handler: () => {
      throw new Error('x');
    },
  });
  boom.handle({ method: 'GET', path: '/boom' });
  assert.equal(boom.stats().rejected, 0);
  assert.equal(boom.stats().errors, 1);
});
