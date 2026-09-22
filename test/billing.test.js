import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoicer } from '../lib/invoicer.js';

const T = (iso) => Date.parse(iso);
const day = (at) => new Date(at).toISOString().slice(0, 10);

const setup = () => createInvoicer({
  clock: () => T('2026-06-01T00:00:00Z'),
  plans: {
    basic: [{ from: 0, monthlyPrice: 2900 }],
    metered: [{ from: T('2026-01-01T00:00:00Z'), monthlyPrice: 3100 }],
  },
});

function seeded() {
  const invoicer = setup();
  invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2026-01-01T00:00:00Z') });
  return invoicer;
}

test('整月出账：按自然月切片，一个月一条', () => {
  const invoicer = seeded();
  const invoice = invoicer.invoice({
    subscriptionId: 's1',
    periodStart: T('2026-01-01T00:00:00Z'),
    periodEnd: T('2026-03-01T00:00:00Z'),
  });
  assert.equal(invoice.id, 'inv-1');
  assert.equal(invoice.status, 'issued');
  assert.equal(invoice.total, 5800);
  assert.deepEqual(invoice.lines.map((one) => [day(one.from), one.amount]),
    [['2026-01-01', 2900], ['2026-02-01', 2900]]);
});

test('月中出账按月长摊，四舍五入到分', () => {
  const invoicer = seeded();
  const march = invoicer.invoice({
    subscriptionId: 's1',
    periodStart: T('2026-03-01T00:00:00Z'),
    periodEnd: T('2026-03-16T00:00:00Z'),
  });
  assert.equal(march.lines.length, 1);
  assert.equal(march.total, 1403, '15/31 个月，2900 * 15 / 31 = 1403.22');

  const february = invoicer.invoice({
    subscriptionId: 's1',
    periodStart: T('2026-02-01T00:00:00Z'),
    periodEnd: T('2026-02-15T00:00:00Z'),
  });
  assert.equal(february.total, 1450, '2026 年 2 月是 28 天，14/28');
});

test('闰年的 2 月按 29 天算', () => {
  const invoicer = createInvoicer({
    clock: () => T('2028-06-01T00:00:00Z'),
    plans: { basic: [{ from: 0, monthlyPrice: 2900 }] },
  });
  invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2028-01-01T00:00:00Z') });
  const invoice = invoicer.invoice({
    subscriptionId: 's1',
    periodStart: T('2028-02-01T00:00:00Z'),
    periodEnd: T('2028-02-15T00:00:00Z'),
  });
  assert.equal(invoice.total, 1400, '29 天里的前 14 天');
});

test('月中改价会把账单再切一刀，每条单独舍入', () => {
  const invoicer = seeded();
  const first = invoicer.invoice({
    subscriptionId: 's1',
    periodStart: T('2026-01-01T00:00:00Z'),
    periodEnd: T('2026-03-01T00:00:00Z'),
  });
  assert.equal(first.total, 5800);

  const changed = invoicer.setPrice({
    planId: 'basic',
    from: T('2026-02-10T00:00:00Z'),
    monthlyPrice: 9900,
  });
  assert.deepEqual(changed.stale, ['inv-1']);
  assert.deepEqual(changed.restored, []);

  const after = invoicer.listInvoices()[0];
  assert.equal(after.status, 'stale');
  assert.equal(after.total, 5800, '旧账单上的金额还在，等 rebill 才会动');
  assert.deepEqual(after.lines.map((one) => one.amount), [2900, 2900]);
});

test('rebill 涨价要多收，降价要退', () => {
  const invoicer = seeded();
  invoicer.invoice({
    subscriptionId: 's1',
    periodStart: T('2026-01-01T00:00:00Z'),
    periodEnd: T('2026-03-01T00:00:00Z'),
  });
  invoicer.setPrice({ planId: 'basic', from: T('2026-02-10T00:00:00Z'), monthlyPrice: 9900 });
  assert.deepEqual(invoicer.rebill({ invoiceId: 'inv-1' }), {
    invoiceId: 'inv-1',
    delta: 4750,
    previousTotal: 5800,
    total: 10550,
    adjustments: [{ id: 'adj-1', kind: 'charge', amount: 4750 }],
  });
  const billed = invoicer.listInvoices()[0];
  assert.equal(billed.status, 'rebilled');
  assert.equal(billed.total, 10550);
  assert.equal(billed.previousTotal, 5800);
  assert.deepEqual(billed.lines.map((one) => one.amount), [2900, 932, 6718], '重算之后 2 月被切成两段');

  invoicer.setPrice({ planId: 'basic', from: T('2026-02-10T00:00:00Z'), monthlyPrice: 0 });
  assert.deepEqual(invoicer.listInvoices()[0].status, 'stale');
  const refund = invoicer.rebill({ invoiceId: 'inv-1' });
  assert.equal(refund.delta, -6718, '2 月 10 号之后算 0，剩下 1 月 2900 + 2 月前 9 天 932');
  assert.deepEqual(refund.adjustments, [{ id: 'adj-2', kind: 'refund', amount: 6718 }]);
  assert.equal(invoicer.listInvoices()[0].status, 'rebilled');
});

test('账号汇总按当前金额与退款算', () => {
  const invoicer = seeded();
  invoicer.invoice({
    subscriptionId: 's1',
    periodStart: T('2026-01-01T00:00:00Z'),
    periodEnd: T('2026-02-01T00:00:00Z'),
  });
  invoicer.invoice({
    subscriptionId: 's1',
    periodStart: T('2026-02-01T00:00:00Z'),
    periodEnd: T('2026-03-01T00:00:00Z'),
  });
  invoicer.setPrice({ planId: 'basic', from: T('2026-02-01T00:00:00Z'), monthlyPrice: 4900 });
  assert.deepEqual(invoicer.listInvoices().map((one) => one.status), ['issued', 'stale']);
  invoicer.rebill({ invoiceId: 'inv-2' });

  assert.deepEqual(invoicer.statement({
    subscriptionId: 's1',
    from: T('2026-01-01T00:00:00Z'),
    to: T('2026-03-01T00:00:00Z'),
  }), {
    subscriptionId: 's1',
    charges: 7800,
    refunds: 0,
    net: 7800,
    invoiceIds: ['inv-1', 'inv-2'],
  });
  assert.deepEqual(invoicer.stats(), {
    plans: 2, subscriptions: 1, invoices: 2, stale: 0, rebilled: 1, charged: 2000, refunded: 0,
  });
  assert.deepEqual(invoicer.statement({
    subscriptionId: 's1',
    from: T('2026-02-01T00:00:00Z'),
    to: T('2026-03-01T00:00:00Z'),
  }).invoiceIds, ['inv-2']);
});
