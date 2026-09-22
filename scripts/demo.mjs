import { createDispatcher } from '../lib/dispatcher.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
let current = NOW;
const hub = createDispatcher({ secret: 'demo-secret', clock: () => current, maxAttempts: 2, baseDelayMs: 1000 });
const at = (offset) => {
  current = NOW + offset;
};

console.log('webhookout demo');

console.log('[1] 两个订阅者：一个只要订单创建，一个两类都要');
const first = hub.subscribe({ url: 'https://crm.example.com/hook', events: ['order.created'] });
const second = hub.subscribe({ url: 'https://bi.example.com/hook', events: ['order.created', 'order.paid'] });
const dispatched = hub.dispatch({ id: 'evt-1', type: 'order.created', data: { id: 'A-9', amount: 30 } });
console.log(`    ${dispatched.created.map((one) => `${one.id}->${one.endpointId}`).join(' ')}`);
console.log(`    重复派发同一事件：${JSON.stringify(hub.dispatch({ id: 'evt-1', type: 'order.created' }).duplicates)}`);

console.log('[2] 一条投递长什么样');
const [delivery] = dispatched.created;
console.log(`    幂等键 ${delivery.headers['x-idempotency-key']}`);
console.log(`    签名 ${delivery.headers['x-signature']}`);
console.log(`    body ${delivery.body}`);

console.log('[3] 一个成功、一个 500 退避一秒再试');
console.log(`    ${dispatched.created[1].id} 成功 ${JSON.stringify(hub.report(dispatched.created[1].id, { status: 200 }))}`);
console.log(`    ${delivery.id} 第一次失败 ${JSON.stringify(hub.report(delivery.id, { status: 500 }))}`);
at(1000);
const retried = hub.due()[0];
console.log(`    一秒后到期的是 ${retried.id} attempt=${retried.attempt}`);
console.log(`    第二次失败 ${JSON.stringify(hub.report(retried.id, { status: 500 }))}`);

console.log('[4] 新事件里对方回 410：以后不投了');
const second2 = hub.dispatch({ id: 'evt-2', type: 'order.created' });
const doomed = second2.created.find((one) => one.endpointId === 'ep-2');
console.log(`    ${doomed.id} 收到 410 ${JSON.stringify(hub.report(doomed.id, { status: 410 }))}`);
console.log(`    再来一个事件只投给 ${hub.dispatch({ id: 'evt-3', type: 'order.created' }).created.map((one) => one.endpointId).join(',')}`);

console.log('[5] 统计');
console.log(`    ${JSON.stringify(hub.stats())}`);
console.log(`    订阅者 ${first.id}/${second.id} 现在禁用了 ${hub.stats().disabled} 个`);
