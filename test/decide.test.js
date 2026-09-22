import test from 'node:test';
import assert from 'node:assert/strict';
import { createCachePolicy, WARNINGS } from '../lib/policy.js';
import { formatHttpDate } from '../lib/parse.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const at = (offset = 0) => formatHttpDate(NOW + offset);

const policy = (shared = false) => createCachePolicy({ shared, clock: () => NOW });
const request = (headers = {}, method = 'GET') => ({ method, url: 'https://api.example.com/x', headers });

// 用 store 造 entry，省得手写时间戳；hash 里的 Date 决定它现在多旧。
function makeEntry(policyInstance, headers, options = {}) {
  const out = policyInstance.store({
    request: { method: options.method ?? 'GET', url: 'https://api.example.com/x', headers: options.requestHeaders ?? {} },
    response: { status: options.status ?? 200, headers: { date: at(), ...headers } },
  });
  assert.equal(out.storable, true, `期望能存下来，实际 ${out.reason}`);
  return out.entry;
}

const FRESH = { date: at(-10000), 'cache-control': 'max-age=60' };
const STALE = { date: at(-120000), 'cache-control': 'max-age=60' };

// 共享缓存不该存的那几种响应，store 会直接拒掉，只好手工摆一个出来。
function manualEntry(headers, requestHeaders = {}) {
  return {
    request: { method: 'GET', url: 'https://api.example.com/x', headers: requestHeaders },
    response: { status: 200, headers },
    storedAt: NOW,
    requestTime: NOW,
    responseTime: NOW,
  };
}

test('没 entry 就是 miss，only-if-cached 另算', () => {
  const p = policy();
  const miss = p.decide({ request: request() });
  assert.equal(miss.action, 'miss');
  assert.equal(miss.reason, 'no-entry');
  assert.deepEqual(miss.lifetime, { seconds: 0, source: 'none' });
  assert.deepEqual(miss.warnings, []);
  const only = p.decide({ request: request({ 'cache-control': 'only-if-cached' }) });
  assert.equal(only.action, 'only-if-cached-miss');
  assert.equal(only.reason, 'no-entry');
});

test('请求说不许用缓存就不查了，方法不对也不查', () => {
  const p = policy();
  const fresh = makeEntry(p, FRESH);
  const noStore = p.decide({ request: request({ 'cache-control': 'no-store' }), entry: fresh });
  assert.equal(noStore.action, 'miss');
  assert.equal(noStore.reason, 'request-no-store');
  const post = p.decide({ request: request({}, 'POST'), entry: fresh });
  assert.equal(post.action, 'miss');
  assert.equal(post.reason, 'method');
});

test('共享缓存不能用 private 响应，带凭证的请求也要 public 才认', () => {
  const shared = policy(true);
  const commons = { date: at(-10000), 'cache-control': 'max-age=60' };
  const privateEntry = manualEntry({ ...commons, 'cache-control': 'private, max-age=60' });
  const privateDecision = shared.decide({ request: request(), entry: privateEntry });
  assert.equal(privateDecision.action, 'miss');
  assert.equal(privateDecision.reason, 'private');

  const plainEntry = manualEntry(commons, { authorization: 'Bearer t' });
  const authorized = shared.decide({ request: request({ authorization: 'Bearer t' }), entry: plainEntry });
  assert.equal(authorized.action, 'miss');
  assert.equal(authorized.reason, 'authorized');

  const publicEntry = makeEntry(shared, { ...commons, 'cache-control': 'public, max-age=60' }, { requestHeaders: { authorization: 'Bearer t' } });
  const allowed = shared.decide({ request: request({ authorization: 'Bearer t' }), entry: publicEntry });
  assert.equal(allowed.action, 'hit');
  assert.equal(allowed.reason, 'fresh');
});

test('Vary 对不上就当没缓存', () => {
  const p = policy();
  const stored = makeEntry(p, { ...FRESH, vary: 'accept-encoding' }, { requestHeaders: { 'accept-encoding': 'gzip' } });
  const mismatch = p.decide({ request: request({ 'accept-encoding': 'br' }), entry: stored });
  assert.equal(mismatch.action, 'miss');
  assert.equal(mismatch.reason, 'vary');
  const match = p.decide({ request: request({ 'accept-encoding': 'gzip' }), entry: stored });
  assert.equal(match.action, 'hit');
  assert.equal(match.reason, 'fresh');
});

test('新鲜就命中，顺手把年龄和 113 警告带出来', () => {
  const p = policy();
  const hit = p.decide({ request: request(), entry: makeEntry(p, FRESH) });
  assert.deepEqual(
    { action: hit.action, reason: hit.reason, age: hit.age, staleBy: hit.staleBy, warnings: hit.warnings },
    { action: 'hit', reason: 'fresh', age: 10000, staleBy: 0, warnings: [] },
  );
  assert.deepEqual(hit.lifetime, { seconds: 60, source: 'max-age' });

  const heuristic = makeEntry(p, { date: at(-10000), 'last-modified': at(-3610000) });
  const guessed = p.decide({ request: request(), entry: heuristic });
  assert.equal(guessed.action, 'hit');
  assert.equal(guessed.lifetime.source, 'heuristic');
  assert.deepEqual(guessed.warnings, [WARNINGS.heuristic]);
});

