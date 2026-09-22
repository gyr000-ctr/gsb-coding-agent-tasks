import { createQueue } from '../lib/queue.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
let current = NOW;
const queue = createQueue({ clock: () => current, maxAttempts: 3 });
const at = (offset) => {
  current = NOW + offset;
};

console.log('taskqueue demo');

console.log('[1] 投三个任务（一个延迟 5 秒），先取两个');
queue.enqueue({ orderId: 'A-1' });
queue.enqueue({ orderId: 'A-2' }, { delayMs: 5000 });
queue.enqueue({ orderId: 'A-3' });
for (const job of queue.receive({ max: 2 })) {
  console.log(`    ${job.id} attempts=${job.attempts} receipt=${job.receipt}`);
}
console.log(`    ${JSON.stringify(queue.stats())}`);

console.log('[2] 一个处理成功，一个放回去 1 秒后再试');
queue.ack('job-1', 'r-job-1-1');
queue.nack('job-3', 'r-job-3-1', { delayMs: 1000 });
console.log(`    ${JSON.stringify(queue.stats())}`);

console.log('[3] 一秒后又能取到，次数变成 2');
at(1000);
const retried = queue.receive()[0];
console.log(`    ${retried.id} attempts=${retried.attempts} receipt=${retried.receipt}`);
console.log(`    ${JSON.stringify(queue.stats())}`);

console.log('[4] 这次既不 ack 也不 nack：超时之后它会自己回来');
at(31000);
console.log(`    ${JSON.stringify(queue.stats())}`);
const again = queue.receive({ max: 5 });
console.log(`    ${again.map((job) => `${job.id}(attempts=${job.attempts})`).join(' ')}`);

console.log('[5] 再拖一轮，超过三次就进死信');
at(61000);
console.log(`    ${queue.receive({ max: 5 }).map((job) => `${job.id}(attempts=${job.attempts})`).join(' ')}`);
console.log(`    ${JSON.stringify(queue.stats())}`);
console.log(`    deadLetters=${JSON.stringify(queue.deadLetters())}`);
