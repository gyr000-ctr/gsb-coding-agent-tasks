import { createSigner } from '../lib/signer.js';

const creds = {
  region: 'us-east-1',
  service: 'service',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};
const signerAt = (iso) => createSigner({ ...creds, clock: () => new Date(iso) });
const signer = signerAt('2015-08-30T12:36:00Z');

console.log('sigv4 demo');

console.log('[1] 官方 get-vanilla 向量');
const signed = signer.sign({ method: 'GET', url: 'https://example.amazonaws.com/' });
console.log(`    signature=${signed.signature}`);
console.log(`    签进去的头 ${signed.signedHeaders.join(',')}`);

console.log('[2] 大小写、多空格、多出来的查询参数都按同一套口径摆平');
const canonical = signer.canonical({
  method: 'POST',
  url: 'https://example.amazonaws.com/Items?b=2&a=1&a=',
  headers: { 'Content-Type': '  application/json ;  charset=utf-8 ' },
  body: '{"id":1}',
});
console.log(`    请求行 ${canonical.text.split('\n').slice(0, 3).join(' | ')}`);
console.log(`    头部 ${canonical.canonicalHeaders.split('\n')[0]}`);
console.log(`    载荷摘要 ${canonical.payloadHash}`);

console.log('[3] 同一个请求签两次一模一样');
const first = signer.sign({ method: 'POST', url: 'https://example.amazonaws.com/Items', body: 'hello' });
const second = signer.sign({ method: 'POST', url: 'https://example.amazonaws.com/Items', body: 'hello' });
console.log(`    ${first.signature === second.signature} ${first.signature}`);

console.log('[4] 改一个字节，验证直接报错');
try {
  signer.verify({ method: 'POST', url: 'https://example.amazonaws.com/Items', body: 'hellp', headers: first.headers });
} catch (err) {
  console.log(`    ${err.code}`);
}

console.log('[5] 时钟偏了十分钟');
const late = signerAt('2015-08-30T12:46:00Z');
try {
  late.verify({ method: 'GET', url: 'https://example.amazonaws.com/', headers: signed.headers });
} catch (err) {
  console.log(`    ${err.code}`);
}

console.log('[6] 预签名 URL 也有期限');
const url = new URL(signer.presign('https://example.amazonaws.com/report.csv?format=csv', { expiresIn: 300 }));
console.log(`    签了 ${url.searchParams.get('X-Amz-SignedHeaders')} 有效期 ${url.searchParams.get('X-Amz-Expires')} 秒`);
console.log(`    签名 ${url.searchParams.get('X-Amz-Signature').slice(0, 16)}...`);
try {
  signerAt('2015-08-30T12:41:01Z').verify({ method: 'GET', url: url.toString() });
} catch (err) {
  console.log(`    五分钟后 ${err.code}`);
}