test('请求侧的 no-cache / max-age / min-fresh 都能把命中顶掉', () => {
  const p = policy();
  const fresh = makeEntry(p, FRESH);
  assert.equal(p.decide({ request: request({ 'cache-control': 'no-cache' }), entry: fresh }).reason, 'request-no-cache');
  assert.equal(p.decide({ request: request({ 'cache-control': 'max-age=5' }), entry: fresh }).reason, 'request-max-age');
  assert.equal(p.decide({ request: request({ 'cache-control': 'min-fresh=60' }), entry: fresh }).reason, 'request-min-fresh');
  assert.equal(p.decide({ request: request({ 'cache-control': 'max-age=10' }), entry: fresh }).action, 'hit');
});

test('过期之后：no-cache / must-revalidate / proxy-revalidate 必须先问源站', () => {
  const p = policy();
  const shared = policy(true);
  const stale = makeEntry(p, STALE);
  assert.equal(p.decide({ request: request(), entry: stale }).reason, 'stale');
  assert.equal(p.decide({ request: request(), entry: makeEntry(p, { ...STALE, 'cache-control': 'max-age=60, no-cache' }) }).reason, 'no-cache');
  assert.equal(
    p.decide({ request: request(), entry: makeEntry(p, { ...STALE, 'cache-control': 'max-age=60, must-revalidate' }) }).reason,
    'must-revalidate',
  );
  const proxyEntry = makeEntry(shared, { ...STALE, 'cache-control': 'max-age=60, proxy-revalidate' });
  assert.equal(shared.decide({ request: request(), entry: proxyEntry }).reason, 'proxy-revalidate');
  assert.equal(p.decide({ request: request(), entry: proxyEntry }).action, 'revalidate');
});

test('stale-while-revalidate 的窗口之内可以先给旧的', () => {
  const p = policy();
  const entry = makeEntry(p, { ...STALE, 'cache-control': 'max-age=60, stale-while-revalidate=90' });
  const decision = p.decide({ request: request(), entry });
  assert.equal(decision.action, 'stale-while-revalidate');
  assert.equal(decision.staleBy, 60000);
  assert.deepEqual(decision.warnings, [WARNINGS.stale]);
  const tooLate = makeEntry(p, { ...STALE, 'cache-control': 'max-age=60, stale-while-revalidate=30' });
  assert.equal(p.decide({ request: request(), entry: tooLate }).reason, 'stale');
});

test('请求侧的 max-stale 能兜住过期，超范围就不行', () => {
  const p = policy();
  const entry = makeEntry(p, STALE);
  const any = p.decide({ request: request({ 'cache-control': 'max-stale' }), entry });
  assert.equal(any.action, 'hit');
  assert.equal(any.reason, 'max-stale');
  assert.deepEqual(any.warnings, [WARNINGS.stale]);
  const enough = p.decide({ request: request({ 'cache-control': 'max-stale=90' }), entry });
  assert.equal(enough.action, 'hit');
  const notEnough = p.decide({ request: request({ 'cache-control': 'max-stale=30' }), entry });
  assert.equal(notEnough.action, 'revalidate');
  assert.equal(notEnough.reason, 'stale');
});

test('only-if-cached 碰上过期条目只能报 504 那一类结果', () => {
  const p = policy();
  const decision = p.decide({ request: request({ 'cache-control': 'only-if-cached' }), entry: makeEntry(p, STALE) });
  assert.equal(decision.action, 'only-if-cached-miss');
  assert.equal(decision.reason, 'only-if-cached');
  assert.equal(decision.staleBy, 60000);
});

test('参数不合法时报哪个码', () => {
  const p = policy();
  assert.throws(() => p.decide({ request: { method: '', url: 'https://x' } }), { name: 'CacheError', code: 'ERR_BAD_REQUEST' });
  assert.throws(() => p.decide({ request: request(), entry: { storedAt: NOW } }), { name: 'CacheError', code: 'ERR_BAD_ENTRY' });
  assert.throws(() => p.decide({ request: request(), entry: { storedAt: NOW, response: { status: 99, headers: {} } } }), {
    name: 'CacheError',
    code: 'ERR_BAD_REQUEST',
  });
  assert.throws(() => p.ageOf({ storedAt: NOW, response: { status: 200, headers: {} }, requestTime: NOW, responseTime: NOW - 1 }), {
    name: 'CacheError',
    code: 'ERR_BAD_ENTRY',
  });
});
