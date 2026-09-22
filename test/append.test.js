import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog } from '../lib/audit.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const DAY = 86400000;

function harness(extra = {}) {
  let current = NOW;
  const log = createAuditLog({ clock: () => current, ...extra });
  return { log, at: (offset) => { current = NOW + offset; } };
}

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'AuditError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('写一条事件，缺省字段都补上', () => {
  const { log } = harness();
  const event = log.append({ actor: 'u-1', action: 'order.refund' });
  assert.deepEqual(event, { id: 'evt-1', at: NOW, actor: 'u-1', action: 'order.refund', target: null, meta: {} });
  assert.equal(log.append({ actor: 'u-1', action: 'order.paid', target: 'A-9', at: NOW + 10 }).id, 'evt-2');
  assert.deepEqual(log.stats(), { total: 2, appended: 2, pruned: 0 });
});

test('敏感字段写进去就变成 ***，嵌套也一样', () => {
  const { log } = harness();
  const event = log.append({
    actor: 'u-1',
    action: 'login',
    meta: {
      password: 'hunter2',
      Token: 'abc',
      apiKey: 'k',
      'api-key': 'k2',
      nested: { authorization: 'Bearer x', keep: 1 },
      list: [{ secret: 's' }, { keep: true }],
      normal: 'ok',
    },
  });
  assert.deepEqual(event.meta, {
    password: '***',
    Token: '***',
    apiKey: '***',
    'api-key': '***',
    nested: { authorization: '***', keep: 1 },
    list: [{ secret: '***' }, { keep: true }],
    normal: 'ok',
  });
});

test('写进去和读出来都是拷贝', () => {
  const { log } = harness();
  const meta = { nested: { count: 1 } };
  const written = log.append({ actor: 'u-1', action: 'a', meta });
  written.meta.nested.count = 99;
  meta.nested.count = 42;
  assert.equal(log.query()[0].meta.nested.count, 1);
});

test('事件参数不合法时报哪个码', () => {
  const { log } = harness();
  expectError(() => log.append({ action: 'a' }), 'ERR_BAD_EVENT');
  expectError(() => log.append({ actor: '', action: 'a' }), 'ERR_BAD_EVENT');
  expectError(() => log.append({ actor: 'u', action: '' }), 'ERR_BAD_EVENT');
  expectError(() => log.append({ actor: 'u', action: 'a', meta: 'nope' }), 'ERR_BAD_EVENT');
  expectError(() => log.append({ actor: 'u', action: 'a', at: 'now' }), 'ERR_BAD_EVENT');
  expectError(() => log.append(null), 'ERR_BAD_EVENT');
  expectError(() => createAuditLog({ retentionMs: 0 }), 'ERR_BAD_CONFIG');
  expectError(() => createAuditLog({ maxEvents: 1.5 }), 'ERR_BAD_CONFIG');
  expectError(() => createAuditLog({ clock: 1 }), 'ERR_BAD_CONFIG');
});

test('写入时会顺手清掉超过保留期的事件', () => {
  const { log, at } = harness({ retentionMs: DAY });
  log.append({ actor: 'u-1', action: 'a' });
  at(DAY);
  log.append({ actor: 'u-1', action: 'b' });
  assert.equal(log.stats().total, 2);
  at(DAY + 1);
  log.append({ actor: 'u-1', action: 'c' });
  assert.deepEqual(log.query().map((one) => one.action), ['b', 'c']);
  assert.equal(log.stats().pruned, 1);
});

test('超过 maxEvents 就把最老的挤掉', () => {
  const { log } = harness({ maxEvents: 2 });
  log.append({ actor: 'u-1', action: 'a' });
  log.append({ actor: 'u-1', action: 'b' });
  log.append({ actor: 'u-1', action: 'c' });
  assert.deepEqual(log.query().map((one) => one.action), ['b', 'c']);
  assert.deepEqual(log.stats(), { total: 2, appended: 3, pruned: 1 });
});

test('prune 手动清保留期外的，返回条数', () => {
  const { log, at } = harness({ retentionMs: DAY });
  log.append({ actor: 'u-1', action: 'a' });
  at(2 * DAY);
  assert.equal(log.prune(), 1);
  assert.equal(log.prune(), 0);
  assert.equal(log.stats().pruned, 1);
});
