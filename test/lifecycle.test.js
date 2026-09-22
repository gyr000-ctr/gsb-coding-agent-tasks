import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoicer } from '../lib/invoicer.js';

const T = (iso) => Date.parse(iso);

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'InvoiceError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

const setup = () => createInvoicer({
  clock: () => T('2026-06-01T00:00:00Z'),
  plans: {
    basic: [{ from: 0, monthlyPrice: 2900 }],
    metered: [{ from: T('2026-01-01T00:00:00Z'), monthlyPrice: 3100 }],
  },
});

test('出账区间必须在租用期里', () => {
  const invoicer = setup();
  invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2026-01-10T00:00:00Z'), endAt: T('2026-03-01T00:00:00Z') });
  expectError(() => invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2026-01-01T00:00:00Z'), periodEnd: T('2026-02-01T00:00:00Z'),
  }), 'ERR_OUT_OF_PERIOD');
  expectError(() => invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2026-02-01T00:00:00Z'), periodEnd: T('2026-04-01T00:00:00Z'),
  }), 'ERR_OUT_OF_PERIOD');
  assert.equal(invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2026-02-01T00:00:00Z'), periodEnd: T('2026-03-01T00:00:00Z'),
  }).total, 2900);
});

test('同一段不能出两次，也不能重叠', () => {
  const invoicer = setup();
  invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2026-01-01T00:00:00Z') });
  invoicer.invoice({ subscriptionId: 's1', periodStart: T('2026-01-01T00:00:00Z'), periodEnd: T('2026-02-01T00:00:00Z') });
  expectError(() => invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2026-01-01T00:00:00Z'), periodEnd: T('2026-02-01T00:00:00Z'),
  }), 'ERR_ALREADY_INVOICED');
  expectError(() => invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2026-01-15T00:00:00Z'), periodEnd: T('2026-02-15T00:00:00Z'),
  }), 'ERR_OVERLAP');
  assert.equal(invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2026-02-01T00:00:00Z'), periodEnd: T('2026-03-01T00:00:00Z'),
  }).lines.length, 1);
});

test('那段还没有生效价格时报 ERR_NO_PRICE', () => {
  const invoicer = setup();
  invoicer.subscribe({ id: 's1', planId: 'metered', startAt: T('2025-12-01T00:00:00Z') });
  expectError(() => invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2025-12-01T00:00:00Z'), periodEnd: T('2026-01-01T00:00:00Z'),
  }), 'ERR_NO_PRICE');
  assert.equal(invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2026-01-01T00:00:00Z'), periodEnd: T('2026-02-01T00:00:00Z'),
  }).total, 3100);
});

test('改价改回去，stale 也撤回去', () => {
  const invoicer = setup();
  invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2026-01-01T00:00:00Z') });
  invoicer.invoice({ subscriptionId: 's1', periodStart: T('2026-01-01T00:00:00Z'), periodEnd: T('2026-02-01T00:00:00Z') });

  const raised = invoicer.setPrice({ planId: 'basic', from: T('2026-01-10T00:00:00Z'), monthlyPrice: 5000 });
  assert.deepEqual(raised.stale, ['inv-1']);
  assert.equal(invoicer.listInvoices()[0].status, 'stale');

  const back = invoicer.setPrice({ planId: 'basic', from: T('2026-01-10T00:00:00Z'), monthlyPrice: 2900 });
  assert.deepEqual(back.stale, []);
  assert.deepEqual(back.restored, ['inv-1']);
  assert.equal(invoicer.listInvoices()[0].status, 'issued');
  expectError(() => invoicer.rebill({ invoiceId: 'inv-1' }), 'ERR_NOT_STALE');
});

test('订阅、套餐、账单这些不认识的东西报哪个码', () => {
  const invoicer = setup();
  expectError(() => invoicer.subscribe({ id: 's1', planId: 'nope', startAt: T('2026-01-01T00:00:00Z') }), 'ERR_UNKNOWN_PLAN');
  invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2026-01-01T00:00:00Z') });
  expectError(() => invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2026-01-01T00:00:00Z') }), 'ERR_DUPLICATE_SUBSCRIPTION');
  expectError(() => invoicer.invoice({
    subscriptionId: 'nope', periodStart: T('2026-01-01T00:00:00Z'), periodEnd: T('2026-02-01T00:00:00Z'),
  }), 'ERR_UNKNOWN_SUBSCRIPTION');
  expectError(() => invoicer.setPrice({ planId: 'nope', from: 0, monthlyPrice: 1 }), 'ERR_UNKNOWN_PLAN');
  expectError(() => invoicer.rebill({ invoiceId: 'inv-9' }), 'ERR_UNKNOWN_INVOICE');
  expectError(() => invoicer.statement({ subscriptionId: 'nope', from: 0, to: 1 }), 'ERR_UNKNOWN_SUBSCRIPTION');
});

test('参数不合法时报哪个码', () => {
  const invoicer = setup();
  invoicer.subscribe({ id: 's1', planId: 'basic', startAt: T('2026-01-01T00:00:00Z') });
  expectError(() => invoicer.invoice({
    subscriptionId: 's1', periodStart: T('2026-02-01T00:00:00Z'), periodEnd: T('2026-02-01T00:00:00Z'),
  }), 'ERR_BAD_PERIOD');
  expectError(() => invoicer.invoice({
    subscriptionId: 's1', periodStart: 'today', periodEnd: T('2026-02-01T00:00:00Z'),
  }), 'ERR_BAD_PERIOD');
  expectError(() => invoicer.setPrice({ planId: 'basic', from: T('2026-01-01T00:00:00Z'), monthlyPrice: 1.5 }), 'ERR_BAD_PRICE');
  expectError(() => invoicer.setPrice({ planId: 'basic', from: T('2026-01-01T00:00:00Z'), monthlyPrice: -1 }), 'ERR_BAD_PRICE');
  expectError(() => invoicer.setPrice(null), 'ERR_BAD_PRICE');
  expectError(() => invoicer.subscribe({ id: 's2', planId: 'basic', startAt: T('2026-02-01T00:00:00Z'), endAt: T('2026-01-01T00:00:00Z') }), 'ERR_BAD_PERIOD');
  expectError(() => invoicer.statement({ subscriptionId: 's1', from: T('2026-03-01T00:00:00Z'), to: T('2026-01-01T00:00:00Z') }), 'ERR_BAD_PERIOD');
  expectError(() => invoicer.listInvoices({ subscriptionId: 'nope' }), 'ERR_UNKNOWN_SUBSCRIPTION');

  expectError(() => createInvoicer(null), 'ERR_BAD_CONFIG');
  expectError(() => createInvoicer({ plans: {}, clock: 1 }), 'ERR_BAD_CONFIG');
  expectError(() => createInvoicer({ plans: { a: 'nope' } }), 'ERR_BAD_CONFIG');
  expectError(() => createInvoicer({ plans: { a: [{ from: 0, monthlyPrice: -1 }] } }), 'ERR_BAD_CONFIG');
  expectError(() => createInvoicer({}), 'ERR_BAD_CONFIG');
});
