import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../lib/gateway.js';

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'GatewayError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

function build() {
  const gateway = createGateway();
  gateway.addRoute({ method: 'get', path: '/orders/:id', handler: ({ params }) => ({ body: { id: params.id } }) });
  gateway.addRoute({ method: 'GET', path: '/orders/recent', handler: () => ({ body: { recent: true } }) });
  gateway.addRoute({ method: 'POST', path: '/orders', handler: ({ body }) => ({ status: 201, body }) });
  gateway.addRoute({ method: 'GET', path: '/', handler: () => ({ body: 'root' }) });
  return gateway;
}

test('路径参数能取到，响应默认 200', () => {
  const gateway = build();
  const out = gateway.handle({ method: 'GET', path: '/orders/A-9' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { id: 'A-9' });
  assert.equal(out.headers['content-type'], 'application/json');
});

test('静态段优先于参数段', () => {
  const gateway = build();
  assert.deepEqual(gateway.handle({ method: 'GET', path: '/orders/recent' }).body, { recent: true });
  assert.deepEqual(gateway.handle({ method: 'GET', path: '/orders/other' }).body, { id: 'other' });
});

test('路径没有就 404，方法不对就 405 并给出 allow', () => {
  const gateway = build();
  assert.equal(gateway.handle({ method: 'GET', path: '/nope' }).status, 404);
  const wrong = gateway.handle({ method: 'DELETE', path: '/orders/A-1' });
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.allow, 'GET');
  const both = gateway.handle({ method: 'PUT', path: '/orders' });
  assert.equal(both.status, 405);
  assert.equal(both.headers.allow, 'POST');
});

test('根路径和字符串响应', () => {
  const gateway = build();
  const out = gateway.handle({ method: 'GET', path: '/' });
  assert.equal(out.status, 200);
  assert.equal(out.body, 'root');
  assert.deepEqual(out.headers, {});
});

test('handler 可以自己定 status，抛异常就是 500', () => {
  const gateway = createGateway();
  gateway.addRoute({ method: 'POST', path: '/orders', handler: ({ body }) => ({ status: 201, body }) });
  assert.equal(gateway.handle({ method: 'POST', path: '/orders' }).status, 201);
  gateway.addRoute({
    method: 'GET',
    path: '/boom',
    handler: () => {
      throw new Error('炸了');
    },
  });
  const out = gateway.handle({ method: 'GET', path: '/boom' });
  assert.equal(out.status, 500);
  assert.deepEqual(out.body, { error: 'internal' });
  assert.equal(gateway.stats().errors, 1);
});

test('路由写错直接报 ERR_BAD_ROUTE', () => {
  const gateway = createGateway();
  const bad = [
    { method: '', path: '/a', handler: () => {} },
    { method: 'GET', path: 'a', handler: () => {} },
    { method: 'GET', path: '/a' },
    { method: 'GET', path: '/a', handler: () => {}, requireHeaders: 'x-api-key' },
    { method: 'GET', path: '/a/:', handler: () => {} },
    { method: 'GET', path: '/a/:id/:id', handler: () => {} },
  ];
  for (const route of bad) expectError(() => gateway.addRoute(route), 'ERR_BAD_ROUTE');
  expectError(() => gateway.addRoute('nope'), 'ERR_BAD_ROUTE');
  expectError(() => createGateway({ maxBodyBytes: 0 }), 'ERR_BAD_CONFIG');
  expectError(() => createGateway([]), 'ERR_BAD_CONFIG');
  assert.deepEqual(gateway.routes(), []);
});

test('统计各项都记上了', () => {
  const gateway = build();
  gateway.handle({ method: 'GET', path: '/orders/A-1' });
  gateway.handle({ method: 'GET', path: '/nope' });
  gateway.handle({ method: 'DELETE', path: '/orders/A-1' });
  gateway.handle({ method: 'GET', path: '/', body: 'x'.repeat(2000) });
  assert.deepEqual(gateway.stats(), {
    requests: 4,
    ok: 1,
    notFound: 1,
    methodNotAllowed: 1,
    rejected: 1,
    errors: 0,
  });
});
