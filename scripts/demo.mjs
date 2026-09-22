import { createInvoicer } from '../lib/invoicer.js';

const T = (iso) => Date.parse(iso);
const day = (at) => new Date(at).toISOString().slice(0, 10);

const invoicer = createInvoicer({
  clock: () => T('2026-06-01T00:00:00Z'),
  plans: { basic: [{ from: 0, monthlyPrice: 2900 }] },
});
invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2026-01-01T00:00:00Z') });

console.log('invoicer demo');

console.log('[1] 出两个月：按自然月切片');
const first = invoicer.invoice({
  subscriptionId: 's1',
  periodStart: T('2026-01-01T00:00:00Z'),
  periodEnd: T('2026-03-01T00:00:00Z'),
});
console.log(`    ${first.lines.map((one) => `${day(one.from)}:${one.amount}`).join(' ')} 合计 ${first.total}`);

console.log('[2] 月中出账按月长摊');
const partial = invoicer.invoice({
  subscriptionId: 's1',
  periodStart: T('2026-03-01T00:00:00Z'),
  periodEnd: T('2026-03-16T00:00:00Z'),
});
console.log(`    3/16 截止 ${partial.total} 分（15/31 个月）`);

console.log('[3] 追溯把 2 月 10 号起的价格改成 99 元');
const changed = invoicer.setPrice({
  planId: 'basic',
  from: T('2026-02-10T00:00:00Z'),
  monthlyPrice: 9900,
});
console.log(`    待重算 ${changed.stale.join(',')}`);

console.log('[4] rebill 把差额补收回来');
const settled = invoicer.rebill({ invoiceId: 'inv-1' });
const billed = invoicer.listInvoices({ subscriptionId: 's1' })[0];
console.log(`    ${settled.invoiceId} ${settled.previousTotal} -> ${settled.total}（${billed.lines.map((one) => one.amount).join('+')}），${settled.adjustments.map((one) => `${one.kind} ${one.amount}`).join(' ')}`);

console.log('[5] 账号汇总');
console.log(`    ${JSON.stringify(invoicer.statement({ subscriptionId: 's1', from: T('2026-01-01T00:00:00Z'), to: T('2026-12-31T00:00:00Z') }))}`);

console.log('[6] 统计');
console.log(`    ${JSON.stringify(invoicer.stats())}`);
