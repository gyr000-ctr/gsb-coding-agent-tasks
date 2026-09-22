# leaselock

一份带租期的分布式锁：谁拿到锁谁拿到一个只增不减的 **fencing token**，
下游存储只认当前这个 token，老持有者手上那张票再也写不进去。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
leaselock/
├── lib/
│   ├── leaselock.js  createLockService 本体            ← 还没实现
│   └── errors.js     LeaseError 与全部错误码
├── test/             lease / fencing 两组用例
├── scripts/demo.mjs  手工过一遍的演示脚本
└── package.json      npm test / npm run demo
```

```
npm test        # 17 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 时间与租约

- 时间一律是毫秒整数，`clock()` 由调用方注入，不读系统时间。
- 租约的判定是 **`expiresAt <= now` 就算过期**（刚好到点不算持有）。
- 过期是**懒判定**的：任何碰到这个 key 的接口都先结算一次；一个租约只结算一次
  （同一个租约被反复碰到不会把 `expirations` 加第二次）。

### token 与 fencing

- 每个 key 自己一条 token 线，**只增不减、永不复用**：换一次持有者就 +1，首次是 1。
  释放、过期、重入都不会让 token 回退。
- `checkFence({ key, token })` 是给下游存储用的写入门：**只有当前正在持有这把锁的持有者
  拿着它当前的 token** 才放行；老的 token、以及锁被释放/过期之后（没有持有者）一律挡掉。
  没见过的 key 返回 `false`（不抛）。

### 几个接口的口径

`acquire({ key, owner, ttlMs })`：

- `key` / `owner` 必须是非空字符串；`ttlMs` 省略时用 `defaultTtlMs`，必须是正整数。
- 没记录或已过期 → 发给它：`token` 是这条线上下一个值，`expiresAt = now + ttlMs`，
  返回里 `reentrant: false`；原来那把是过期掉的话，这次顺手把 `expirations` 记上。
- 记录在、没过期、**owner 相同** → 算重入：token 不变，只把 `expiresAt` 顺延到 `now + ttlMs`，
  返回里 `reentrant: true`。
- 记录在、没过期、owner 不同 → `ERR_LOCKED`，`details` 带上 `owner` / `token` /
  `expiresAt` / `remainingMs`。

`renew({ key, owner, token, ttlMs })` 和 `release({ key, owner, token })`：

- key 没见过 → `ERR_UNKNOWN_LOCK`；
- 租约已经不在了（过期或已释放） → **`ERR_LEASE_LOST`**，这条优先于 token 校验；
- owner / token 对不上 → `ERR_BAD_TOKEN`，`details.expectedToken` 给出现在有效的那个。
- `renew` 成功返回 `{ key, owner, token, expiresAt }`；`release` 成功返回
  `{ key, released: true, token, expiresAt }`（保留到期时间，方便对账）。

`status({ key })` 返回 `{ key, owner, token, expiresAt, remainingMs }`，没持有（包括没见过）返回 `null`；
`isHeld({ key })` 返回布尔。这两个都不抛「没见过」。

`sweep()` 走一遍所有 key 把过期的结算掉，返回这次新结算的条数（再调就是 0）。

`list({ heldOnly = true })` 按 key 升序返回 `[{ key, owner, token, expiresAt, held }]`，
默认只列还持有的。

`stats()` 会顺手结算过期，返回
`{ keys, held, acquisitions, reentries, renewals, releases, expirations }`：`keys` 是见过的 key 总数
（**不删记录**，token 线要靠它），`held` 是此刻还持有的数量。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `config` 不是对象、`clock` 不是函数或返回非有限数、`defaultTtlMs` 不是正整数 |
| `ERR_BAD_ARGS` | `key` / `owner` 不是非空字符串、`token` 不是正整数、接口没给参数对象 |
| `ERR_BAD_TTL` | `ttlMs` 不是正整数 |
| `ERR_LOCKED` | 锁还被别人持有 |
| `ERR_UNKNOWN_LOCK` | 这个 key 从来没被见过 |
| `ERR_BAD_TOKEN` | owner / token 对不上 |
| `ERR_LEASE_LOST` | 这个 key 的租约已经不在了（过期或已释放） |

## API

```js
import { createLockService, DEFAULTS } from './lib/leaselock.js';

let now = Date.parse('2026-06-01T00:00:00Z');
const service = createLockService({ clock: () => now, defaultTtlMs: 30_000 });

const lease = service.acquire({ key: 'orders/42', owner: 'worker-a', ttlMs: 10_000 });
lease.token;                        // -> 1
service.renew({ key: 'orders/42', owner: 'worker-a', token: lease.token, ttlMs: 10_000 });
service.checkFence({ key: 'orders/42', token: lease.token });   // -> true
service.release({ key: 'orders/42', owner: 'worker-a', token: lease.token });
service.checkFence({ key: 'orders/42', token: lease.token });   // -> false
service.list();
service.stats();
```

出错一律抛 `LeaseError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里时间是写死的，输出每一行都能对上：

```
leaselock demo
[1] 拿到锁：token 从 1 开始
    token 1 到期 1400 重入 false
[2] 同一个持有者再拿：重入，token 不变、租约顺延
    token 1 到期 1600 重入 true
[3] 别人来抢：被挡住
    ERR ERR_LOCKED owner=worker-a remaining=500
[4] 租约到点就被判过期，换人换 token
    token owner=worker-b token=2 到期 2100
[5] fencing：旧持有者的写入被挡掉
    checkFence a/1=false b/2=true
[6] 释放之后连自己也被挡
    checkFence b/2=false
    status null
[7] 统计
    {"keys":1,"held":0,"acquisitions":2,"reentries":1,"renewals":0,"releases":1,"expirations":1}
```
