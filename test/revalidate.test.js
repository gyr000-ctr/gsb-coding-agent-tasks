import test from 'node:test';
import assert from 'node:assert/strict';
import { createCachePolicy, NEVER_UPDATED } from '../lib/policy.js';
import { formatHttpDate } from '../lib/parse.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const at = (offset = 0) => formatHttpDate(NOW + offset);

const policy = () => createCachePolicy({ clock: () => NOW });

function stored(policyInstance, headers) {
  return policyInstance.store({
    request: { method: 'GET', url: 'https://api.example.com/x', headers: { 'accept-encoding': 'gzip' } },
    response: { status: 200, headers: { date: at(-120000), 'cache-control': 'max-age=60', ...headers } },
  }).entry;
}

test('304 带回来的头覆盖旧值，新鲜度从这次重新算', () => {
  const p = policy();
  const before = stored(p, { etag: '"v1"', 'content-length': '100', 'x-a': '1' });
  assert.equal(p.isFresh(before), false);
  const out = p.revalidate({
    entry: before,
    response: {
      status: 304,
      headers: { date: at(), 'cache-control': 'max-age=300', etag: '"v2"', 'x-a': '2', 'content-length': '0' },
    },
  });
  assert.deepEqual(out.updated, ['cache-control', 'date', 'etag', 'x-a']);
  assert.deepEqual(out.kept, ['content-length']);
  assert.equal(out.entry.response.headers.etag, '"v2"');
  assert.equal(out.entry.response.headers['x-a'], '2');
  assert.equal(out.entry.response.headers['content-length'], '100');
  assert.equal(out.entry.response.headers['cache-control'], 'max-age=300');
  assert.equal(out.entry.storedAt, NOW);
  assert.equal(p.ageOf(out.entry), 0);
  assert.equal(p.isFresh(out.entry), true);
  assert.deepEqual(p.freshnessLifetime(out.entry.response), { seconds: 300, source: 'max-age' });
});

test('合并出来的头名一律小写，原 entry 不动', () => {
  const p = policy();
  const before = stored(p, { ETag: '"v1"' });
  const out = p.revalidate({
    entry: before,
    response: { status: 304, headers: { 'Cache-Control': 'max-age=120', ETag: '"v2"' } },
  });
  assert.deepEqual(out.entry.response.headers['cache-control'], 'max-age=120');
  assert.equal(out.entry.response.headers.etag, '"v2"');
  assert.equal(before.storedAt, NOW);
  assert.equal(before.response.headers.ETag, '"v1"');
  assert.equal(before.response.headers['cache-control'], 'max-age=60');
});

test('不覆盖的字段就是那四个，304 自己的也没问题', () => {
  const p = policy();
  const before = stored(p, {
    'content-length': '100',
    'content-range': 'bytes 0-99/100',
    connection: 'keep-alive',
    'transfer-encoding': 'chunked',
  });
  const out = p.revalidate({
    entry: before,
    response: {
      status: 304,
      headers: {
        'content-length': '0',
        'content-range': 'bytes 0-9/10',
        connection: 'close',
        'transfer-encoding': 'identity',
        'x-new': '1',
      },
    },
  });
  assert.deepEqual(out.kept, [...NEVER_UPDATED].sort());
  assert.deepEqual(out.updated, ['x-new']);
  assert.equal(out.entry.response.headers['content-length'], '100');
  assert.equal(out.entry.response.headers.connection, 'keep-alive');
  assert.equal(out.entry.response.headers['x-new'], '1');
});

test('不是 304 就别走这条路', () => {
  const p = policy();
  assert.throws(() => p.revalidate({ entry: stored(p, {}), response: { status: 200, headers: {} } }), {
    name: 'CacheError',
    code: 'ERR_BAD_REQUEST',
  });
  assert.throws(() => p.revalidate({ response: { status: 304, headers: {} } }), {
    name: 'CacheError',
    code: 'ERR_BAD_ENTRY',
  });
});
