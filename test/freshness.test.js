import test from 'node:test';
import assert from 'node:assert/strict';
import { createCachePolicy } from '../lib/policy.js';
import { formatHttpDate } from '../lib/parse.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const at = (offset = 0) => formatHttpDate(NOW + offset);

const policyAt = (offset = 0, shared = false) => createCachePolicy({ shared, clock: () => NOW + offset });

function entry(headers, options = {}) {
  return {
    request: { method: 'GET', url: 'https://api.example.com/x', headers: options.requestHeaders ?? {} },
    response: { status: options.status ?? 200, headers },
    storedAt: options.storedAt ?? NOW,
    requestTime: options.requestTime ?? NOW,
    responseTime: options.responseTime ?? NOW,
  };
}

test('当前年龄：Date、Age 头、响应耗时、驻留时间', () => {
  assert.equal(policyAt().ageOf(entry({ date: at(-10000) })), 10000);
  assert.equal(policyAt().ageOf(entry({ age: '30' }, { requestTime: NOW - 5000 })), 35000);
  assert.equal(policyAt(7000).ageOf(entry({ date: at(-10000) })), 17000);
  assert.equal(policyAt().ageOf(entry({ date: at(-60000), age: '5' })), 60000);
  assert.equal(policyAt().ageOf(entry({ date: at(-1000), age: 'abc' })), 1000);
});

test('新鲜度：max-age 和 s-maxage 谁说了算', () => {
  const plain = policyAt();
  const shared = policyAt(0, true);
  const headers = { 'cache-control': 'max-age=60, s-maxage=120' };
  assert.deepEqual(plain.freshnessLifetime({ status: 200, headers }), { seconds: 60, source: 'max-age' });
  assert.deepEqual(shared.freshnessLifetime({ status: 200, headers }), { seconds: 120, source: 's-maxage' });
  assert.deepEqual(plain.freshnessLifetime({ status: 200, headers: { 'cache-control': 'no-cache, max-age=60' } }), {
    seconds: 0,
    source: 'no-cache',
  });
});

test('新鲜度：Expires 按 Date 算，解不开当已过期', () => {
  const policy = policyAt();
  assert.deepEqual(policy.freshnessLifetime({ status: 200, headers: { date: at(), expires: at(90000) } }), {
    seconds: 90,
    source: 'expires',
  });
  assert.deepEqual(policy.freshnessLifetime({ status: 200, headers: { date: at(), expires: at(-90000) } }), {
    seconds: 0,
    source: 'expires',
  });
  assert.deepEqual(policy.freshnessLifetime({ status: 200, headers: { date: at(), expires: 'not-a-date' } }), {
    seconds: 0,
    source: 'expires',
  });
});

test('新鲜度：只有 Last-Modified 时按 10% 启发式，最多一天', () => {
  const policy = policyAt();
  const oneHour = policy.freshnessLifetime({
    status: 200,
    headers: { date: at(-10000), 'last-modified': at(-10000 - 3600000) },
  });
  assert.deepEqual(oneHour, { seconds: 360, source: 'heuristic' });
  const thirtyDays = policy.freshnessLifetime({
    status: 200,
    headers: { date: at(), 'last-modified': at(-30 * 86400000) },
  });
  assert.deepEqual(thirtyDays, { seconds: 86400, source: 'heuristic' });
  const serverError = policy.freshnessLifetime({
    status: 500,
    headers: { date: at(), 'last-modified': at(-86400000) },
  });
  assert.deepEqual(serverError, { seconds: 0, source: 'none' });
  assert.deepEqual(policy.freshnessLifetime({ status: 200, headers: {} }), { seconds: 0, source: 'none' });
});

test('isFresh 卡在新鲜度那一秒上', () => {
  const fresh = policyAt();
  assert.equal(fresh.isFresh(entry({ date: at(-30000), 'cache-control': 'max-age=60' })), true);
  assert.equal(fresh.isFresh(entry({ date: at(-60000), 'cache-control': 'max-age=60' })), false);
  assert.equal(fresh.isFresh(entry({ date: at(-10000) })), false);
});

test('Vary 匹配：逐个头比值，缺省当空串，星号谁都不匹配', () => {
  const policy = policyAt();
  const request = (headers) => ({ method: 'GET', url: 'https://api.example.com/x', headers });
  const withVary = entry(
    { date: at(), vary: 'Accept-Encoding, Accept-Language' },
    { requestHeaders: { 'accept-encoding': 'gzip', 'accept-language': 'zh' } },
  );
  assert.equal(policy.varyMatches(request({ 'accept-encoding': 'gzip', 'accept-language': 'zh' }), withVary), true);
  assert.equal(policy.varyMatches(request({ 'accept-encoding': 'br', 'accept-language': 'zh' }), withVary), false);
  assert.equal(policy.varyMatches(request({ 'accept-encoding': '  gzip ', 'accept-language': 'zh' }), withVary), true);
  assert.equal(policy.varyMatches(request({ 'accept-encoding': 'gzip' }), withVary), false);
  assert.equal(policy.varyMatches(request({}), entry({ date: at() }, { requestHeaders: {} })), true);
  assert.equal(policy.varyMatches(request({}), entry({ date: at(), vary: '*' }, { requestHeaders: {} })), false);
});

test('能不能存：方法、no-store、私有、带凭证、状态码、Vary 星号', () => {
  const plain = policyAt();
  const shared = policyAt(0, true);
  const request = (headers = {}, method = 'GET') => ({ method, url: 'https://api.example.com/x', headers });
  const response = (headers = {}, status = 200) => ({ status, headers });

  assert.deepEqual(plain.storable({ request: request({}, 'POST'), response: response() }), { storable: false, reason: 'method' });
  assert.deepEqual(plain.storable({ request: request({ 'cache-control': 'no-store' }), response: response() }), {
    storable: false,
    reason: 'request-no-store',
  });
  assert.deepEqual(plain.storable({ request: request(), response: response({ 'cache-control': 'no-store' }) }), {
    storable: false,
    reason: 'response-no-store',
  });
  assert.deepEqual(shared.storable({ request: request(), response: response({ 'cache-control': 'private, max-age=60' }) }), {
    storable: false,
    reason: 'private',
  });
  assert.deepEqual(shared.storable({ request: request({ authorization: 'Bearer t' }), response: response({ 'cache-control': 'max-age=60' }) }), {
    storable: false,
    reason: 'authorized',
  });
  assert.deepEqual(shared.storable({ request: request({ authorization: 'Bearer t' }), response: response({ 'cache-control': 'public, max-age=60' }) }), {
    storable: true,
    ttlMs: 60000,
  });
  assert.deepEqual(plain.storable({ request: request(), response: response({}, 500) }), { storable: false, reason: 'status' });
  assert.deepEqual(plain.storable({ request: request(), response: response({ vary: '*' }) }), { storable: false, reason: 'vary-star' });
  assert.deepEqual(plain.storable({ request: request(), response: response({ 'cache-control': 'max-age=60' }) }), {
    storable: true,
    ttlMs: 60000,
  });
});

test('store 出来的 entry 时间戳都对齐到 now', () => {
  const policy = policyAt(5000);
  const out = policy.store({
    request: { method: 'GET', url: 'https://api.example.com/x', headers: {} },
    response: { status: 200, headers: { date: at(), 'cache-control': 'max-age=60' } },
  });
  assert.equal(out.storable, true);
  assert.equal(out.entry.storedAt, NOW + 5000);
  assert.equal(out.entry.responseTime, NOW + 5000);
  assert.equal(out.entry.requestTime, NOW + 5000);
  assert.equal(policy.ageOf(out.entry), 5000);
});
