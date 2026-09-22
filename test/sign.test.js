import test from 'node:test';
import assert from 'node:assert/strict';
import { createSigner } from '../lib/signer.js';
import { sha256Hex } from '../lib/encode.js';

const CREDS = {
  region: 'us-east-1',
  service: 'service',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};
const NOON = '2015-08-30T12:36:00Z';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const VECTOR_SIGNATURE = '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31';

const signer = (iso = NOON) => createSigner({ ...CREDS, clock: () => new Date(iso) });

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

const REQUEST = {
  method: 'GET',
  url: 'https://example.amazonaws.com/',
  headers: {},
};

test('官方 get-vanilla 向量算出来的签名一致', () => {
  const out = signer().sign(REQUEST);
  assert.equal(out.dateTime, '20150830T123600Z');
  assert.deepEqual(out.signedHeaders, ['host', 'x-amz-date']);
  assert.equal(out.payloadHash, EMPTY_SHA256);
  assert.equal(out.signature, VECTOR_SIGNATURE);
  assert.equal(
    out.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
      `SignedHeaders=host;x-amz-date, Signature=${VECTOR_SIGNATURE}`,
  );
});

test('signer 自己写 x-amz-date，调用方给的那份会被顶掉', () => {
  const out = signer().sign({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    headers: { 'X-Amz-Date': '19990101T000000Z' },
  });
  assert.equal(out.headers['x-amz-date'], '20150830T123600Z');
  assert.equal(out.dateTime, '20150830T123600Z');
});

test('签出来的头部是小写键，原请求对象不被改动', () => {
  const request = {
    method: 'post',
    url: 'https://example.amazonaws.com/items?b=2&a=1',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'curl/8' },
    body: '{"a":1}',
  };
  const snapshot = JSON.parse(JSON.stringify(request));
  const out = signer().sign(request);
  assert.deepEqual(request, snapshot);
  assert.deepEqual(Object.keys(out.headers).sort(), [
    'authorization',
    'content-type',
    'host',
    'x-amz-date',
  ]);
  assert.equal(out.method, 'POST');
  assert.equal(out.payloadHash, sha256Hex('{"a":1}'));
  assert.match(out.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request, /);
});

test('换密钥、换 body 都会换签名，同一个请求签两次要一模一样', () => {
  const request = { method: 'POST', url: 'https://example.amazonaws.com/x', body: 'a' };
  const first = signer().sign(request);
  const again = signer().sign(request);
  assert.equal(first.signature, again.signature);
  const other = createSigner({ ...CREDS, secretAccessKey: `${CREDS.secretAccessKey}x`, clock: () => new Date(NOON) });
  assert.notEqual(other.sign(request).signature, first.signature);
  const changed = signer().sign({ ...request, body: 'b' });
  assert.notEqual(changed.signature, first.signature);
});

test('签完再验能过，Authorization 大小写不敏感也能读到', () => {
  const out = signer().sign({ ...REQUEST, body: 'hello' });
  const checked = signer().verify({
    method: 'GET',
    url: REQUEST.url,
    body: 'hello',
    headers: { ...out.headers, Authorization: out.authorization },
  });
  assert.equal(checked.accessKeyId, 'AKIDEXAMPLE');
  assert.equal(checked.scope, '20150830/us-east-1/service/aws4_request');
  assert.deepEqual(checked.signedHeaders, ['host', 'x-amz-date']);
  assert.equal(checked.signature, out.signature);
});

test('改 body 但没带 x-amz-content-sha256 时，签名对不上', () => {
  const out = signer().sign({ method: 'POST', url: REQUEST.url, body: 'hello' });
  expectError(
    () => signer().verify({ method: 'POST', url: REQUEST.url, body: 'hellp', headers: out.headers }),
    'ERR_SIGNATURE_MISMATCH',
  );
});

test('带了 x-amz-content-sha256 就先比载荷摘要', () => {
  const body = 'hello';
  const out = signer().sign({
    method: 'POST',
    url: REQUEST.url,
    body,
    headers: { 'x-amz-content-sha256': sha256Hex(body) },
  });
  assert.equal(out.payloadHash, sha256Hex(body));
  expectError(
    () => signer().verify({ method: 'POST', url: REQUEST.url, body: 'hellp', headers: out.headers }),
    'ERR_BAD_PAYLOAD_HASH',
  );
  assert.equal(signer().verify({ method: 'POST', url: REQUEST.url, body, headers: out.headers }).signature, out.signature);
});

test('改头、改查询串都会被认出来', () => {
  const out = signer().sign({ method: 'GET', url: 'https://example.amazonaws.com/x?a=1', headers: { 'X-A': '1' } });
  expectError(
    () => signer().verify({ method: 'GET', url: 'https://example.amazonaws.com/x?a=1', headers: { ...out.headers, 'x-a': '2' } }),
    'ERR_SIGNATURE_MISMATCH',
  );
  expectError(
    () => signer().verify({ method: 'GET', url: 'https://example.amazonaws.com/x?a=2', headers: out.headers }),
    'ERR_SIGNATURE_MISMATCH',
  );
});

test('超时、凭证或签名头不对时报哪个码', () => {
  const out = signer().sign(REQUEST);
  const late = createSigner({ ...CREDS, clock: () => new Date('2015-08-30T12:46:00Z') });
  expectError(() => late.verify({ method: 'GET', url: REQUEST.url, headers: out.headers }), 'ERR_CLOCK_SKEW');
  assert.equal(
    late.verify({ method: 'GET', url: REQUEST.url, headers: out.headers }, { skewMs: 600000 }).signature,
    out.signature,
  );
  const swappedKey = out.authorization.replace('AKIDEXAMPLE', 'AKIDOTHERXX');
  expectError(
    () => signer().verify({ method: 'GET', url: REQUEST.url, headers: { ...out.headers, authorization: swappedKey } }),
    'ERR_BAD_AUTHZ',
  );
  const noHost = out.authorization.replace('SignedHeaders=host;x-amz-date', 'SignedHeaders=x-amz-date');
  expectError(
    () => signer().verify({ method: 'GET', url: REQUEST.url, headers: { ...out.headers, authorization: noHost } }),
    'ERR_BAD_AUTHZ',
  );
  expectError(() => signer().verify({ method: 'GET', url: REQUEST.url, headers: {} }), 'ERR_BAD_AUTHZ');
  expectError(
    () => signer().verify({ method: 'GET', url: REQUEST.url, headers: { authorization: 'Basic abc' } }),
    'ERR_BAD_AUTHZ',
  );
});

test('换一个 region 的凭证验不过', () => {
  const out = signer().sign(REQUEST);
  expectError(
    () =>
      signer().verify({
        method: 'GET',
        url: REQUEST.url,
        headers: { ...out.headers, authorization: out.authorization.replace('us-east-1', 'eu-west-1') },
      }),
    'ERR_BAD_AUTHZ',
  );
});
