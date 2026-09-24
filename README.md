# realtime

周期任务的「最早截止期优先」（EDF）：先拿精确分数算一遍能不能排得开，再一格一格把时间线
重演出来——谁被谁打断、哪一段空着、哪个作业误了期，全都得复现得一模一样。
只用 Node 标准库（分数用 `BigInt` 算），没有第三方包，`node >= 20`。

```
realtime/
├── lib/
│   ├── realtime.js    analyze / simulate / hyperperiod   ← 还没实现
│   └── errors.js      RealtimeError 与全部错误码
├── test/              analyze / simulate 两组用例
├── scripts/demo.mjs   手工过一遍的演示脚本
└── package.json       npm test / npm run demo
```

```
npm test        # 10 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 任务

每个任务是 `{ id, period, cost }`：

- `id` 非空字符串，一组任务里不能重复；
- `period`、`cost` 都是正整数，且 `cost <= period`（再大就是单个任务自己都顶满，直接算不合法）；
- **隐式截止期**：每个作业在 `k * period` 释放，必须赶在下一个释放时刻 `(k+1) * period` 之前跑完；
  时间格子是整数，一个作业占 `cost` 个格子。

### analyze：能不能排得开

`analyze({ tasks })` → `{ tasks, utilization, byTask, feasible, reason }`：

- `utilization` 是所有任务的 `cost / period` 之和，写成**精确分数** `{ num, den }`（已经约分）。
  分数一路用 `BigInt` 通分相加，别拿浮点凑：`1/2 + 1/3 + 1/6` 用浮点会得到
  `0.9999999999999999`，这边必须是不多不少 `{ num: 1, den: 1 }`。
  `num` / `den` 输出成普通数字（本仓库的输入量级下不会超过安全整数）。
- `byTask` 每条是 `{ id, utilization }`，`utilization` 同样是约分后的分数，按任务给的顺序。
- 隐式截止期下 EDF 可调度的**充要条件**就是利用率不超过 1，所以 `feasible` 就是
  `utilization <= 1`；`reason` 里把话说明白（超过 1 的那句要能被 `/utilization > 1/` 匹配上）。
- `tasks` 是任务清单的拷贝，外面改它不影响已经算出来的结果。

### hyperperiod

`hyperperiod(tasks)` 直接吃任务数组，返回各周期的最小公倍数（`[4, 6, 12]` → `12`）。

### simulate：一格一格重演

`simulate({ tasks, until })`：

- `until` 不给就取 `hyperperiod(tasks)`；给了必须是正整数，而且不能超过 `1000000`（`DEFAULTS.maxTicks`）。
  只重演 `[0, until)` 这一段，释放时刻落在 `until` 及以后的作业不出现。
- 每一格开始的时候，先按周期把该释放的作业放出来（初始剩余量 = `cost`），
  然后在**已经释放且还没跑完**的作业里挑一个跑这一格：
  绝对截止期最小的优先；截止期一样时任务 `id` 字典序小的优先；再一样就比释放时刻。
  每格都重新挑一次，所以后释放、但截止期更紧的作业可以**抢占**正在跑的作业。
- 挑不出来就跑空这一格。
- 一格跑完再看一遍：哪个作业的绝对截止期已经到点了（`deadline <= 当前时刻`）却还没跑完，
  记一次误期并把它**丢掉**（不再补跑），继续往下走。
- 返回值 `{ until, spans, idle, misses, stats }`：
  - `spans` 是有谁在跑的区间，`{ taskId, from, to }`，**相邻格子跑同一个作业要并成一段**；
  - `idle` 是没人可跑的区间，`{ from, to }`，同样相邻的要并；
  - `misses` 每条是 `{ taskId, release, deadline, missedAt, remaining }`
    （`missedAt` 是发现误期的那一刻，`remaining` 是丢掉时还剩多少没跑）；
  - `stats` 是 `{ ticks, busy, idle, missed }`：总格子数、跑着活的格子数、空着的格子数、误期次数。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | 配置不是对象、`tasks` 不是数组或者是空数组、某个任务不是对象、`id` 不是非空字符串、`id` 重复 |
| `ERR_BAD_TASK` | `period` / `cost` 不是正整数、`cost > period`；`hyperperiod` 收到的任务周期不合法 |
| `ERR_BAD_ARGS` | `until` 不是正整数、超过 `maxTicks`；`hyperperiod` 收到的不是数组或空数组 |

## API

```js
import { analyze, simulate, hyperperiod, DEFAULTS } from './lib/realtime.js';

const tasks = [
  { id: 'scan', period: 4, cost: 1 },
  { id: 'flush', period: 6, cost: 2 },
];

analyze({ tasks });        // -> { tasks, utilization: { num, den }, byTask, feasible, reason }
hyperperiod(tasks);        // -> 12
simulate({ tasks });       // -> { until, spans, idle, misses, stats }
simulate({ tasks, until: 6 });
DEFAULTS;                  // -> { maxTicks: 1000000 }
```

出错一律抛 `RealtimeError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的任务和时刻都是写死的，输出每一行都能对上：

```
realtime demo
  utilization {"num":5,"den":6}
  feasible true
  byTask ["scan:1/4","flush:1/3","ping:1/4"]
  hyperperiod 12
  spans scan[0,1) flush[1,3) ping[3,4) scan[4,5) ping[5,6) flush[6,8) ping[8,9) scan[9,10)
  idle [{"from":10,"to":12}]
  stats {"ticks":12,"busy":10,"idle":2,"missed":0}
  full-load {"num":1,"den":1}
  full-load-idle []
  overloaded {"num":5,"den":4}
  misses [{"taskId":"z","release":0,"deadline":4,"missedAt":4,"remaining":1},{"taskId":"z","release":4,"deadline":8,"missedAt":8,"remaining":1}]
```
