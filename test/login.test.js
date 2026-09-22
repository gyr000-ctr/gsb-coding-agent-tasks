import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault } from '../lib/vault.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

function harness(extra = {}) {
  let current = NOW;
  const vault = createVault({ clock: () => current, ...extra });
  return { vault, at: (offset) => { current = NOW + offset; } };
}

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'SessionError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('登录拿到会话和刷新令牌', () => {
  const { vault } = harness();
  const out = vault.login({ userId: 'u1', deviceId: 'phone' });
  assert.deepEqual(out, {
    sessionId: 'sess-1',
    refreshToken: 'rt-sess-1-1',
    expiresAt: NOW + 1800000,
    absoluteExpiresAt: NOW + 86400000,
    evicted: [],
  });
  assert.deepEqual(vault.stats(), { active: 1, revoked: 0, expired: 0 });
});

test('同一台设备再登录，旧的被顶掉', () => {
  const { vault } = harness();
  const first = vault.login({ userId: 'u1', deviceId: 'phone' });
  const second = vault.login({ userId: 'u1', deviceId: 'phone' });
  assert.deepEqual(second.evicted, [first.sessionId]);
  assert.deepEqual(vault.sessions('u1').map((one) => one.sessionId), [second.sessionId]);
  expectError(() => vault.touch(first.sessionId), 'ERR_BAD_SESSION');
  assert.equal(vault.stats().revoked, 1);
});

test('设备数到上限，踢掉最久没用过的', () => {
  const { vault, at } = harness({ maxDevices: 2 });
  const first = vault.login({ userId: 'u1', deviceId: 'phone' });
  at(100);
  const second = vault.login({ userId: 'u1', deviceId: 'tablet' });
  at(200);
  vault.touch(first.sessionId);
  const third = vault.login({ userId: 'u1', deviceId: 'laptop' });
  assert.deepEqual(third.evicted, [second.sessionId]);
  assert.deepEqual(vault.sessions('u1').map((one) => one.deviceId), ['phone', 'laptop']);
});

test('空闲过期是滑动的，touch 会把它往后推', () => {
  const { vault, at } = harness({ idleTtlMs: 1000, absoluteTtlMs: 100000 });
  const { sessionId } = vault.login({ userId: 'u1', deviceId: 'phone' });
  at(900);
  const out = vault.touch(sessionId);
  assert.equal(out.expiresAt, NOW + 900 + 1000);
  at(1899);
  assert.equal(vault.touch(sessionId).expiresAt, NOW + 1899 + 1000);
  at(2899);
  expectError(() => vault.touch(sessionId), 'ERR_SESSION_EXPIRED');
});

test('绝对上限到了就过期，再怎么 touch 也没用', () => {
  const { vault, at } = harness({ idleTtlMs: 10000, absoluteTtlMs: 5000 });
  const { sessionId } = vault.login({ userId: 'u1', deviceId: 'phone' });
  at(4000);
  vault.touch(sessionId);
  at(5000);
  expectError(() => vault.touch(sessionId), 'ERR_SESSION_EXPIRED');
  assert.deepEqual(vault.stats(), { active: 0, revoked: 0, expired: 1 });
});

test('touch 和 logout 的边界情况', () => {
  const { vault } = harness();
  expectError(() => vault.touch('sess-404'), 'ERR_BAD_SESSION');
  const { sessionId } = vault.login({ userId: 'u1', deviceId: 'phone' });
  assert.equal(vault.logout(sessionId), true);
  assert.equal(vault.logout(sessionId), false);
  expectError(() => vault.touch(sessionId), 'ERR_BAD_SESSION');
  assert.equal(vault.logout('sess-404'), false);
});

test('revokeUser 一次撤销这个用户所有会话', () => {
  const { vault } = harness({ maxDevices: 5 });
  vault.login({ userId: 'u1', deviceId: 'a' });
  vault.login({ userId: 'u1', deviceId: 'b' });
  vault.login({ userId: 'u2', deviceId: 'c' });
  assert.equal(vault.revokeUser('u1'), 2);
  assert.deepEqual(vault.sessions('u1'), []);
  assert.equal(vault.sessions('u2').length, 1);
  assert.equal(vault.revokeUser('u1'), 0);
});

test('列会话按最近使用排序', () => {
  const { vault, at } = harness();
  const first = vault.login({ userId: 'u1', deviceId: 'phone' });
  at(100);
  const second = vault.login({ userId: 'u1', deviceId: 'tablet' });
  at(200);
  vault.touch(first.sessionId);
  assert.deepEqual(vault.sessions('u1').map((one) => one.sessionId), [first.sessionId, second.sessionId]);
  assert.equal(vault.sessions('u1')[0].expiresAt, NOW + 200 + 1800000);
});

test('参数不合法时报哪个码', () => {
  expectError(() => createVault(null), 'ERR_BAD_CONFIG');
  expectError(() => createVault({ maxDevices: 0 }), 'ERR_BAD_CONFIG');
  expectError(() => createVault({ idleTtlMs: 1.5 }), 'ERR_BAD_CONFIG');
  expectError(() => createVault({ clock: 1 }), 'ERR_BAD_CONFIG');
  const { vault } = harness();
  expectError(() => vault.login({ userId: '', deviceId: 'a' }), 'ERR_BAD_SESSION');
  expectError(() => vault.login({ userId: 'u1' }), 'ERR_BAD_SESSION');
  expectError(() => vault.login(), 'ERR_BAD_SESSION');
});
