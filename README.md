# migrationplan

数据库迁移的编排：谁先谁后按依赖算，跑挂了的按配置回退，
已经上过的迁移要是被人偷偷改了内容（校验和对不上）或干脆删了，得当场拦住。
只用 Node 标准库（`node:crypto` 算校验和），没有第三方包，`node >= 20`。

```
migrationplan/
├── lib/
│   ├── migrationplan.js  createMigrator 本体           ← 还没实现
│   └── errors.js         MigrationError 与全部错误码
├── test/                 plan / apply 两组用例
├── scripts/demo.mjs      手工过一遍的演示脚本
└── package.json          npm test / npm run demo
```

```
npm test        # 13 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 迁移定义与校验和

`createMigrator({ migrations, applied, clock, onFailure })`：

- 每条迁移是 `{ id, dependsOn, up, down }`：`id` 非空且不能重复，`dependsOn` 是字符串数组
  （不给就是 `[]`），`up` / `down` 都必须是函数。
- 校验和由**函数源码**算出来，不再让人工填：
  `checksum = sha256(String(up) + '\u0000' + String(down)).slice(0, 16)`（十六进制小写 16 位）。
  也就是说，改动 `up` / `down` 的写法（哪怕只是多写一句）就会换校验和。
- `dependsOn` 指了没定义的迁移 → `ERR_UNKNOWN_DEPENDENCY`；依赖成环（包括指向自己）
  → `ERR_DEPENDENCY_CYCLE`：这两条在构造时就报。
- `applied` 是「数据库里记的那张表」：`[{ id, checksum, appliedAt }]`，按应用顺序给。

### 执行顺序

每一步都在「依赖已经排好的迁移」里挑 **`id` 字典序最小** 的那个，
也就是 `a` 依赖 `b`、`c` 谁都不依赖时，顺序是 `a, b, c` 而不是 `b, a, c`。

### 漂移与缺失

`plan()` / `migrate()` / `rollback()` 之前都会对一遍 `applied`：

- `applied` 里的 id 现在不存在了 → `ERR_MISSING_MIGRATION`；
- id 在、但记录里的 checksum 跟现在算出来的不一样 → `ERR_CHECKSUM_DRIFT`
  （`details` 里给 `recorded` 和 `current`）。

`status()` 不做这个拦截，它把每条迁移的状态列出来，按 id 升序：
`{ id, state, checksum, appliedAt }`，`state` 是 `applied` / `pending` / `drift` / `missing`
（`missing` 只在 `applied` 里出现，`checksum` 用记录里那个）。

### 干活

`plan()` → `{ applied, pending }`：`applied` 是记录里的顺序，`pending` 是还没跑的、按执行顺序。

`migrate({ through })`：把 pending 里执行顺序**不晚于 `through`** 的跑掉
（不给 `through` 就是全部）；`through` 没定义过 → `ERR_UNKNOWN_MIGRATION`。
返回 `{ applied, alreadyApplied, skipped }`：这轮真跑了的、本来就已经应用过的、还没轮到的。
每条成功之后往 `history` 里记 `{ id, checksum, appliedAt }`，`appliedAt` 取 `clock()`。
已经应用过的不再跑第二遍。

某条 `up` 抛错时：

- `onFailure`（默认 `'rollback'`）是 `'rollback'`：把**这一轮刚才跑起来的**按倒序 `down()` 回去，
  然后抛 `ERR_MIGRATION_FAILED`，`details` 是 `{ id, applied, rolledBack, cause }`
  （`id` 是炸掉的那条，`applied` 是炸之前这一轮的成果，`rolledBack` 是回退顺序）；
  失败那条不写进 `history`。
- `onFailure` 是 `'stop'`：不回退，直接抛 `ERR_MIGRATION_FAILED`，`details.rolledBack` 是空数组，
  已经跑起来的那几条留在 `history` 里。
- 回退途中某个 `down()` 也抛了：**立刻停下**，抛 `ERR_ROLLBACK_FAILED`，
  `details` 是 `{ failedDown, rolledBack, stillApplied }`；失败那条仍然算 applied，
  还没退到的也都保持 applied。

`rollback({ steps = 1 })`：从 `history` 尾部倒着退 `steps` 条，返回
`{ rolledBack, remaining }`；`steps` 不是正整数 → `ERR_BAD_ARGS`，
比 `history` 里的条数还多 → `ERR_NOT_ENOUGH_HISTORY`（`details` 里有 `requested` / `available`）。
中途 `down()` 抛错同样抛 `ERR_ROLLBACK_FAILED`（已经退掉的那些不再回滚）。

`history()` 返回应用记录的拷贝；`stats()` →
`{ migrations, applied, pending, runs, failures, rollbacks }`：
`runs` 是 `migrate` 的调用次数，`failures` 是有迁移抛错的次数，
`rollbacks` 是累计回退掉的条数。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `config` / `migrations` / `applied` 不是对象或数组、`clock` 不是函数、`onFailure` 不是 `rollback` / `stop` |
| `ERR_BAD_ARGS` | `migrate` / `rollback` 没给参数对象、`steps` 不是正整数 |
| `ERR_BAD_MIGRATION` | 迁移定义本身不合法（id / dependsOn / up / down） |
| `ERR_DUPLICATE_MIGRATION` | 同一个 id 定义两次 |
| `ERR_UNKNOWN_DEPENDENCY` | `dependsOn` 指了没定义的迁移 |
| `ERR_DEPENDENCY_CYCLE` | 依赖成环 |
| `ERR_MISSING_MIGRATION` | 记录里有、现在列表里没有的迁移 |
| `ERR_CHECKSUM_DRIFT` | 记录里的校验和跟现在算出来的不一样 |
| `ERR_UNKNOWN_MIGRATION` | `through` 指了没定义的迁移 |
| `ERR_MIGRATION_FAILED` | 某条迁移的 `up` 抛错 |
| `ERR_ROLLBACK_FAILED` | 回退时某条 `down` 抛错 |
| `ERR_NOT_ENOUGH_HISTORY` | 要退的条数比记录里的还多 |

## API

```js
import { createMigrator, DEFAULTS } from './lib/migrationplan.js';

