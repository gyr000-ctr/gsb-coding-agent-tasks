import test from 'node:test';
import assert from 'node:assert/strict';
import { createMigrator } from '../lib/migrationplan.js';

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'MigrationError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

/** 每一步 up / down 都往 trace 里记一笔，方便核对执行顺序。 */
function recorder(plan, options = {}) {
  const trace = [];
  let now = 1000;
  const migrations = Object.entries(plan).map(([id, spec]) => ({
    id,
    dependsOn: spec.dependsOn ?? [],
    up: () => {
      trace.push(`up:${id}`);
      if (spec.failUp) throw new Error(`up ${id} 炸了`);
      return `${id} up`;
    },
    down: () => {
      trace.push(`down:${id}`);
      if (spec.failDown) throw new Error(`down ${id} 炸了`);
    },
  }));
  const migrator = createMigrator({
    migrations,
    clock: () => { now += 1; return now; },
    ...options,
  });
  return { migrator, trace };
}

const SIMPLE = {
  a: {},
  b: { dependsOn: ['a'] },
  c: { dependsOn: ['b'] },
};

test('migrate 按依赖顺序跑，history 记下校验和与应用时刻', () => {
  const { migrator, trace } = recorder(SIMPLE);
  const report = migrator.migrate();
  assert.deepEqual(report.applied, ['a', 'b', 'c']);
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(trace, ['up:a', 'up:b', 'up:c']);
  const history = migrator.history();
  assert.deepEqual(history.map((one) => one.id), ['a', 'b', 'c']);
  assert.equal(history.every((one) => /^[0-9a-f]{16}$/.test(one.checksum)), true);
  assert.deepEqual(history.map((one) => one.appliedAt), [1001, 1002, 1003]);
});

test('跑过的不会跑第二遍，through 能只跑一半', () => {
  const { migrator, trace } = recorder(SIMPLE);
  migrator.migrate({ through: 'b' });
  assert.deepEqual(trace, ['up:a', 'up:b']);
  assert.deepEqual(migrator.plan(), { applied: ['a', 'b'], pending: ['c'] });
  const again = migrator.migrate({ through: 'b' });
  assert.deepEqual(again.applied, []);
  assert.deepEqual(again.alreadyApplied, ['a', 'b']);
  assert.deepEqual(again.skipped, ['c']);
  assert.deepEqual(trace, ['up:a', 'up:b']);
  assert.deepEqual(migrator.migrate().applied, ['c']);
  expectError(() => migrator.migrate({ through: 'zzz' }), 'ERR_UNKNOWN_MIGRATION');
});

test('中途炸了默认把这次跑起来的倒着退掉', () => {
  const { migrator, trace } = recorder({ a: {}, b: {}, c: { failUp: true } });
  const err = expectError(() => migrator.migrate(), 'ERR_MIGRATION_FAILED');
  assert.equal(err.details.id, 'c');
  assert.deepEqual(err.details.applied, ['a', 'b']);
  assert.deepEqual(err.details.rolledBack, ['b', 'a']);
  assert.deepEqual(trace, ['up:a', 'up:b', 'up:c', 'down:b', 'down:a']);
  assert.deepEqual(migrator.history(), []);
  assert.deepEqual(migrator.plan().pending, ['a', 'b', 'c']);
});

test('onFailure 选 stop 时就留在半路上，不回退', () => {
  const { migrator, trace } = recorder({ a: {}, b: {}, c: { failUp: true } }, { onFailure: 'stop' });
  const err = expectError(() => migrator.migrate(), 'ERR_MIGRATION_FAILED');
  assert.deepEqual(err.details.applied, ['a', 'b']);
  assert.deepEqual(err.details.rolledBack, []);
  assert.deepEqual(trace, ['up:a', 'up:b', 'up:c']);
  assert.deepEqual(migrator.plan(), { applied: ['a', 'b'], pending: ['c'] });
});

test('回退的时候 down 也炸了，得说清楚卡在哪一条', () => {
  const { migrator } = recorder({ a: { failDown: true }, b: { failUp: true } });
  const err = expectError(() => migrator.migrate(), 'ERR_ROLLBACK_FAILED');
  assert.equal(err.details.failedDown, 'a');
  assert.deepEqual(err.details.rolledBack, []);
  assert.deepEqual(err.details.stillApplied, ['a']);
  assert.deepEqual(migrator.history().map((one) => one.id), ['a']);
});

test('rollback 倒着退，steps 可以指定条数', () => {
  const { migrator, trace } = recorder(SIMPLE);
  migrator.migrate();
  assert.deepEqual(migrator.rollback({ steps: 2 }), { rolledBack: ['c', 'b'], remaining: ['a'] });
  assert.deepEqual(trace, ['up:a', 'up:b', 'up:c', 'down:c', 'down:b']);
  assert.deepEqual(migrator.rollback(), { rolledBack: ['a'], remaining: [] });
  expectError(() => migrator.rollback(), 'ERR_NOT_ENOUGH_HISTORY');
  expectError(() => migrator.rollback({ steps: 0 }), 'ERR_BAD_ARGS');
  expectError(() => migrator.rollback({ steps: 1.5 }), 'ERR_BAD_ARGS');
});

test('rollback 中途失败就停在那儿，已经退掉的照实汇报', () => {
  const { migrator } = recorder({ a: {}, b: {}, c: { failDown: true } });
  migrator.migrate();
  const err = expectError(() => migrator.rollback({ steps: 3 }), 'ERR_ROLLBACK_FAILED');
  assert.equal(err.details.failedDown, 'c');
  assert.deepEqual(err.details.rolledBack, []);
  assert.deepEqual(migrator.history().map((one) => one.id), ['a', 'b', 'c']);

  const half = recorder({ a: {}, b: { failDown: true }, c: {} });
  half.migrator.migrate();
  const stuck = expectError(() => half.migrator.rollback({ steps: 3 }), 'ERR_ROLLBACK_FAILED');
  assert.deepEqual(stuck.details.rolledBack, ['c']);
  assert.deepEqual(half.migrator.history().map((one) => one.id), ['a', 'b']);
});

test('统计口径', () => {
  const { migrator } = recorder(SIMPLE);
  migrator.migrate({ through: 'a' });
  migrator.migrate({ through: 'b' });
  migrator.rollback();
  assert.deepEqual(migrator.stats(), {
    migrations: 3,
    applied: 1,
    pending: 2,
    runs: 2,
    failures: 0,
    rollbacks: 1,
  });
});
