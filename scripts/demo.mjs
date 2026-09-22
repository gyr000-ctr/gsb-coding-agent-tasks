import { createMigrator } from '../lib/migrationplan.js';

const trace = [];
const up1 = () => trace.push('up:0001-users');
const down1 = () => trace.push('down:0001-users');
const up2 = () => trace.push('up:0002-orders');
const down2 = () => trace.push('down:0002-orders');
const up3 = () => trace.push('up:0003-index');
const down3 = () => trace.push('down:0003-index');
const up4 = () => trace.push('up:0004-views');
const down4 = () => trace.push('down:0004-views');

let tick = 0;
const migrator = createMigrator({
  migrations: [
    { id: '0001-users', dependsOn: [], up: up1, down: down1 },
    { id: '0002-orders', dependsOn: ['0001-users'], up: up2, down: down2 },
    { id: '0003-index', dependsOn: ['0002-orders'], up: up3, down: down3 },
    { id: '0004-views', dependsOn: ['0002-orders'], up: up4, down: down4 },
  ],
  clock: () => 1_700_000_000_000 + (tick += 1),
});
const show = (label, value) => console.log(`    ${label} ${value}`);

console.log('migrationplan demo');

console.log('[1] 执行顺序：依赖在前，每一步挑 id 字典序最小的');
show('plan', JSON.stringify(migrator.plan()));

console.log('[2] 只跑到 0003，0004 先放着');
show('migrate', JSON.stringify(migrator.migrate({ through: '0003-index' })));
show('status', migrator.status().map((one) => `${one.id}=${one.state}`).join(' '));

console.log('[3] 再跑一遍：跑过的不重复跑');
show('migrate', JSON.stringify(migrator.migrate()).replace(/,"skipped":\[\]/, ''));
show('history', migrator.history().map((one) => `${one.id}@${one.appliedAt}`).join(' '));

console.log('[4] 倒着退两条');
show('rollback', JSON.stringify(migrator.rollback({ steps: 2 })));
show('trace', trace.join(' '));

console.log('[5] 改了一个已经应用过的迁移，校验和对不上');
const edited = createMigrator({
  migrations: [
    { id: '0001-users', dependsOn: [], up: up1, down: down1 },
    { id: '0002-orders', dependsOn: ['0001-users'], up: () => trace.push('up:0002-orders 改了'), down: down2 },
  ],
  clock: () => 1_700_000_000_000,
  applied: migrator.history(),
});
try {
  edited.plan();
} catch (err) {
  show('plan', `${err.code} ${err.details.id}`);
}

console.log('[6] 统计');
console.log(`    ${JSON.stringify(migrator.stats())}`);
