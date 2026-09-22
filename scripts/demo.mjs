import { createRetryPolicy } from '../lib/retry.js';

const policy = createRetryPolicy({ maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2000 });
const line = (out) => `retry=${out.retry} delay=${out.delayMs} ${out.reason}`;

console.log('retryplan demo');

console.log('[1] 默认策略：最多试三次');
for (const attempt of [1, 2, 3]) {
  console.log(`    attempt=${attempt} ${line(policy.next({ attempt, error: {} }))}`);
}

console.log('[2] 服务端给了 Retry-After 就听它的');
console.log(`    ${line(policy.next({ attempt: 1, error: { retryAfterMs: 1500 } }))}`);

console.log('[3] Retry-After 超过上限要截断');
console.log(`    ${line(policy.next({ attempt: 1, error: { retryAfterMs: 9000 } }))}`);

console.log('[4] 不该重试的错误');
console.log(`    ${line(policy.next({ attempt: 1, error: { retryable: false } }))}`);

console.log('[5] full jitter（随机数固定成 0.5）');
const jittered = createRetryPolicy({ maxAttempts: 3, baseDelayMs: 100, jitter: 'full', random: () => 0.5 });
console.log(`    ${line(jittered.next({ attempt: 1, error: {} }))}`);

console.log('[6] 延迟封顶');
console.log(`    ${line(createRetryPolicy({ maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 250 }).next({ attempt: 4, error: {} }))}`);
