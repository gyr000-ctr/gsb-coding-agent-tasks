# webhookout

出站 Webhook 投递器：按事件类型找订阅者、拼签名和幂等键、失败退避重试、
对方回 410 就永久停投。只用 Node 标准库，没有第三方包，`node >= 20`。

```
webhookout/
├── lib/
│   ├── dispatcher.js createDispatcher 本体                   ← 还没实现
│   └── errors.js     WebhookError 与全部错误码
├── test/             dispatch / retry 两组用例
├── scripts/demo.mjs  手工过一遍的演示脚本
└── package.json      npm test / npm run demo
```

```
npm test        # 11 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置与订阅

- `createDispatcher({ secret, clock, maxAttempts, baseDelayMs, maxDelayMs })`：
  `secret` 非空字符串（签名用），`maxAttempts` 默认 3、`baseDelayMs` 默认 1000、
  `maxDelayMs` 默认 60000，`clock` 不给就用系统时间。配置不合法报 `ERR_BAD_CONFIG`。
- `subscribe({ url, events })` → `{ id, url, events }`：id 按订阅顺序生成 `ep-1`、`ep-2`……
  `url` 得是 http/https 地址，`events` 是非空字符串数组（重复的会去掉，顺序保留）；
  不合法报 `ERR_BAD_ENDPOINT`。
- `unsubscribe(id)` → 把订阅停掉（`disabled`），之前已经派出去的投递不受影响；
  重复退订返回 `false`。

### 派发

`dispatch({ id, type, data })` → `{ created, duplicates }`：

- `id` / `type` 是非空字符串（`data` 不给就当 `{}`），否则报 `ERR_BAD_EVENT`。
- 只给"还启用着、并且订阅了这个 type"的订阅者生成投递；没匹配上就是空数组。
- **同一个 `event.id` 对同一个订阅者只会有一条投递**：重复派发时把已有投递的 id 放进
  `duplicates`，不再新建。
- 投递对象是 `{ id, endpointId, eventId, url, attempt, dueAt, headers, body }`，
  id 是 `dl-1`、`dl-2`……，`attempt` 从 1 开始，`dueAt` 是"现在"。
- `body` 是键排序后的紧凑 JSON：`canonicalJson({ id, type, data })`，同样的内容一定编出同样的字符串。
- `headers` 固定三个：`content-type: application/json`、
  `x-idempotency-key: <eventId>:<endpointId>`、
  `x-signature: t=<签发秒数>,v1=<HMAC-SHA256(secret, "<秒>.<body>") 的前 16 位十六进制>`。

### 回报结果

`report(deliveryId, { status, retryAfterMs })` → `{ ok, retry, dead, disabled }`：

- 找不到投递、`status` 不是 100~599 的整数、`retryAfterMs` 不是非负整数 → `ERR_BAD_DELIVERY`。
- `2xx` → 成功，`{ ok: true, retry: false, dead: false, disabled: false }`。
- `410` → 对方明确不要了：这条投递置为死信，**并且把这个订阅者停掉**，`disabled: true`。
- 其它状态：`attempt >= maxAttempts` 就是死信；否则排下一次重试——`attempt` 加一，
  `dueAt = now + delay`，delay 在有 `retryAfterMs` 时用它，否则退避
  `min(baseDelayMs × 2^(attempt-1), maxDelayMs)`（`retryAfterMs` 也要被 `maxDelayMs` 截断）。

`due()` → 现在到期（`dueAt <= now`）且还没结束的投递，按 `dueAt`、再按 id 排序。

### 统计

`stats()` → `{ pending, delivered, dead, duplicates, endpoints, disabled }`。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | secret 为空、三个数字配置不是正整数、`clock` 不合法、配置不是对象 |
| `ERR_BAD_ENDPOINT` | `subscribe` 的 url / events 不合法 |
| `ERR_BAD_EVENT` | `dispatch` 的事件缺 id / type，或不是对象 |
| `ERR_BAD_DELIVERY` | `report` 找不到投递、status 或 retryAfterMs 不合法 |

## API

```js
import { createDispatcher, DEFAULTS } from './lib/dispatcher.js';

const hub = createDispatcher({ secret: 'whsec', clock: () => Date.now() });
hub.subscribe({ url: 'https://crm.example.com/hook', events: ['order.created'] });

const { created } = hub.dispatch({ id: 'evt-1', type: 'order.created', data: { id: 'A-9' } });
hub.due();                                          // -> 到期的投递
hub.report(created[0].id, { status: 500 });         // -> { ok: true, retry: true, ... }
hub.report(created[0].id, { status: 410 });         // -> { ok: true, dead: true, disabled: true }
hub.unsubscribe('ep-1');                            // -> true / false
hub.stats();                                        // -> { pending, delivered, dead, duplicates, endpoints, disabled }
```

出错一律抛 `WebhookError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间、密钥和事件都是写死的，输出每一行都能对上：

```
webhookout demo
[1] 两个订阅者：一个只要订单创建，一个两类都要
    dl-1->ep-1 dl-2->ep-2
    重复派发同一事件：["dl-1","dl-2"]
[2] 一条投递长什么样
    幂等键 evt-1:ep-1
    签名 t=1767225600,v1=d8aa4e0afca528bf
    body {"data":{"amount":30,"id":"A-9"},"id":"evt-1","type":"order.created"}
[3] 一个成功、一个 500 退避一秒再试
    dl-2 成功 {"ok":true,"retry":false,"dead":false,"disabled":false}
    dl-1 第一次失败 {"ok":true,"retry":true,"dead":false,"disabled":false}
    一秒后到期的是 dl-1 attempt=2
    第二次失败 {"ok":true,"retry":false,"dead":true,"disabled":false}
[4] 新事件里对方回 410：以后不投了
    dl-4 收到 410 {"ok":true,"retry":false,"dead":true,"disabled":true}
    再来一个事件只投给 ep-1
[5] 统计
    {"pending":2,"delivered":1,"dead":2,"duplicates":2,"endpoints":2,"disabled":1}
    订阅者 ep-1/ep-2 现在禁用了 1 个
```
