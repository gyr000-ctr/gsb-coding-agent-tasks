import { createLinkSigner, PARAMS } from '../lib/link.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const signerAt = (offset = 0) => createLinkSigner({ secret: 'demo-secret', clock: () => NOW + offset, ttlMs: 300000 });
const signer = signerAt();

console.log('linkguard demo');

console.log('[1] 给一份报告签一条下载链接');
const signed = signer.sign('https://files.example.com/report/2026 q1.csv?download=1');
const url = new URL(signed);
console.log(`    路径 ${decodeURIComponent(url.pathname)}`);
console.log(`    签名 ${url.searchParams.get(PARAMS.signature)} 过期 ${url.searchParams.get(PARAMS.expires)}`);

console.log('[2] 参数顺序和空格写法换一下，签名不变');
const other = signer.sign('https://files.example.com/report/2026%20q1.csv?download=1');
console.log(`    ${new URL(other).searchParams.get(PARAMS.signature) === url.searchParams.get(PARAMS.signature)}`);

console.log('[3] 改一个参数就验不过');
try {
  signer.verify(signed.replace('download=1', 'download=2'));
} catch (err) {
  console.log(`    ${err.code}`);
}

console.log('[4] 五分钟之后链接过期');
console.log(`    299 秒时 ${signerAt(299000).verify(signed).expiresAt}`);
try {
  signerAt(300000).verify(signed);
} catch (err) {
  console.log(`    300 秒时 ${err.code}`);
}

console.log('[5] 把签名参数删掉就是坏链接');
const broken = new URL(signed);
broken.searchParams.delete(PARAMS.signature);
try {
  signer.verify(broken.toString());
} catch (err) {
  console.log(`    ${err.code}`);
}
