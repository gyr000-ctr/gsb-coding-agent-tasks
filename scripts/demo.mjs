import { createAuditLog } from '../lib/audit.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const DAY = 86400000;
let current = NOW;
const audit = createAuditLog({ clock: () => current, retentionMs: 7 * DAY, maxEvents: 100 });
const at = (offset) => {
  current = NOW + offset;
};

console.log('auditlog demo');

console.log('[1] 写三条事件');
audit.append({ actor: 'u-1', action: 'auth.login', meta: { password: 'hunter2', ip: '10.0.0.1' } });
audit.append({ actor: 'u-1', action: 'order.refund', target: 'A-9', at: NOW + 60000 });
audit.append({ actor: 'u-2', action: 'auth.login', at: NOW + 120000 });
console.log(`    ${audit.query().map((one) => `${one.id}@${one.at - NOW}`).join(' ')}`);

console.log('[2] 敏感字段已经变成 ***');
console.log(`    ${JSON.stringify(audit.query({ action: 'auth.login' })[0].meta)}`);

console.log('[3] 按操作人查');
console.log(`    u-1 -> ${audit.query({ actor: 'u-1' }).map((one) => one.action).join(',')}`);

console.log('[4] 七天前的事件会被清掉');
at(8 * DAY);
audit.append({ actor: 'u-3', action: 'export' });
console.log(`    现在剩 ${audit.query().map((one) => one.id).join(',')}`);

console.log('[5] 统计');
console.log(`    ${JSON.stringify(audit.stats())}`);