const migrator = createMigrator({
  migrations: [
    { id: '0001-users', dependsOn: [], up, down },
    { id: '0002-orders', dependsOn: ['0001-users'], up, down },
  ],
  applied: [{ id: '0001-users', checksum: '...', appliedAt: 1_700_000_000_000 }],
  clock: () => Date.now(),
  onFailure: 'rollback',
});

migrator.plan();                  // -> { applied, pending }
migrator.migrate({ through: '0002-orders' });  // -> { applied, alreadyApplied, skipped }
migrator.rollback({ steps: 1 });  // -> { rolledBack, remaining }
migrator.status();
migrator.history();
migrator.stats();
```

出错一律抛 `MigrationError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里迁移和时钟都是写死的，输出每一行都能对上：

```
migrationplan demo
[1] 执行顺序：依赖在前，每一步挑 id 字典序最小的
    plan {"applied":[],"pending":["0001-users","0002-orders","0003-index","0004-views"]}
[2] 只跑到 0003，0004 先放着
    migrate {"applied":["0001-users","0002-orders","0003-index"],"alreadyApplied":[],"skipped":["0004-views"]}
    status 0001-users=applied 0002-orders=applied 0003-index=applied 0004-views=pending
[3] 再跑一遍：跑过的不重复跑
    migrate {"applied":["0004-views"],"alreadyApplied":["0001-users","0002-orders","0003-index"]}
    history 0001-users@1700000000001 0002-orders@1700000000002 0003-index@1700000000003 0004-views@1700000000004
[4] 倒着退两条
    rollback {"rolledBack":["0004-views","0003-index"],"remaining":["0001-users","0002-orders"]}
    trace up:0001-users up:0002-orders up:0003-index up:0004-views down:0004-views down:0003-index
[5] 改了一个已经应用过的迁移，校验和对不上
    plan ERR_CHECKSUM_DRIFT 0002-orders
[6] 统计
    {"migrations":4,"applied":2,"pending":2,"runs":2,"failures":0,"rollbacks":2}
```
