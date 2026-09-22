# idempotent

后端写接口的幂等层：用 `Idempotency-Key` + 请求指纹做去重，重复请求直接回放第一次的结果，
请求内容变了就报冲突，记录有 TTL。只用 Node 标准库，没有第三方包，`node >= 20`。

```
idempotent/
├── lib/
│   ├── executor.js  createExecutor 本体                      ← 还没实现
│   └── errors.js    IdempotencyError 与全部错误码
├── test/            run / store 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 10 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createExecutor({ clock, ttlMs })`：`ttlMs` 默认 86400000（一条记录保留多久），必须是正整数；
`clock` 不给就用系统时间，**"现在几点"只走 clock**。不合法报 `ERR_BAD_CONFIG`。

### run

`run({ key, fingerprint }, handler)` → `{ status, result, at }`：

- `key`（幂等键）和 `fingerprint`（请求指纹，比如 body 的哈希）都得是非空字符串，
  否则报 `ERR_BAD_KEY`；`handler` 必须是函数，否则报 `ERR_BAD_CONFIG`。
- **第一次**：调 `handler()`，把结果记下来，返回 `{ status: 'executed', result, at }`
  （`at` 是这次执行的时间）。
- **重复**（key 已存在、指纹相同、还没过期）：**不调 handler**，直接回放第一次的结果，
  返回 `{ status: 'replayed', result, at }`（`at` 还是第一次的时间）。
- **同一个 key 换了指纹**：报 `ERR_FINGERPRINT_MISMATCH`（`details` 里带 key、两个指纹），
  handler 不能被调用——这种情况通常是客户端复用了幂等键但改了请求内容。
- **记录已经过期**（`now - at >= ttlMs`，到点即过期）：当成新请求，重新执行并覆盖记录。
- `handler` 抛异常：**不写记录**（下次还能重试），异常按原样继续往外抛。
- 存下来和返回的 `result` 都是**深拷贝**：外面改它不影响后面的回放。

### 其它

- `has(key)` → 有没有一条还没过期的记录（过期算 false，但**不会**顺手清理和计 pruned）。
- `forget(key)` → 手动删掉，返回是否删到了。
- `prune()` → 清掉所有过期记录，返回清掉几条。
- `stats()` → `{ stored, executed, replayed, conflicts, pruned }`：
  `stored` 是当前条数，其余是累计次数（过期被覆盖也记一次 `pruned`）。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `ttlMs` 不是正整数、`clock` 不合法、配置不是对象、`handler` 不是函数、结果没法深拷贝 |
| `ERR_BAD_KEY` | `key` / `fingerprint` 不是非空字符串，或 `run` 的参数不是对象 |
| `ERR_FINGERPRINT_MISMATCH` | 同一个 key 用了不同的指纹 |

## API

```js
import { createExecutor, DEFAULTS } from './lib/executor.js';

const executor = createExecutor({ ttlMs: 86400000, clock: () => Date.now() });

executor.run({ key: 'order-A-1', fingerprint: 'body-hash-1' }, () => chargeCard());
// -> { status: 'executed', result: {...}, at: 1767225600000 }

executor.run({ key: 'order-A-1', fingerprint: 'body-hash-1' }, () => chargeCard());
// -> { status: 'replayed', result: {...}, at: 1767225600000 }（handler 不会再被调用）

executor.has('order-A-1');   // -> true / false
executor.forget('order-A-1');// -> true / false
executor.prune();            // -> 清掉几条
executor.stats();            // -> { stored, executed, replayed, conflicts, pruned }
```

出错一律抛 `IdempotencyError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间都是写死的，输出每一行都能对上：

```
idempotent demo
[1] 第一次提交
    {"status":"executed","result":{"orderId":"A-1","charged":30},"at":1767225600000}
[2] 网络重试，同一个 key 再提交一次
    {"status":"replayed","result":{"orderId":"A-1","charged":30},"at":1767225600000}
    handler 实际调用次数 1
[3] 同一个 key 换了请求内容
    ERR_FINGERPRINT_MISMATCH key=order-A-1
[4] 一天之后记录过期，重新执行
    has=false 结果 {"status":"executed","result":{"orderId":"A-1","charged":60},"at":1767312000000}
    handler 实际调用次数 2
[5] 统计
    {"stored":1,"executed":2,"replayed":1,"conflicts":1,"pruned":1}
```
