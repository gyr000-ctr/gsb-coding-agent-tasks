import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog } from '../lib/audit.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const log = () => createAuditLog({ clock: () => NOW, retentionMs: 30 * 86400000 });

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

function seed() {
  const audit = log();
  audit.append({ actor: 'u-1', action: 'login', at: NOW + 300 });
  audit.append({ actor: 'u-2', action: 'login', at: NOW + 100 });
  audit.append({ actor: 'u-1', action: 'refund', at: NOW + 200 });
  audit.append({ actor: 'u-1', action: 'refund', at: NOW + 200 });
  return audit;
}

test('默认按时间升序返回，同一时刻按写入顺序', () => {
  const audit = seed();
  assert.deepEqual(audit.query().map((one) => one.at - NOW), [100, 200, 200, 300]);
  assert.deepEqual(audit.query().map((one) => one.id), ['evt-2', 'evt-3', 'evt-4', 'evt-1']);
});

test('按 actor 和 action 精确过滤', () => {
  const audit = seed();
  assert.deepEqual(audit.query({ actor: 'u-1' }).map((one) => one.id), ['evt-3', 'evt-4', 'evt-1']);
  assert.deepEqual(audit.query({ action: 'refund' }).map((one) => one.id), ['evt-3', 'evt-4']);
  assert.deepEqual(audit.query({ actor: 'u-1', action: 'refund' }).length, 2);
  assert.deepEqual(audit.query({ actor: 'nobody' }), []);
});

test('from / to 含边界', () => {
  const audit = seed();
  assert.deepEqual(audit.query({ from: NOW + 200, to: NOW + 200 }).map((one) => one.id), ['evt-3', 'evt-4']);
  assert.deepEqual(audit.query({ from: NOW + 101 }).map((one) => one.id), ['evt-3', 'evt-4', 'evt-1']);
});

test('limit 的默认值和边界', () => {
  const audit = log();
  for (let index = 0; index < 60; index++) audit.append({ actor: 'u-1', action: 'a', at: NOW + index });
  assert.equal(audit.query().length, 50);
  assert.equal(audit.query({ limit: 3 }).length, 3);
  assert.equal(audit.query({ limit: 200 }).length, 60);
  for (const limit of [0, 201, 1.5, '10']) {
    expectError(() => audit.query({ limit }), 'ERR_BAD_QUERY');
  }
  expectError(() => audit.query({ from: 'yesterday' }), 'ERR_BAD_QUERY');
  expectError(() => audit.query({ to: Number.NaN }), 'ERR_BAD_QUERY');
  expectError(() => audit.query('nope'), 'ERR_BAD_QUERY');
});

test('查询结果也是拷贝，改它不影响库里', () => {
  const audit = log();
  audit.append({ actor: 'u-1', action: 'a', meta: { tags: ['x'] } });
  const first = audit.query();
  first[0].meta.tags.push('y');
  assert.deepEqual(audit.query()[0].meta.tags, ['x']);
});
