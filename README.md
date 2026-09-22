# retryplan

重试策略计算：第几次失败该不该再试、等多久——指数退避、服务端给的 Retry-After 优先、
可选抖动、次数上限。只用 Node 标准库，没有第三方包，`node >= 20`。

```
retryplan/
├── lib/
│   ├── retry.js     createRetryPolicy 本体                   ← 还没实现
│   └── errors.js    RetryError 与全部错误码
├── test/            next / config 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 11 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createRetryPolicy({ maxAttempts, baseDelayMs, maxDelayMs, jitter, random })`

- `maxAttempts` 默认 3、`baseDelayMs` 默认 100、`maxDelayMs` 默认 2000，
  这三个都是**整数且不小于给定下限**（次数下限 1，延迟下限 1），不合法报 `ERR_BAD_CONFIG`。
- `jitter` 默认 `'none'`，只认 `'none'` 和 `'full'`；别的值报 `ERR_BAD_CONFIG`。
- `random` 默认 `Math.random`，必须是函数；**只有 `jitter === 'full'` 的时候才会被调用**。
- `limits()` 返回生效的配置。

### next 的判断顺序

`next({ attempt, error })` 返回 `{ retry, delayMs, reason }`，`reason` 只会是
`not-retryable` / `attempts-exhausted` / `retry-after` / `backoff` 四种，顺序写死了：

1. `error.retryable === false` → `{ retry: false, delayMs: 0, reason: 'not-retryable' }`
   （**比次数上限先判**：这次失败本身就不该重试，跟试了几次无关）。
2. `attempt >= maxAttempts` → `{ retry: false, delayMs: 0, reason: 'attempts-exhausted' }`。
3. `error.retryAfterMs` 给了（非负整数）→ 听它的：
   `delayMs = min(retryAfterMs, maxDelayMs)`，reason 是 `retry-after`（给 0 就是立刻重试）。
4. 否则指数退避：`delayMs = min(baseDelayMs × 2^(attempt-1), maxDelayMs)`，reason 是 `backoff`。
5. 最后如果 `jitter === 'full'`，把延迟抖成 `floor(random() × delayMs)`
   ——**在算完之后抖**，所以抖动后的值不会超过原来的延迟。

`attempt` 是"第几次尝试失败了"，从 1 开始；不是正整数报 `ERR_BAD_REQUEST`。
`error` 可以省略或者给空对象（当作可重试），给了就得是对象：
`retryable` 必须是布尔、`retryAfterMs` 必须是非负整数，否则报 `ERR_BAD_REQUEST`。
`random()` 如果返回的不是 0~1 的数字，也报 `ERR_BAD_REQUEST`。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `maxAttempts` / `baseDelayMs` / `maxDelayMs` 不是合法整数、`jitter` 不认识、`random` 不是函数 |
| `ERR_BAD_REQUEST` | `attempt` 不是正整数、`error` 不是对象或字段类型不对、`random()` 返回值越界 |

## API

```js
import { createRetryPolicy, DEFAULTS, REASONS } from './lib/retry.js';

const policy = createRetryPolicy({ maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2000, jitter: 'full' });

policy.next({ attempt: 1, error: { status: 503 } });          // -> { retry: true, delayMs: 100, reason: 'backoff' }
policy.next({ attempt: 1, error: { retryAfterMs: 1500 } });   // -> { retry: true, delayMs: 1500, reason: 'retry-after' }
policy.next({ attempt: 3, error: {} });                       // -> { retry: false, delayMs: 0, reason: 'attempts-exhausted' }
policy.next({ attempt: 1, error: { retryable: false } });     // -> { retry: false, delayMs: 0, reason: 'not-retryable' }
policy.limits();                                              // -> 生效的配置
```

出错一律抛 `RetryError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的配置和随机数都是写死的，输出每一行都能对上：

```
retryplan demo
[1] 默认策略：最多试三次
    attempt=1 retry=true delay=100 backoff
    attempt=2 retry=true delay=200 backoff
    attempt=3 retry=false delay=0 attempts-exhausted
[2] 服务端给了 Retry-After 就听它的
    retry=true delay=1500 retry-after
[3] Retry-After 超过上限要截断
    retry=true delay=2000 retry-after
[4] 不该重试的错误
    retry=false delay=0 not-retryable
[5] full jitter（随机数固定成 0.5）
    retry=true delay=50 backoff
[6] 延迟封顶
    retry=true delay=250 backoff
```
