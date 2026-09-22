import { generateKeyPairSync } from 'node:crypto';
import { createVerifier } from '../lib/verifier.js';
import { encodeSegment, signToken } from '../lib/jose.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const NOW_SECONDS = NOW / 1000;

const makeKey = (kid) => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, alg: 'RS256', jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' }, privateKey };
};

const key = makeKey('demo-1');
const spare = makeKey('demo-2');
const config = { issuer: 'https://auth.example.com', audience: ['api', 'web'], jwks: [key.jwk] };
const verifier = createVerifier({ ...config, clock: () => NOW });
const claims = (extra = {}) => ({
  iss: 'https://auth.example.com',
  aud: 'api',
  sub: 'user-42',
  iat: NOW_SECONDS,
  exp: NOW_SECONDS + 3600,
  ...extra,
});
const sign = (payload, header = {}) =>
  signToken({ header: { alg: 'RS256', kid: 'demo-1', typ: 'JWT', ...header }, payload, privateKey: key.privateKey });

console.log('jwksguard demo');

console.log('[1] 一个正常的 RS256 token');
const ok = verifier.verify(sign(claims()));
console.log(`    sub=${ok.claims.sub} kid=${ok.kid} alg=${ok.alg} expiresAt=${ok.expiresAt}`);

console.log('[2] 过期边界：偏移 30 秒之内还认，之外就拒');
const soon = sign(claims({ exp: NOW_SECONDS + 60 }));
console.log(`    90 秒后（正好差 30 秒）：${createVerifier({ ...config, clockSkewMs: 30000, clock: () => NOW + 90000 }).verify(soon).kid}`);
try {
  createVerifier({ ...config, clockSkewMs: 30000, clock: () => NOW + 90001 }).verify(soon);
} catch (err) {
  console.log(`    再多 1 毫秒：${err.code}`);
}

console.log('[3] 受众不对、算法不对、签名不对分别报什么');
try {
  verifier.verify(sign(claims({ aud: 'mobile' })));
} catch (err) {
  console.log(`    aud=mobile：${err.code}`);
}
const handRolled = `${encodeSegment({ alg: 'HS256', kid: 'demo-1' })}.${encodeSegment(claims())}.${Buffer.from('sig').toString('base64url')}`;
try {
  verifier.verify(handRolled);
} catch (err) {
  console.log(`    alg=HS256：${err.code}`);
}
const good = sign(claims());
const [header, , signature] = good.split('.');
try {
  verifier.verify(`${header}.${encodeSegment(claims({ sub: 'hacker' }))}.${signature}`);
} catch (err) {
  console.log(`    改了 payload：${err.code}`);
}

console.log('[4] 轮换钥匙之后旧的 kid 就不认了');
verifier.rotate([spare.jwk]);
console.log(`    现在挂着 ${verifier.keys().join(',')}`);
try {
  verifier.verify(good);
} catch (err) {
  console.log(`    旧 kid：${err.code}`);
}
