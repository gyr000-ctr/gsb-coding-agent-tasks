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

const noop = () => {};

function migrations() {
  return [
    { id: 'c', dependsOn: ['b'], up: noop, down: noop },
    { id: 'a', dependsOn: [], up: noop, down: noop },
    { id: 'b', dependsOn: ['a'], up: noop, down: noop },
    { id: 'd', dependsOn: [], up: noop, down: noop },
  ];
}

test('plan 按依赖排序，每一步挑 id 字典序最小的那个', () => {
  const migrator = createMigrator({ migrations: migrations(), clock: () => 1000 });
  assert.deepEqual(migrator.plan(), { applied: [], pending: ['a', 'b', 'c', 'd'] });
});

test('已经应用过的排进 applied，后面的还是 pending', () => {
  const list = migrations();
  const base = createMigrator({ migrations: list, clock: () => 1000 });
  const checksum = base.status().find((one) => one.id === 'a').checksum;
  const migrator = createMigrator({
    migrations: list,
    clock: () => 1000,
    applied: [{ id: 'a', checksum, appliedAt: 900 }],
  });
  assert.deepEqual(migrator.plan(), { applied: ['a'], pending: ['b', 'c', 'd'] });
});

test('status 分得清 applied / pending / drift / missing', () => {
  const list = migrations();
  const base = createMigrator({ migrations: list, clock: () => 1000 });
  const a = base.status().find((one) => one.id === 'a');

  const applier = createMigrator({
    migrations: list,
    clock: () => 1000,
    applied: [{ id: 'a', checksum: a.checksum, appliedAt: 900 }],
  });
  assert.deepEqual(applier.status().find((one) => one.id === 'a'), {
    id: 'a', state: 'applied', checksum: a.checksum, appliedAt: 900,
  });
  assert.equal(applier.status().find((one) => one.id === 'b').state, 'pending');

  const drifted = createMigrator({
    migrations: list,
    clock: () => 1000,
    applied: [{ id: 'a', checksum: 'deadbeefdeadbeef', appliedAt: 900 }],
  });
  assert.equal(drifted.status().find((one) => one.id === 'a').state, 'drift');
  expectError(() => drifted.plan(), 'ERR_CHECKSUM_DRIFT');

  const missing = createMigrator({
    migrations: list,
    clock: () => 1000,
    applied: [{ id: 'z', checksum: 'deadbeefdeadbeef', appliedAt: 900 }],
  });
  assert.equal(missing.status().find((one) => one.id === 'z').state, 'missing');
  expectError(() => missing.plan(), 'ERR_MISSING_MIGRATION');
});

test('依赖指了没定义的、或者转圈了，构造的时候就报', () => {
  expectError(() => createMigrator({
    migrations: [{ id: 'a', dependsOn: ['nope'], up: noop, down: noop }],
  }), 'ERR_UNKNOWN_DEPENDENCY');
  expectError(() => createMigrator({
    migrations: [
      { id: 'a', dependsOn: ['b'], up: noop, down: noop },
      { id: 'b', dependsOn: ['a'], up: noop, down: noop },
    ],
  }), 'ERR_DEPENDENCY_CYCLE');
  expectError(() => createMigrator({
    migrations: [{ id: 'a', dependsOn: ['a'], up: noop, down: noop }],
  }), 'ERR_DEPENDENCY_CYCLE');
});

test('迁移定义本身不合法时报哪个码', () => {
  expectError(() => createMigrator(null), 'ERR_BAD_CONFIG');
  expectError(() => createMigrator({ migrations: 'nope' }), 'ERR_BAD_CONFIG');
  expectError(() => createMigrator({ migrations: [], clock: 5 }), 'ERR_BAD_CONFIG');
  expectError(() => createMigrator({ migrations: [], onFailure: 'whatever' }), 'ERR_BAD_CONFIG');
  expectError(() => createMigrator({ migrations: [], applied: 'nope' }), 'ERR_BAD_CONFIG');
  expectError(() => createMigrator({ migrations: [{ id: '', up: noop, down: noop }] }), 'ERR_BAD_MIGRATION');
  expectError(() => createMigrator({ migrations: [{ id: 'a', up: noop }] }), 'ERR_BAD_MIGRATION');
  expectError(() => createMigrator({ migrations: [{ id: 'a', dependsOn: 'b', up: noop, down: noop }] }), 'ERR_BAD_MIGRATION');
  expectError(() => createMigrator({
    migrations: [{ id: 'a', up: noop, down: noop }, { id: 'a', up: noop, down: noop }],
  }), 'ERR_DUPLICATE_MIGRATION');
});
