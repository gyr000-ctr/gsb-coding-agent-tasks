import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkSigner, PARAMS } from '../lib/link.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const signer = (extra = {}) => createLinkSigner({ secret: 's3cret', clock: () => NOW, ...extra });

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'LinkError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('签出来的链接带上过期时间和 16 位签名', () => {
  const signed = new URL(signer().sign('https://files.example.com/report.csv'));
  assert.equal(signed.searchParams.get(PARAMS.expires), String(NOW / 1000 + 3600));
  assert.match(signed.searchParams.get(PARAMS.signature), /^[0-9a-f]{16}$/);
  assert.equal(signed.pathname, '/report.csv');
});

test('参数顺序和路径写法不影响签名', () => {
  const first = signer().sign('https://files.example.com/a%20b/中文?b=2&a=1');
  const second = signer().sign('https://files.example.com/a b/中文?a=1&b=2');
  const one = new URL(first).searchParams.get(PARAMS.signature);
  const two = new URL(second).searchParams.get(PARAMS.signature);
  assert.equal(one, two);
});

test('同名参数按值排序，写在前写在后都一样', () => {
  const one = new URL(signer().sign('https://files.example.com/d?a=2&a=1')).searchParams.get(PARAMS.signature);
  const two = new URL(signer().sign('https://files.example.com/d?a=1&a=2')).searchParams.get(PARAMS.signature);
  assert.equal(one, two);
});

test('重新签会顶掉旧的 e 和 s，只留一组', () => {
  const once = signer().sign('https://files.example.com/d?e=1&s=deadbeefdeadbeef');
  const twice = signer().sign(once);
  const url = new URL(twice);
  assert.equal(url.searchParams.getAll(PARAMS.expires).length, 1);
  assert.equal(url.searchParams.getAll(PARAMS.signature).length, 1);
  assert.notEqual(url.searchParams.get(PARAMS.signature), 'deadbeefdeadbeef');
});

test('ttl 可以由构造参数或每次调用覆盖', () => {
  assert.equal(new URL(signer({ ttlMs: 60000 }).sign('https://files.example.com/d')).searchParams.get(PARAMS.expires), String(NOW / 1000 + 60));
  assert.equal(
    new URL(signer().sign('https://files.example.com/d', { ttlMs: 5000 })).searchParams.get(PARAMS.expires),
    String(NOW / 1000 + 5),
  );
});

test('配置和链接不合法时报哪个码', () => {
  expectError(() => createLinkSigner({ secret: '' }), 'ERR_BAD_CONFIG');
  expectError(() => createLinkSigner({ secret: 'x', clock: 123 }), 'ERR_BAD_CONFIG');
  expectError(() => createLinkSigner({ secret: 'x', ttlMs: 0 }), 'ERR_BAD_CONFIG');
  expectError(() => createLinkSigner({ secret: 'x', ttlMs: '60' }), 'ERR_BAD_CONFIG');
  expectError(() => signer().sign('/relative/path'), 'ERR_BAD_LINK');
  expectError(() => signer().sign('ftp://files.example.com/d'), 'ERR_BAD_LINK');
  expectError(() => signer().sign(''), 'ERR_BAD_LINK');
});

test('换一把钥匙签出来就不一样', () => {
  const a = new URL(signer().sign('https://files.example.com/d')).searchParams.get(PARAMS.signature);
  const b = new URL(signer({ secret: 'other' }).sign('https://files.example.com/d')).searchParams.get(PARAMS.signature);
  assert.notEqual(a, b);
});
