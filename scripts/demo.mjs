import { createExecutor } from '../lib/executor.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
let current = NOW;
const executor = createExecutor({ clock: () => current, ttlMs: 86400000 });
const at = (offset) => {
  current = NOW + offset;
};

let calls = 0;
const charge = () => {
  calls += 1;
  return { orderId: 'A-1', charged: 30 * calls };
};

console.log('idempotent demo');

console.log('[1] 第一次提交');
console.log(`    ${JSON.stringify(executor.run({ key: 'order-A-1', fingerprint: 'body-hash-1' }, charge))}`);

console.log('[2] 网络重试，同一个 key 再提交一次');
console.log(`    ${JSON.stringify(executor.run({ key: 'order-A-1', fingerprint: 'body-hash-1' }, charge))}`);
console.log(`    handler 实际调用次数 ${calls}`);

console.log('[3] 同一个 key 换了请求内容');
try {
  executor.run({ key: 'order-A-1', fingerprint: 'body-hash-2' }, charge);
} catch (err) {
  console.log(`    ${err.code} key=${err.details.key}`);
}

console.log('[4] 一天之后记录过期，重新执行');
at(86400000);
console.log(`    has=${executor.has('order-A-1')} 结果 ${JSON.stringify(executor.run({ key: 'order-A-1', fingerprint: 'body-hash-1' }, charge))}`);
console.log(`    handler 实际调用次数 ${calls}`);

console.log('[5] 统计');
console.log(`    ${JSON.stringify(executor.stats())}`);
