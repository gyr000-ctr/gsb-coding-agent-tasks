import test from 'node:test';
import assert from 'node:assert/strict';
import { createCachePolicy } from '../lib/policy.js';
import { formatHttpDate, headerValue, parseHttpDate, splitList } from '../lib/parse.js';

const policy = createCachePolicy({ clock: () => 0 });

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'CacheError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('普通指令、开关指令、大小写和空白', () => {
  assert.deepEqual(policy.parseCacheControl('max-age=60, no-cache, immutable'), {
    'max-age': 60,
    'no-cache': true,
    immutable: true,
  });
  assert.deepEqual(policy.parseCacheControl('  Max-Age = 60 ,  NO-STORE '), {
    'max-age': 60,
    'no-store': true,
  });
  assert.deepEqual(policy.parseCacheControl(undefined), {});
  assert.deepEqual(policy.parseCacheControl('   '), {});
});

test('带引号的值先去引号，引号里的逗号不算分隔', () => {
  assert.deepEqual(policy.parseCacheControl('no-cache="set-cookie", max-age="120"'), {
    'no-cache': 'set-cookie',
    'max-age': 120,
  });
  assert.deepEqual(policy.parseCacheControl('private="x, y", max-age=5'), {
    private: 'x, y',
    'max-age': 5,
  });
});

test('数值指令的值不是纯非负整数就整条丢掉，别的指令照收', () => {
  assert.deepEqual(policy.parseCacheControl('max-age=abc, s-maxage=-5, stale-while-revalidate=30'), {
    'stale-while-revalidate': 30,
  });
  assert.deepEqual(policy.parseCacheControl('max-age=0'), { 'max-age': 0 });
});

test('同名指令只认第一个，max-stale 不带值表示随便多久', () => {
  assert.deepEqual(policy.parseCacheControl('max-age=10, max-age=20'), { 'max-age': 10 });
  assert.deepEqual(policy.parseCacheControl('max-stale'), { 'max-stale': true });
  assert.deepEqual(policy.parseCacheControl('max-stale=30'), { 'max-stale': 30 });
});

test('头部取值大小写不敏感，同名合并，缺省给 undefined', () => {
  const headers = { 'X-A': '1', 'x-a': '2', 'Content-Type': 'text/plain' };
  assert.equal(headerValue(headers, 'X-A'), '1, 2');
  assert.equal(headerValue(headers, 'content-type'), 'text/plain');
  assert.equal(headerValue(headers, 'missing'), undefined);
  assert.equal(headerValue(undefined, 'x'), undefined);
  expectError(() => headerValue([], 'x'), 'ERR_BAD_REQUEST');
});

test('列表头和 HTTP 日期', () => {
  assert.deepEqual(splitList('gzip, br ,, identity'), ['gzip', 'br', 'identity']);
  assert.deepEqual(splitList(''), []);
  assert.equal(parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT'), 784111777000);
  assert.equal(Number.isNaN(parseHttpDate('nonsense')), true);
  assert.equal(Number.isNaN(parseHttpDate(undefined)), true);
  assert.equal(formatHttpDate(784111777000), 'Sun, 06 Nov 1994 08:49:37 GMT');
});

test('配置不合法就直接拒掉', () => {
  expectError(() => createCachePolicy({ shared: 'yes' }), 'ERR_BAD_CONFIG');
  expectError(() => createCachePolicy({ clock: 123 }), 'ERR_BAD_CONFIG');
  expectError(() => createCachePolicy({ clock: () => 'nope' }).now(), 'ERR_BAD_CONFIG');
  assert.equal(createCachePolicy({ clock: () => 0 }).now(), 0);
});
