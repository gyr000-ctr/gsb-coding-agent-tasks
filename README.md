# sessionvault

后端登录会话：滑动空闲过期 + 绝对上限、同一设备重复登录顶号、设备数上限踢最久没用的、
刷新令牌轮换与"旧令牌复用"检测。只用 Node 标准库，没有第三方包，`node >= 20`。

```
sessionvault/
├── lib/
│   ├── vault.js     createVault 本体                         ← 还没实现
│   └── errors.js    SessionError 与全部错误码
├── test/            login / refresh 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 15 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createVault({ idleTtlMs, absoluteTtlMs, maxDevices, clock })`

- `idleTtlMs` 默认 1800000（空闲多久没动静就算过期）、`absoluteTtlMs` 默认 86400000
  （不管有没有动静，登录之后最多活这么久）、`maxDevices` 默认 3；
  三个都是正整数，不合法报 `ERR_BAD_CONFIG`。
- `clock` 不给就用系统时间；**"现在几点"只走 clock**，返回 `Date` 或毫秒数字都行。

### 登录

`login({ userId, deviceId })` → `{ sessionId, refreshToken, expiresAt, absoluteExpiresAt, evicted }`

- `userId` / `deviceId` 都得是非空字符串，否则 `ERR_BAD_SESSION`。
- sessionId 按登录顺序生成 `sess-1`、`sess-2`……；刷新令牌是 `rt-<sessionId>-<代次>`，初始代次 1。
- 同一个 `userId + deviceId` 已经登录过 → **旧的立刻撤销**，新的上任，被撤的 id 放进 `evicted`。
- 之后如果活跃会话数已经到 `maxDevices`，按 `lastSeen` 从旧到新踢，**踢到能放下新会话为止**
  （同样是撤销，不是删除，也记进 `evicted`）。

### 过期

两种情况，**到点那一刻就算过期**（`>=`）：

1. `now - lastSeen >= idleTtlMs`（滑动过期，`touch` / `refresh` 会把 `lastSeen` 推到现在）；
2. `now >= createdAt + absoluteTtlMs`（绝对上限，推不动）。

过期是惰性发现的：任何一次对外调用都会先扫一遍，把过期的会话标掉并记一次 `expired`；
之后再用这个会话就报 `ERR_SESSION_EXPIRED`。

### 使用会话

- `touch(sessionId)` → `{ expiresAt, absoluteExpiresAt }`，并把空闲计时重新开始。
- `refresh(sessionId, refreshToken)` → `{ refreshToken, expiresAt, absoluteExpiresAt }`：
  令牌对得上就**轮换**（代次加一，返回新令牌），旧的立刻作废。
- 令牌对不上（拿已经轮换掉的旧令牌、或者别的乱七八糟的串）→ 认为发生了令牌复用：
  **撤销这个会话，并把这个 userId 的所有活跃会话全部撤销**，抛 `ERR_REFRESH_REUSED`。
- `logout(sessionId)` → 撤销成功返回 `true`；不存在或已经撤销返回 `false`（不抛异常）。
- `revokeUser(userId)` → 撤销该用户所有还没撤销的会话，返回条数。
- 会话不存在或者已经撤销时报 `ERR_BAD_SESSION`；已经过期报 `ERR_SESSION_EXPIRED`。

### 查询与统计

- `sessions(userId)` → 活跃会话列表，按 `lastSeen` 从新到旧，并列时 sessionId 升序；
  每条是 `{ sessionId, deviceId, createdAt, lastSeen, expiresAt, absoluteExpiresAt }`。
- `stats()` → `{ active, revoked, expired }`：`active` 是当前还活的，`revoked` 是累计被撤销的，
  `expired` 是累计被判定过期的（同一条只记一次）。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | 三个 TTL / `maxDevices` 不是正整数、`clock` 不是函数或没返回时间、配置不是对象 |
| `ERR_BAD_SESSION` | `login` 的参数不对、会话不存在、会话已撤销 |
| `ERR_SESSION_EXPIRED` | 会话空闲超时或到了绝对上限 |
| `ERR_REFRESH_REUSED` | 刷新令牌对不上（典型的旧令牌复用），相关会话会被全部撤销 |

## API

```js
import { createVault, DEFAULTS } from './lib/vault.js';

const vault = createVault({ maxDevices: 2, idleTtlMs: 600000, clock: () => Date.now() });

const first = vault.login({ userId: 'u1', deviceId: 'phone' });
// -> { sessionId: 'sess-1', refreshToken: 'rt-sess-1-1', expiresAt, absoluteExpiresAt, evicted: [] }

vault.touch(first.sessionId);                       // -> { expiresAt, absoluteExpiresAt }
vault.refresh(first.sessionId, first.refreshToken); // -> { refreshToken: 'rt-sess-1-2', ... }
vault.logout(first.sessionId);                      // -> true / false
vault.revokeUser('u1');                             // -> 撤销条数
vault.sessions('u1');                               // -> 活跃会话（最近使用在前）
vault.stats();                                      // -> { active, revoked, expired }
```

出错一律抛 `SessionError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间都是写死的，输出每一行都能对上：

```
sessionvault demo
[1] 手机上登录一次
    sess-1 token=rt-sess-1-1 过期 1767226200000
[2] 同一台手机再登录，旧的被顶掉
    evicted=sess-1 活跃 sess-2(phone)
[3] 设备上限 2：加平板再加笔记本，最久没用的出局
    加平板：sess-3 加笔记本时踢掉 sess-3
    活跃 sess-4(laptop),sess-2(phone)
[4] 刷新令牌会轮换
    rt-sess-4-1 -> rt-sess-4-2
[5] 拿已经用过的旧令牌再刷：这个用户的会话全部撤销
    ERR_REFRESH_REUSED
    活跃 （空） 统计 {"active":0,"revoked":4,"expired":0}
[6] 空闲过期：10 分钟没动静
    599999 毫秒时 1767226802999
    600000 毫秒时 ERR_SESSION_EXPIRED
```
