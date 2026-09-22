import test from 'node:test';
import assert from 'node:assert/strict';
import { createSigner, SKIP_HEADERS } from '../lib/signer.js';
import { encodeRfc3986, sha256Hex } from '../lib/encode.js';

const CREDS = {
  region: 'us-east-1',
  service: 'service',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};
const AT_NOON = () => new Date('2015-08-30T12:36:00Z');

const signer = (extra = {}) => createSigner({ ...CREDS, clock: AT_NOON, ...extra });

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'SignError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('encodeRfc3986 按字节编码，只放过 A-Za-z0-9-._~', () => {
  assert.equal(encodeRfc3986('a b/c'), 'a%20b%2Fc');
  assert.equal(encodeRfc3986('a=b&c'), 'a%3Db%26c');
  assert.equal(encodeRfc3986('-._~'), '-._~');
  assert.equal(encodeRfc3986('*!'), '%2A%21');
  assert.equal(encodeRfc3986('中文'), '%E4%B8%AD%E6%96%87');
});

test('规范 URI 按段重编码，已经写好的转义不会被编两遍', () => {
  const one = signer().canonical({ method: 'GET', url: 'https://example.amazonaws.com/a%20b/中文' });
  assert.equal(one.canonicalUri, '/a%20b/%E4%B8%AD%E6%96%87');
  const two = signer().canonical({ method: 'GET', url: 'https://example.amazonaws.com/a b/中文' });
  assert.equal(two.canonicalUri, one.canonicalUri);
  const three = signer().canonical({ method: 'GET', url: 'https://example.amazonaws.com' });
  assert.equal(three.canonicalUri, '/');
});

test('规范查询串按编码后的键、值排序，空值也留着', () => {
  const out = signer().canonical({
    method: 'GET',
    url: 'https://example.amazonaws.com/s?b=2&a=1&a=&c=x%20y&d=%E4%B8%AD',
  });
  assert.equal(out.canonicalQuery, 'a=&a=1&b=2&c=x%20y&d=%E4%B8%AD');
});

test('查询串里的加号按空格处理，字面加号要写成 %2B', () => {
  const out = signer().canonical({ method: 'GET', url: 'https://example.amazonaws.com/s?q=a+b&r=a%2Bb' });
  assert.equal(out.canonicalQuery, 'q=a%20b&r=a%2Bb');
});

test('头部名小写、值去空白并把中间连续空白压成一个空格', () => {
  const out = signer().canonical({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    headers: {
      'Content-Type': '   application/json   ;   charset=utf-8  ',
      'X-Amz-Meta-Color': '\tblue\n',
    },
  });
  assert.deepEqual(out.signedHeaders, ['content-type', 'host', 'x-amz-date', 'x-amz-meta-color']);
  assert.match(out.canonicalHeaders, /^content-type:application\/json ; charset=utf-8\n/);
  assert.match(out.canonicalHeaders, /\nhost:example\.amazonaws\.com\n/);
  assert.match(out.canonicalHeaders, /\nx-amz-date:20150830T123600Z\n/);
  assert.match(out.canonicalHeaders, /\nx-amz-meta-color:blue\n$/);
});

test('同名头（大小写不同）按出现顺序合并成一行', () => {
  const out = signer().canonical({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    headers: { 'X-Amz-Meta': 'a', 'x-amz-meta': 'b' },
  });
  assert.deepEqual(out.signedHeaders, ['host', 'x-amz-date', 'x-amz-meta']);
  assert.match(out.canonicalHeaders, /x-amz-meta:a,b/);
});

test('传输层会改的头不参与签名，也可以自己再加几个', () => {
  const headers = { 'User-Agent': 'curl/8', Connection: 'keep-alive', 'Content-Length': '5', 'X-Trace': 't-1' };
  const plain = signer().canonical({ method: 'POST', url: 'https://example.amazonaws.com/', headers });
  assert.deepEqual(plain.signedHeaders, ['host', 'x-amz-date', 'x-trace']);
  const dropped = signer().canonical(
    { method: 'POST', url: 'https://example.amazonaws.com/', headers },
    { unsignedHeaders: ['X-Trace'] },
  );
  assert.deepEqual(dropped.signedHeaders, ['host', 'x-amz-date']);
  const kept = signer().canonical({
    method: 'POST',
    url: 'https://example.amazonaws.com/',
    headers: { 'X-Trace': 't-1', 'Content-Type': 'text/plain' },
  });
  assert.deepEqual(kept.signedHeaders, ['content-type', 'host', 'x-amz-date', 'x-trace']);
  assert.equal(SKIP_HEADERS.includes('user-agent'), true);
});

test('不给 host 时用 URL 的 host 补上，包括非默认端口', () => {
  const out = signer().canonical({ method: 'GET', url: 'https://api.example.com:8443/x' });
  assert.match(out.canonicalHeaders, /host:api\.example\.com:8443\n/);
});

test('头部值里带换行直接拒掉', () => {
  expectError(
    () => signer().canonical({ method: 'GET', url: 'https://example.amazonaws.com/', headers: { 'X-A': 'a\r\nX-B: b' } }),
    'ERR_BAD_REQUEST',
  );
});

test('没有 body 就是空串的摘要，显式给的 x-amz-content-sha256 优先', () => {
  const empty = signer().canonical({ method: 'GET', url: 'https://example.amazonaws.com/' });
  assert.equal(empty.payloadHash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const body = signer().canonical({ method: 'POST', url: 'https://example.amazonaws.com/', body: 'hello' });
  assert.equal(body.payloadHash, sha256Hex('hello'));
  const given = signer().canonical({
    method: 'POST',
    url: 'https://example.amazonaws.com/',
    headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
    body: 'hello',
  });
  assert.equal(given.payloadHash, 'UNSIGNED-PAYLOAD');
});

test('规范请求文本按 方法/URI/查询/头部/签名头/载荷摘要 六段拼', () => {
  const out = signer().canonical({ method: 'get', url: 'https://example.amazonaws.com/x?a=1' });
  const lines = out.text.split('\n');
  assert.equal(lines[0], 'GET');
  assert.equal(lines[1], '/x');
  assert.equal(lines[2], 'a=1');
  assert.equal(lines[3], 'host:example.amazonaws.com');
  assert.equal(lines[4], 'x-amz-date:20150830T123600Z');
  assert.equal(lines[5], '');
  assert.equal(lines[6], 'host;x-amz-date');
  assert.equal(lines[7], out.payloadHash);
});

test('配置和请求不合法时报哪个码', () => {
  expectError(() => createSigner({ region: '', service: 'service', accessKeyId: 'a', secretAccessKey: 'b' }), 'ERR_BAD_CONFIG');
  expectError(() => createSigner({ region: 'r', service: 's', accessKeyId: 'a' }), 'ERR_BAD_CONFIG');
  expectError(() => signer().canonical({ method: '', url: 'https://example.amazonaws.com/' }), 'ERR_BAD_REQUEST');
  expectError(() => signer().canonical({ method: 'GET', url: '/relative' }), 'ERR_BAD_REQUEST');
  expectError(() => signer().canonical({ method: 'GET', url: 'https://example.amazonaws.com/', body: 42 }), 'ERR_BAD_REQUEST');
});
