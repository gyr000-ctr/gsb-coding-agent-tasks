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

test('第一次拿到锁，token 从 1 起，到期时间按 ttl 算', () => {
  const { service } = harness();
  const lease = service.acquire({ key: 'k', owner: 'a', ttlMs: 400 });
  assert.deepEqual(lease, { key: 'k', owner: 'a', token: 1, expiresAt: 1_400, reentrant: false });
  assert.equal(service.isHeld({ key: 'k' }), true);
});

test('同一个持有者再拿就是重入：token 不变，只把租约往后延', () => {
  const { service, tick } = harness();
  service.acquire({ key: 'k', owner: 'a', ttlMs: 400 });
  tick(100);
  const again = service.acquire({ key: 'k', owner: 'a', ttlMs: 300 });
  assert.deepEqual(again, { key: 'k', owner: 'a', token: 1, expiresAt: 1_400, reentrant: true });
  assert.equal(service.stats().reentries, 1);
  assert.equal(service.stats().acquisitions, 1);
});

test('ttlMs 省略时用配置里的 defaultTtlMs', () => {
  const { service } = harness(1_000, { defaultTtlMs: 250 });
  assert.equal(service.acquire({ key: 'k', owner: 'a' }).expiresAt, 1_250);
});

test('别人抢还活着的租约被挡住，details 里带上现在是谁的', () => {
  const { service, tick } = harness();
  service.acquire({ key: 'k', owner: 'a', ttlMs: 400 });
  tick(150);
  const err = expectError(() => service.acquire({ key: 'k', owner: 'b' }), 'ERR_LOCKED');
  assert.equal(err.details.owner, 'a');
  assert.equal(err.details.remainingMs, 250);
  assert.equal(service.stats().acquisitions, 1);
});

test('到期那一刻就算过期，可以让给别人并换新 token', () => {
  const { service, set } = harness();
  service.acquire({ key: 'k', owner: 'a', ttlMs: 400 });
  set(1_399);
  expectError(() => service.acquire({ key: 'k', owner: 'b' }), 'ERR_LOCKED');
  set(1_400);
  const lease = service.acquire({ key: 'k', owner: 'b' });
  assert.equal(lease.token, 2);
  assert.equal(lease.owner, 'b');
  assert.equal(service.checkFence({ key: 'k', token: 1 }), false);
});

test('释放之后别人能拿，token 继续往上加不回头', () => {
  const { service } = harness();
  service.acquire({ key: 'k', owner: 'a', ttlMs: 400 });
  const released = service.release({ key: 'k', owner: 'a', token: 1 });
  assert.deepEqual(released, { key: 'k', released: true, token: 1, expiresAt: 1_400 });
  assert.equal(service.isHeld({ key: 'k' }), false);
  assert.equal(service.acquire({ key: 'k', owner: 'b', ttlMs: 400 }).token, 2);
  assert.equal(service.stats().releases, 1);
});

test('续租要 owner 和 token 都对得上', () => {
  const { service, tick } = harness();
  service.acquire({ key: 'k', owner: 'a', ttlMs: 400 });
  tick(50);
  assert.deepEqual(service.renew({ key: 'k', owner: 'a', token: 1, ttlMs: 500 }), {
    key: 'k', owner: 'a', token: 1, expiresAt: 1_550,
  });
  expectError(() => service.renew({ key: 'k', owner: 'b', token: 1 }), 'ERR_BAD_TOKEN');
  expectError(() => service.renew({ key: 'k', owner: 'a', token: 2 }), 'ERR_BAD_TOKEN');
  assert.equal(service.stats().renewals, 1);
});

test('租约已经过期或释放掉时，续租和释放都报 ERR_LEASE_LOST', () => {
  const { service, set } = harness();
  service.acquire({ key: 'k', owner: 'a', ttlMs: 400 });
  set(1_400);
  expectError(() => service.renew({ key: 'k', owner: 'a', token: 1 }), 'ERR_LEASE_LOST');
  expectError(() => service.release({ key: 'k', owner: 'a', token: 9 }), 'ERR_LEASE_LOST');

  const other = harness();
  other.service.acquire({ key: 'k2', owner: 'a', ttlMs: 400 });
  other.service.release({ key: 'k2', owner: 'a', token: 1 });
  expectError(() => other.service.renew({ key: 'k2', owner: 'a', token: 1 }), 'ERR_LEASE_LOST');
  expectError(() => other.service.release({ key: 'k2', owner: 'a', token: 1 }), 'ERR_LEASE_LOST');
});

test('没见过的 key 报 ERR_UNKNOWN_LOCK，查询类接口不抛', () => {
  const { service } = harness();
  expectError(() => service.renew({ key: 'nope', owner: 'a', token: 1 }), 'ERR_UNKNOWN_LOCK');
  expectError(() => service.release({ key: 'nope', owner: 'a', token: 1 }), 'ERR_UNKNOWN_LOCK');
  assert.equal(service.status({ key: 'nope' }), null);
  assert.equal(service.isHeld({ key: 'nope' }), false);
  assert.equal(service.checkFence({ key: 'nope', token: 1 }), false);
});
