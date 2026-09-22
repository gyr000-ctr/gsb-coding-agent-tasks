import test from 'node:test';
import assert from 'node:assert/strict';
import { createLockService } from '../lib/leaselock.js';

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'LeaseError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

function harness(start = 1_000, config = {}) {
  let now = start;
  const service = createLockService({ clock: () => now, ...config });
  return { service, at: () => now, tick: (ms) => { now += ms; }, set: (ms) => { now = ms; } };
}

test('token 只增不减，也不复用；不同 key 各数各的', () => {
  const { service, tick } = harness();
  service.acquire({ key: 'a', owner: 'x', ttlMs: 100 });
  tick(100);
  service.acquire({ key: 'a', owner: 'y', ttlMs: 100 });
  tick(100);
  service.acquire({ key: 'a', owner: 'z', ttlMs: 100 });
  assert.equal(service.status({ key: 'a' }).token, 3);

  service.acquire({ key: 'b', owner: 'x', ttlMs: 100 });
  assert.equal(service.status({ key: 'b' }).token, 1);
  assert.equal(service.status({ key: 'a' }).token, 3);
});

test('fencing：只有当前持有者的 token 才放行，旧 token 一律挡掉', () => {
  const { service, set } = harness();
  service.acquire({ key: 'k', owner: 'a', ttlMs: 100 });
  assert.equal(service.checkFence({ key: 'k', token: 1 }), true);
  set(1_100);
  service.acquire({ key: 'k', owner: 'b', ttlMs: 100 });
  assert.equal(service.checkFence({ key: 'k', token: 1 }), false);
  assert.equal(service.checkFence({ key: 'k', token: 2 }), true);
  set(1_200);
  assert.equal(service.checkFence({ key: 'k', token: 2 }), false);
});

test('释放之后没有持有者，任何人都过不了 fencing', () => {
  const { service } = harness();
  service.acquire({ key: 'k', owner: 'a', ttlMs: 100 });
  service.release({ key: 'k', owner: 'a', token: 1 });
  assert.equal(service.checkFence({ key: 'k', token: 1 }), false);
});

test('sweep 把过期的租约标记掉，同一个租约只计一次', () => {
  const { service, set } = harness();
  service.acquire({ key: 'a', owner: 'x', ttlMs: 100 });
  service.acquire({ key: 'b', owner: 'x', ttlMs: 100 });
  set(1_100);
  assert.equal(service.sweep(), 2);
  assert.equal(service.sweep(), 0);
  assert.equal(service.stats().expirations, 2);
  assert.equal(service.isHeld({ key: 'a' }), false);
});

test('过期是懒判定的：不 sweep，随便碰一下也会记上', () => {
  const { service, set } = harness();
  service.acquire({ key: 'a', owner: 'x', ttlMs: 100 });
  set(1_100);
  assert.equal(service.status({ key: 'a' }), null);
  assert.equal(service.stats().expirations, 1);
  set(1_200);
  assert.equal(service.isHeld({ key: 'a' }), false);
  assert.equal(service.stats().expirations, 1);
});

test('list 默认只列还持有的，按 key 升序', () => {
  const { service, set } = harness();
  service.acquire({ key: 'b', owner: 'x', ttlMs: 100 });
  service.acquire({ key: 'a', owner: 'y', ttlMs: 500 });
  set(1_200);
  assert.deepEqual(service.list(), [
    { key: 'a', owner: 'y', token: 1, expiresAt: 1_500, held: true },
  ]);
  assert.deepEqual(service.list({ heldOnly: false }), [
    { key: 'a', owner: 'y', token: 1, expiresAt: 1_500, held: true },
    { key: 'b', owner: 'x', token: 1, expiresAt: 1_100, held: false },
  ]);
});

test('stats 的口径', () => {
  const { service, tick } = harness();
  service.acquire({ key: 'a', owner: 'x', ttlMs: 100 });
  service.acquire({ key: 'a', owner: 'x', ttlMs: 100 });
  service.renew({ key: 'a', owner: 'x', token: 1, ttlMs: 100 });
  service.release({ key: 'a', owner: 'x', token: 1 });
  service.acquire({ key: 'b', owner: 'y', ttlMs: 100 });
  tick(100);
  assert.deepEqual(service.stats(), {
    keys: 2,
    held: 0,
    acquisitions: 2,
    reentries: 1,
    renewals: 1,
    releases: 1,
    expirations: 1,
  });
});

test('参数不合法时各报哪个码', () => {
  const { service } = harness();
  expectError(() => service.acquire(), 'ERR_BAD_ARGS');
  expectError(() => service.acquire({ key: '', owner: 'a' }), 'ERR_BAD_ARGS');
  expectError(() => service.acquire({ key: 'k', owner: 7 }), 'ERR_BAD_ARGS');
  expectError(() => service.acquire({ key: 'k', owner: 'a', ttlMs: 0 }), 'ERR_BAD_TTL');
  expectError(() => service.acquire({ key: 'k', owner: 'a', ttlMs: 12.5 }), 'ERR_BAD_TTL');
  expectError(() => service.checkFence({ key: 'k', token: 0 }), 'ERR_BAD_ARGS');

  expectError(() => createLockService(null), 'ERR_BAD_CONFIG');
  expectError(() => createLockService({ clock: 'now' }), 'ERR_BAD_CONFIG');
  expectError(() => createLockService({ defaultTtlMs: -1 }), 'ERR_BAD_CONFIG');
  expectError(() => createLockService({ clock: () => Number.NaN }).isHeld({ key: 'k' }), 'ERR_BAD_CONFIG');
});
