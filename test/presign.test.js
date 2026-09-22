import test from 'node:test';
import assert from 'node:assert/strict';
import { createSigner } from '../lib/signer.js';

const CREDS = {
  region: 'us-east-1',
  service: 'service',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};
const NOON = Date.parse('2015-08-30T12:36:00Z');

const signer = (ms = NOON) => createSigner({ ...CREDS, clock: () => new Date(ms) });

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

test('预签名 URL 带齐六个参数，签名是 64 位十六进制', () => {
  const url = new URL(signer().presign('https://example.amazonaws.com/x?a=1'));
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(url.searchParams.get('X-Amz-Credential'), 'AKIDEXAMPLE/20150830/us-east-1/service/aws4_request');
  assert.equal(url.searchParams.get('X-Amz-Date'), '20150830T123600Z');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '900');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
  assert.equal(url.searchParams.get('a'), '1');
});

test('预签名 URL 能被自己验过', () => {
  const signerAtNoon = signer();
  const url = signerAtNoon.presign('https://example.amazonaws.com/x?a=1');
  const checked = signerAtNoon.verify({ method: 'GET', url });
  assert.equal(checked.accessKeyId, 'AKIDEXAMPLE');
  assert.equal(checked.expiresIn, 900);
  assert.deepEqual(checked.signedHeaders, ['host']);
  assert.equal(checked.payloadHash, 'UNSIGNED-PAYLOAD');
});

test('过期按 X-Amz-Expires 算，边界那一秒还能用', () => {
  const url = signer().presign('https://example.amazonaws.com/x', { expiresIn: 60 });
  assert.equal(signer(NOON + 60000).verify({ method: 'GET', url }).expiresIn, 60);
  expectError(() => signer(NOON + 61000).verify({ method: 'GET', url }), 'ERR_EXPIRED');
});

test('expiresIn 不合法就拒签', () => {
  for (const expiresIn of [0, -1, 604801, 1.5, '60']) {
    expectError(() => signer().presign('https://example.amazonaws.com/x', { expiresIn }), 'ERR_BAD_EXPIRES');
  }
  assert.ok(signer().presign('https://example.amazonaws.com/x', { expiresIn: 604800 }));
});

test('改查询参数或者多挂一个参数，签名就废了', () => {
  const url = signer().presign('https://example.amazonaws.com/x?a=1');
  const tampered = url.replace('a=1', 'a=2');
  expectError(() => signer().verify({ method: 'GET', url: tampered }), 'ERR_SIGNATURE_MISMATCH');
  expectError(() => signer().verify({ method: 'GET', url: `${url}&extra=1` }), 'ERR_SIGNATURE_MISMATCH');
});

test('额外签进去的头必须原样带上', () => {
  const url = signer().presign('https://example.amazonaws.com/x', {
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(new URL(url).searchParams.get('X-Amz-SignedHeaders'), 'content-type;host');
  const headers = { 'content-type': 'application/json' };
  signer().verify({ method: 'GET', url, headers });
  expectError(() => signer().verify({ method: 'GET', url, headers: { 'content-type': 'text/plain' } }), 'ERR_SIGNATURE_MISMATCH');
  expectError(() => signer().verify({ method: 'GET', url, headers: {} }), 'ERR_BAD_AUTHZ');
});

test('预签名参数缺项、或者和 Authorization 头同时出现都算坏请求', () => {
  const url = new URL(signer().presign('https://example.amazonaws.com/x'));
  url.searchParams.delete('X-Amz-Expires');
  expectError(() => signer().verify({ method: 'GET', url: url.toString() }), 'ERR_BAD_AUTHZ');

  const signed = signer().sign({ method: 'GET', url: 'https://example.amazonaws.com/x' });
  const both = signer().presign('https://example.amazonaws.com/x');
  expectError(
    () => signer().verify({ method: 'GET', url: both, headers: { authorization: signed.authorization } }),
    'ERR_BAD_AUTHZ',
  );
});

test('预签名只认期限，不套用时间偏移那一套', () => {
  const url = signer().presign('https://example.amazonaws.com/x', { expiresIn: 86400 });
  assert.equal(signer(NOON + 3600000).verify({ method: 'GET', url }).expiresIn, 86400);
});
