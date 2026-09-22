# auditlog

后端审计日志：事件写入时把敏感字段脱敏、按操作人和时间范围查询、超过保留期或条数上限就裁剪。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
auditlog/
├── lib/
│   ├── audit.js     createAuditLog 本体                      ← 还没实现
│   └── errors.js    AuditError 与全部错误码
├── test/            append / query 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 12 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createAuditLog({ clock, retentionMs, maxEvents })`：

- `retentionMs` 默认 2592000000（30 天）、`maxEvents` 默认 10000，都是正整数，否则 `ERR_BAD_CONFIG`。
- `clock` 不给就用系统时间；**"现在几点"只走 clock**。

### 写事件

`append({ actor, action, target, meta, at })` → 事件 `{ id, at, actor, action, target, meta }`：

- `actor` / `action` 是非空字符串；`target` 不给就是 `null`；`meta` 不给就是 `{}`
  （给了必须是普通对象）；`at` 不给就是"现在"，给了必须是有限的毫秒数。
  任何一项不合法报 `ERR_BAD_EVENT`。
- id 按写入顺序生成 `evt-1`、`evt-2`……
- **敏感字段脱敏**：键名匹配 `password` / `passwd` / `token` / `secret` / `authorization` /
  `api-key` / `apikey`（大小写不敏感，连字符可有可无）时，值换成 `'***'`；
  `meta` 里的嵌套对象和数组会递归处理，别的位置（`actor`、`target` 这些）不动。
- 写进去和查出来的都是**深拷贝**：外面改它不影响库里存的那份。
- 每次写入都会顺手 `prune()` 一次；如果条数还超过 `maxEvents`，就从**最老**的开始丢，
  直到不超过为止（丢掉的都计入 `pruned`）。

### 查询

`query({ actor, action, from, to, limit })` → 事件数组：

- 按 `at` 升序；`at` 相同的按写入顺序（id 小的在前）。
- `actor` / `action` 是精确匹配；`from` / `to` **含边界**（`at >= from`、`at <= to`）。
- `limit` 默认 50，必须是 1 ~ 200 的整数；`from` / `to` 必须是有限的毫秒数。
  参数不是对象、或上面这些不合法报 `ERR_BAD_QUERY`。

### 裁剪与统计

- `prune()` → 清掉 `now - at > retentionMs` 的事件（**严格大于**，正好到保留期那一刻还在），
  返回清掉几条。
- `stats()` → `{ total, appended, pruned }`：`total` 是当前条数，另外两个是累计值。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `retentionMs` / `maxEvents` 不是正整数、`clock` 不合法、配置不是对象 |
| `ERR_BAD_EVENT` | `append` 的 actor/action/meta/at 不合法，或参数不是对象 |
| `ERR_BAD_QUERY` | `query` 的参数不是对象、`limit` 越界、`from` / `to` 不是数字 |

## API

```js
import { createAuditLog, DEFAULTS, SENSITIVE_KEYS } from './lib/audit.js';

const audit = createAuditLog({ retentionMs: 7 * 86400000, maxEvents: 1000, clock: () => Date.now() });

audit.append({ actor: 'u-1', action: 'auth.login', meta: { password: 'hunter2', ip: '10.0.0.1' } });
// -> { id: 'evt-1', at, actor: 'u-1', action: 'auth.login', target: null,
//      meta: { password: '***', ip: '10.0.0.1' } }

audit.query({ actor: 'u-1', limit: 10 });   // -> 事件数组（按时间升序）
audit.query({ from: Date.now() - 86400000, to: Date.now() });
audit.prune();                              // -> 清掉几条
audit.stats();                              // -> { total, appended, pruned }
```

出错一律抛 `AuditError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间都是写死的，输出每一行都能对上：

```
auditlog demo
[1] 写三条事件
    evt-1@0 evt-2@60000 evt-3@120000
[2] 敏感字段已经变成 ***
    {"password":"***","ip":"10.0.0.1"}
[3] 按操作人查
    u-1 -> auth.login,order.refund
[4] 七天前的事件会被清掉
    现在剩 evt-4
[5] 统计
    {"total":1,"appended":4,"pruned":3}
```
