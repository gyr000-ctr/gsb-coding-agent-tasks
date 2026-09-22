# taskqueue

后端用的内存任务队列：延迟投递、取走之后有可见性超时、处理失败可以放回去重试、
超过次数就进死信。只用 Node 标准库，没有第三方包，`node >= 20`。

```
taskqueue/
├── lib/
│   ├── queue.js     createQueue 本体                         ← 还没实现
│   └── errors.js    QueueError 与全部错误码
├── test/            queue / visibility 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 11 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createQueue({ maxAttempts, clock })`：`maxAttempts` 默认 3（正整数），`clock` 不给就用系统时间。
**"现在几点"只走 clock**；配置或参数里的整数不合法报 `ERR_BAD_OPTION`，
配置本身不是对象、`clock` 不是函数报 `ERR_BAD_CONFIG`。

### 投递

`enqueue(payload, { delayMs })` → `{ id, visibleAt }`：

- `payload` 必须是普通对象（数组、字符串、null 都报 `ERR_BAD_PAYLOAD`），进队时**存的是副本**。
- id 按投递顺序生成：`job-1`、`job-2`……；`delayMs` 默认 0（立刻可见），非负整数。
- `visibleAt` 就是这个任务最早能被取走的时刻。

### 取任务

`receive({ visibilityTimeoutMs, max })` → 数组，元素是 `{ id, payload, attempts, receipt }`：

- 只取 `visibleAt <= now` 的任务，**按投递顺序**先来先取，最多 `max` 个
  （`max` 默认 1、上限 10；`visibilityTimeoutMs` 默认 30000，必须是正整数）。
- 每被取走一次 `attempts` 加一，`receipt` 是这一轮的凭证：`r-<id>-<attempts>`。
- 取走之后 `visibleAt = now + visibilityTimeoutMs`：这段时间里别人取不到它（in-flight）。

### ack / nack

- `ack(id, receipt)`：任务存在、正被取走、receipt 对得上 → 从队列里删掉，返回 `true`；
  其它情况一律返回 `false`（**不抛异常**：重复 ack、拿上一轮的 receipt、id 不存在都是 false）。
- `nack(id, receipt, { delayMs })`：把任务放回去，`visibleAt = now + delayMs`（默认 0），
  返回 `{ ok: true, dead: false }`；receipt 对不上返回 `{ ok: false, dead: false }`。

### 重试与死信

次数是按"投递了几次"算的，`attempts` 超过 `maxAttempts` 就是死信：

- `nack` 的时候如果 `attempts >= maxAttempts`，任务立刻进死信，返回 `{ ok: true, dead: true }`。
- 可见性超时也是一种投递：**没人 ack 也没人 nack** 的任务，超时后会被再次取走、次数继续加；
  下一次 `receive` 时如果 `attempts` 已经超过上限，任务直接进死信、不返回给调用方。
- `deadLetters()` → `[{ id, payload, attempts, reason }]`，目前 reason 只有 `'attempts-exhausted'`。

### 统计

`stats()` → `{ ready, inflight, delayed, dead }`：`ready` 是现在就能取走的（含可见性已经超时的），
`inflight` 是还在可见性窗口里的，`delayed` 是延迟还没到点的，`dead` 是死信条数。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `createQueue` 收到的不是对象、`clock` 不是函数或没返回时间 |
| `ERR_BAD_OPTION` | `maxAttempts` / `delayMs` / `visibilityTimeoutMs` / `max` 不合法、选项不是对象 |
| `ERR_BAD_PAYLOAD` | `payload` 不是普通对象，或者里面有没法拷贝的东西 |

## API

```js
import { createQueue, DEFAULTS } from './lib/queue.js';

const queue = createQueue({ maxAttempts: 3, clock: () => Date.now() });

queue.enqueue({ orderId: 'A-1' });                 // -> { id: 'job-1', visibleAt: 1767225600000 }
queue.enqueue({ orderId: 'A-2' }, { delayMs: 5000 });
queue.receive({ max: 2 });                         // -> [{ id, payload, attempts, receipt }, ...]
queue.ack('job-1', 'r-job-1-1');                   // -> true / false
queue.nack('job-3', 'r-job-3-1', { delayMs: 1000 });   // -> { ok, dead }
queue.stats();                                     // -> { ready, inflight, delayed, dead }
queue.deadLetters();                               // -> [{ id, payload, attempts, reason }]
```

出错一律抛 `QueueError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间都是写死的，输出每一行都能对上：

```
taskqueue demo
[1] 投三个任务（一个延迟 5 秒），先取两个
    job-1 attempts=1 receipt=r-job-1-1
    job-3 attempts=1 receipt=r-job-3-1
    {"ready":0,"inflight":2,"delayed":1,"dead":0}
[2] 一个处理成功，一个放回去 1 秒后再试
    {"ready":0,"inflight":0,"delayed":2,"dead":0}
[3] 一秒后又能取到，次数变成 2
    job-3 attempts=2 receipt=r-job-3-2
    {"ready":0,"inflight":1,"delayed":1,"dead":0}
[4] 这次既不 ack 也不 nack：超时之后它会自己回来
    {"ready":2,"inflight":0,"delayed":0,"dead":0}
    job-2(attempts=1) job-3(attempts=3)
[5] 再拖一轮，超过三次就进死信
    job-2(attempts=2)
    {"ready":0,"inflight":1,"delayed":0,"dead":1}
    deadLetters=[{"id":"job-3","payload":{"orderId":"A-3"},"attempts":4,"reason":"attempts-exhausted"}]
```
