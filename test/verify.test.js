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

const signed = (url = 'https://files.example.com/d?b=2&a=1', options = {}) => signer().sign(url, options);

test('自己签的链接能验过，返回过期时间', () => {
  const checked = signer().verify(signed());
  assert.equal(checked.expiresAt, (NOW / 1000 + 3600) * 1000);
});

test('改参数、改路径都会让签名对不上', () => {
  const url = signed();
  expectError(() => signer().verify(url.replace('a=1', 'a=2')), 'ERR_SIGNATURE');
  expectError(() => signer().verify(url.replace('/d?', '/e?')), 'ERR_SIGNATURE');
  expectError(() => signer().verify(`${url}&extra=1`), 'ERR_SIGNATURE');
});

test('方法不一致也验不过', () => {
  const url = signer().sign('https://files.example.com/d', { method: 'POST' });
  assert.equal(signer().verify(url, { method: 'POST' }).expiresAt, (NOW / 1000 + 3600) * 1000);
  expectError(() => signer().verify(url), 'ERR_SIGNATURE');
});

test('换一把钥匙验不过', () => {
  expectError(() => signer({ secret: 'other' }).verify(signed()), 'ERR_SIGNATURE');
});

test('过期按秒算，到点那一刻就算过期', () => {
  const url = signed('https://files.example.com/d', { ttlMs: 60000 });
  assert.equal(signer({ clock: () => NOW + 59999 }).verify(url).expiresAt, NOW + 60000);
  expectError(() => signer({ clock: () => NOW + 60000 }).verify(url), 'ERR_EXPIRED');
  expectError(() => signer({ clock: () => NOW + 120000 }).verify(url), 'ERR_EXPIRED');
});

test('缺参数或者 e 不是整数都算坏链接', () => {
  const url = new URL(signed());
  const withoutS = new URL(url);
  withoutS.searchParams.delete(PARAMS.signature);
  const withoutE = new URL(url);
  withoutE.searchParams.delete(PARAMS.expires);
  const badE = new URL(url);
  badE.searchParams.set(PARAMS.expires, 'tomorrow');
  expectError(() => signer().verify(withoutS.toString()), 'ERR_BAD_LINK');
  expectError(() => signer().verify(withoutE.toString()), 'ERR_BAD_LINK');
  expectError(() => signer().verify(badE.toString()), 'ERR_BAD_LINK');
  expectError(() => signer().verify('nonsense'), 'ERR_BAD_LINK');
});
