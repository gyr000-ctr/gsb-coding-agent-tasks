import { createCache } from '../lib/cache.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
let current = NOW;
const store = createCache({ capacity: 2, ttlMs: 1000, clock: () => current });
const at = (offset) => {
  current = NOW + offset;
};

console.log('ttlcache demo');

console.log('[1] 容量 2，塞第三个先把最久没用的挤掉');
store.set('user:1', { name: 'an' });
store.set('user:2', { name: 'bo' });
console.log(`    evicted=${JSON.stringify(store.set('user:3', { name: 'cy' }).evicted)}`);
console.log(`    剩下的 ${store.keys().join(',')}`);

console.log('[2] 读过的键会被挪到最新');
store.set('user:1', { name: 'an' });
console.log(`    读 user:3 之后 ${store.get('user:3') === undefined ? 'miss' : 'hit'}`);
console.log(`    再塞一个挤掉 ${JSON.stringify(store.set('user:4', { name: 'de' }).evicted)}`);
console.log(`    现在有 ${store.keys().join(',')}`);

console.log('[3] TTL 到点');
store.set('token', 'abc');
at(999);
console.log(`    999 毫秒时 ${store.get('token')}`);
at(1000);
console.log(`    1000 毫秒时 ${store.get('token')}`);

console.log('[4] 统计');
const stats = store.stats();
console.log(`    hits=${stats.hits} misses=${stats.misses} evictions=${stats.evictions} expirations=${stats.expirations} size=${stats.size}`);

console.log('[5] prune 会返回清掉几个');
store.set('old', 1);
at(5000);
console.log(`    ${store.prune()}`);
