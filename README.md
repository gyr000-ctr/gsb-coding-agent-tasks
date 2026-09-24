# timewheel

分层时间轮：`levels` 层，每层 `wheelSize` 个格子，第 L 层一个格子盖 `tickMs * wheelSize^L` 毫秒；
时间往前走的时候，粗层里的定时器会被重新铺到细层里（级联）。时钟是虚拟的，只有 `advance` 会让它走。
只用 Node 标准库，`node >= 20`。

```
timewheel/
├── lib/
│   ├── timewheel.js  createWheel 与 schedule / cancel / advance / stats   ← 还没实现
│   └── errors.js     WheelError 与错误码
├── test/             wheel / oracle 两组用例
├── scripts/demo.mjs  手工过一遍的演示脚本
└── package.json      npm test / npm run demo
```

```
npm test        # 9 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 轮子长什么样

- `createWheel({ tickMs = 1, wheelSize = 8, levels = 3 })`：`tickMs` 是正整数，`wheelSize` 和 `levels` 是
  不小于 2 的整数（`levels` 至少两层，否则算不上分层）。
- 第 L 层（L 从 0 数）一个格子盖 `slotMs(L) = tickMs * wheelSize^L` 毫秒，整层跨度
  `spanMs(L) = slotMs(L) * wheelSize`。最远能排 `maxDelay = spanMs(levels - 1)` 毫秒，
  默认就是 `1 * 8^3 = 512`。
- 时钟从 0 开始，只有 `advance` 会把它往前推，返回推进之后的 `now`。

### 排进去

- `schedule(deadline, task)`：`deadline` 是整数毫秒，必须**大于**当前时间，否则 `ERR_DEADLINE_PAST`
  （`details` 是 `{ now }`）。离现在超过 `maxDelay` 是 `ERR_DEADLINE_TOO_FAR`（`details` 是 `{ delay, maxDelay }`）。
  `task` 必须是函数。返回一个从 1 开始递增的 id。
- `scheduleIn(delay, task)`：延迟多少毫秒，`delay` 是非负整数，也就是 `schedule(now + delay, task)`；
  所以 `delay` 可以等于 0（那条记录 deadline 就等于当前时间）。
- 落在哪一层、哪个格子：`delay = deadline - now`，取**最小的** L 让 `delay < spanMs(L)`（都不满足就用最顶层），
  格子号是 `floor(deadline / slotMs(L)) % wheelSize`。所以还差 7 毫秒的在第 0 层、差 8 毫秒的在第 1 层、
  差 64 毫秒的在第 2 层（默认参数下）。

### 时间往前走

- `advance(ms)`：非负整数毫秒。先把 `now` 加上去，然后把所有 `deadline <= now` 的按顺序跑掉：
  先比 `deadline`，一样就看排进来的先后。跑的过程中新排进来的记录如果也已经到点（比如任务里
  `scheduleIn(0, ...)`），这一趟接着把它跑掉，顺序还是排在后面。
- 跑完把还剩下的所有记录按「离现在还有多久」重新铺一遍 —— 这就是级联：差 70 毫秒的先在第 2 层，
  往前走到还剩 60 毫秒时落到第 1 层，剩 5 毫秒时落到第 0 层。
- `cancel(id)`：还在的删掉返回 `true`，找不到（包括已经跑过的）返回 `false`。
- `nextDeadline()`：还剩下的里面最小的 deadline，一条都没有就是 `null`。
- `stats()`：`{ now, timers, levels: [{ index, slotMs, spanMs, timers, slots }] }`，`timers` 是这层有几条，
  `slots` 是这层每个格子里各几条（长度就是 `wheelSize`）。

### 出错的地方

| 错误码 | 什么时候抛 | `details` |
|---|---|---|
| `ERR_BAD_ARGUMENT` | `createWheel` 的参数不是对象 / `tickMs` / `wheelSize` / `levels` 不合法；`schedule` 的 `deadline` 不是整数、`scheduleIn` 的延迟不是非负整数、`task` 不是函数、`advance` 的毫秒数不是非负整数 | `{}` |
| `ERR_DEADLINE_PAST` | `schedule` 给的 `deadline` 不大于当前时间 | `{ now }` |
| `ERR_DEADLINE_TOO_FAR` | 离现在超过 `maxDelay` | `{ delay, maxDelay }` |

## API

| 入口 | 说明 |
|---|---|
| `createWheel({ tickMs = 1, wheelSize = 8, levels = 3 })` | 建轮子 |
| `schedule(deadline, task)` | 按绝对时间排，返回 id |
| `scheduleIn(delay, task)` | 按延迟排，返回 id |
| `cancel(id)` | 删掉，返回 boolean |
| `advance(ms)` | 时钟往前走，跑到期的，返回新的 now |
| `now()` | 当前时间 |
| `nextDeadline()` | 下一班时间，没有就是 null |
| `stats()` | 快照 |

## demo 跑出来应该长这样

```
timewheel demo
  levels [3,0,2]
  next 1
  at-1 ["1@1"]
  at-5 ["1@1","5@5","5@5"]
  cascade [[0,[0,0,0,0,0,0,0,0]],[0,[0,0,0,0,0,0,0,0]],[2,[1,1,0,0,0,0,0,0]]]
  cancel true
  pending 1
  at-75 ["1@1","5@5","5@5"]
  at-512 ["1@1","5@5","5@5","512@512"]
  pending-end 0
  past ERR_DEADLINE_PAST {"now":512}
  too-far ERR_DEADLINE_TOO_FAR {"delay":513,"maxDelay":512}
  bad-delay ERR_BAD_ARGUMENT {}
```
