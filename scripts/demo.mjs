import { createVault } from '../lib/vault.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
let current = NOW;
const vault = createVault({ clock: () => current, maxDevices: 2, idleTtlMs: 600000 });
const at = (offset) => {
  current = NOW + offset;
};
const active = () => vault.sessions('u1').map((one) => `${one.sessionId}(${one.deviceId})`).join(',') || '（空）';

console.log('sessionvault demo');

console.log('[1] 手机上登录一次');
const first = vault.login({ userId: 'u1', deviceId: 'phone' });
console.log(`    ${first.sessionId} token=${first.refreshToken} 过期 ${first.expiresAt}`);

console.log('[2] 同一台手机再登录，旧的被顶掉');
const second = vault.login({ userId: 'u1', deviceId: 'phone' });
console.log(`    evicted=${second.evicted.join(',')} 活跃 ${active()}`);

console.log('[3] 设备上限 2：加平板再加笔记本，最久没用的出局');
at(1000);
const third = vault.login({ userId: 'u1', deviceId: 'tablet' });
at(2000);
vault.touch(second.sessionId);
at(3000);
const fourth = vault.login({ userId: 'u1', deviceId: 'laptop' });
console.log(`    加平板：${third.sessionId} 加笔记本时踢掉 ${fourth.evicted.join(',')}`);
console.log(`    活跃 ${active()}`);

console.log('[4] 刷新令牌会轮换');
const rotated = vault.refresh(fourth.sessionId, fourth.refreshToken);
console.log(`    ${fourth.refreshToken} -> ${rotated.refreshToken}`);

console.log('[5] 拿已经用过的旧令牌再刷：这个用户的会话全部撤销');
try {
  vault.refresh(fourth.sessionId, fourth.refreshToken);
} catch (err) {
  console.log(`    ${err.code}`);
}
console.log(`    活跃 ${active()} 统计 ${JSON.stringify(vault.stats())}`);

console.log('[6] 空闲过期：10 分钟没动静');
const fifth = vault.login({ userId: 'u2', deviceId: 'phone' });
at(3000 + 599999);
console.log(`    599999 毫秒时 ${vault.touch(fifth.sessionId).expiresAt}`);
at(3000 + 599999 + 600000);
try {
  vault.touch(fifth.sessionId);
} catch (err) {
  console.log(`    600000 毫秒时 ${err.code}`);
}
