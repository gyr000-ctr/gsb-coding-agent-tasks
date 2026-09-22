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

test('刷新会换一个新的令牌，旧的立刻作废', () => {
  const { vault, at } = harness();
  const { sessionId, refreshToken } = vault.login({ userId: 'u1', deviceId: 'phone' });
  at(1000);
  const rotated = vault.refresh(sessionId, refreshToken);
  assert.equal(rotated.refreshToken, 'rt-sess-1-2');
  assert.equal(rotated.expiresAt, NOW + 1000 + 1800000);
  const again = vault.refresh(sessionId, rotated.refreshToken);
  assert.equal(again.refreshToken, 'rt-sess-1-3');
});

test('拿已经用过的旧令牌来刷，整条链都撤销', () => {
  const { vault } = harness({ maxDevices: 5 });
  const first = vault.login({ userId: 'u1', deviceId: 'phone' });
  vault.login({ userId: 'u1', deviceId: 'tablet' });
  vault.refresh(first.sessionId, first.refreshToken);
  expectError(() => vault.refresh(first.sessionId, first.refreshToken), 'ERR_REFRESH_REUSED');
  assert.deepEqual(vault.sessions('u1'), []);
  expectError(() => vault.touch(first.sessionId), 'ERR_BAD_SESSION');
  assert.equal(vault.stats().revoked, 2);
});

test('令牌完全对不上也算复用，同样撤销', () => {
  const { vault } = harness();
  const { sessionId } = vault.login({ userId: 'u1', deviceId: 'phone' });
  expectError(() => vault.refresh(sessionId, 'rt-sess-1-9'), 'ERR_REFRESH_REUSED');
  expectError(() => vault.touch(sessionId), 'ERR_BAD_SESSION');
});

test('刷新也会续期，过期之后刷不动', () => {
  const { vault, at } = harness({ idleTtlMs: 1000, absoluteTtlMs: 100000 });
  const { sessionId, refreshToken } = vault.login({ userId: 'u1', deviceId: 'phone' });
  at(900);
  const rotated = vault.refresh(sessionId, refreshToken);
  at(1899);
  assert.equal(vault.touch(sessionId).expiresAt, NOW + 1899 + 1000);
  at(2899);
  expectError(() => vault.refresh(sessionId, rotated.refreshToken), 'ERR_SESSION_EXPIRED');
});

test('刷新之后再 touch 还是同一条会话', () => {
  const { vault } = harness();
  const { sessionId, refreshToken } = vault.login({ userId: 'u1', deviceId: 'phone' });
  vault.refresh(sessionId, refreshToken);
  assert.equal(vault.touch(sessionId).absoluteExpiresAt, NOW + 86400000);
  assert.equal(vault.sessions('u1').length, 1);
});

test('撤销过的会话刷新直接报 ERR_BAD_SESSION', () => {
  const { vault } = harness();
  const { sessionId, refreshToken } = vault.login({ userId: 'u1', deviceId: 'phone' });
  vault.logout(sessionId);
  expectError(() => vault.refresh(sessionId, refreshToken), 'ERR_BAD_SESSION');
});
