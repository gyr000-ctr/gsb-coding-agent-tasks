import { createLockService } from '../lib/leaselock.js';

let now = 1_000;
const service = createLockService({ clock: () => now, defaultTtlMs: 500 });
const show = (label, value) => console.log(`    ${label} ${value}`);

console.log('leaselock demo');

console.log('[1] 拿到锁：token 从 1 开始');
const first = service.acquire({ key: 'orders/42', owner: 'worker-a', ttlMs: 400 });
show('token', `${first.token} 到期 ${first.expiresAt} 重入 ${first.reentrant}`);

console.log('[2] 同一个持有者再拿：重入，token 不变、租约顺延');
now += 100;
const again = service.acquire({ key: 'orders/42', owner: 'worker-a' });
show('token', `${again.token} 到期 ${again.expiresAt} 重入 ${again.reentrant}`);

console.log('[3] 别人来抢：被挡住');
try {
  service.acquire({ key: 'orders/42', owner: 'worker-b' });
} catch (err) {
  show('ERR', `${err.code} owner=${err.details.owner} remaining=${err.details.remainingMs}`);
}

console.log('[4] 租约到点就被判过期，换人换 token');
now = 1_600;
const third = service.acquire({ key: 'orders/42', owner: 'worker-b' });
show('token', `owner=${third.owner} token=${third.token} 到期 ${third.expiresAt}`);

console.log('[5] fencing：旧持有者的写入被挡掉');
show('checkFence', `a/1=${service.checkFence({ key: 'orders/42', token: 1 })} b/2=${service.checkFence({ key: 'orders/42', token: 2 })}`);

console.log('[6] 释放之后连自己也被挡');
service.release({ key: 'orders/42', owner: 'worker-b', token: 2 });
show('checkFence', `b/2=${service.checkFence({ key: 'orders/42', token: 2 })}`);
show('status', `${service.status({ key: 'orders/42' })}`);

console.log('[7] 统计');
console.log(`    ${JSON.stringify(service.stats())}`);
