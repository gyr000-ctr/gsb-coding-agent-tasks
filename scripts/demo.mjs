import { createCachePolicy } from '../lib/policy.js';
import { formatHttpDate } from '../lib/parse.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const at = (offset = 0) => formatHttpDate(NOW + offset);
const policy = createCachePolicy({ clock: () => NOW });
const shared = createCachePolicy({ shared: true, clock: () => NOW });
const request = (headers = {}) => ({ method: 'GET', url: 'https://api.example.com/x', headers });

const keep = (headers, requestHeaders = {}) => {
  const out = policy.store({
    request: { method: 'GET', url: 'https://api.example.com/x', headers: requestHeaders },
    response: { status: 200, headers: { date: at(), ...headers } },
  });
  return out.entry;
};

console.log('freshcache demo');

console.log('[1] 一条 max-age 响应现在还新鲜吗');
const fresh = keep({ date: at(-10000), 'cache-control': 'max-age=60' });
const hit = policy.decide({ request: request(), entry: fresh });
console.log(`    ${hit.action}/${hit.reason} 年龄 ${hit.age / 1000} 秒 新鲜期 ${hit.lifetime.seconds} 秒`);

console.log('[2] 过期两分钟，但还在 stale-while-revalidate 窗口里');
const stale = keep({ date: at(-120000), 'cache-control': 'max-age=60, stale-while-revalidate=90' });
const swr = policy.decide({ request: request(), entry: stale });
console.log(`    ${swr.action} 过期 ${swr.staleBy / 1000} 秒 警告 ${swr.warnings.join(' / ')}`);
const staleNoWindow = keep({ date: at(-120000), 'cache-control': 'max-age=60, stale-while-revalidate=30' });
console.log(`    窗口只有 30 秒时 ${policy.decide({ request: request(), entry: staleNoWindow }).reason}`);

console.log('[3] Vary 变了就得重新取');
const varied = keep({ date: at(-10000), 'cache-control': 'max-age=60', vary: 'accept-encoding' }, { 'accept-encoding': 'gzip' });
console.log(`    同一个 accept-encoding：${policy.decide({ request: request({ 'accept-encoding': 'gzip' }), entry: varied }).action}`);
console.log(`    换成 br：${policy.decide({ request: request({ 'accept-encoding': 'br' }), entry: varied }).reason}`);

console.log('[4] 共享缓存还要看 private 和 Authorization');
const privateEntry = {
  request: { method: 'GET', url: 'https://api.example.com/x', headers: {} },
  response: { status: 200, headers: { date: at(-10000), 'cache-control': 'private, max-age=60' } },
  storedAt: NOW,
  requestTime: NOW,
  responseTime: NOW,
};
console.log(`    private：${shared.decide({ request: request(), entry: privateEntry }).reason}`);
const authorizedEntry = {
  ...privateEntry,
  response: { status: 200, headers: { date: at(-10000), 'cache-control': 'max-age=60' } },
};
console.log(`    带 Authorization：${shared.decide({ request: request({ authorization: 'Bearer t' }), entry: authorizedEntry }).reason}`);

console.log('[5] 304 回来，只更新该更新的');
const old = keep({ date: at(-120000), 'cache-control': 'max-age=60', etag: '"v1"', 'content-length': '100' });
const merged = policy.revalidate({
  entry: old,
  response: { status: 304, headers: { date: at(), 'cache-control': 'max-age=300', etag: '"v2"', 'content-length': '0' } },
});
console.log(`    updated=${merged.updated.join(',')}`);
console.log(`    kept=${merged.kept.join(',')}`);
console.log(`    合并后还新鲜吗 ${policy.isFresh(merged.entry)} 新鲜期 ${policy.freshnessLifetime(merged.entry.response).seconds} 秒`);
