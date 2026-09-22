# levelplan

LSM 存储的压缩计划器：按层打分决定先压哪一层、挑出要参与的文件、算出压完之后写多少、
墓碑什么时候能丢。只用 Node 标准库，没有第三方包，`node >= 20`。

```
levelplan/
├── lib/
│   ├── planner.js   createPlanner 本体                       ← 还没实现
│   ├── keys.js      键比较、区间相交、范围合并
│   └── errors.js    PlanError 与全部错误码
├── test/            config / score / plan 三组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 13 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 层和文件

- `levels[0]` 是最新的 L0，**文件之间可以随便重叠**；`levels[1]` 往上要求同层文件
  **按 `minKey` 升序摆放且两两不相交**（前一个的 `maxKey` 必须小于后一个的 `minKey`），
  否则报 `ERR_OVERLAP`。
- 每个文件写成 `{ id, size, minKey, maxKey, tombstones?, oldestSeq? }`：
  `size` 是正整数字节数，`minKey` / `maxKey` 非空且 `minKey <= maxKey`，
  `tombstones` 是非负整数（默认 0），`oldestSeq` 是可选数字（L0 排序用）。
  `id` 在整个 state 里唯一，重复报 `ERR_BAD_FILE`。
- `state` 写成 `{ levels: [[...], ...] }`，**层数必须正好等于配置的 `levelCount`**。

### 配置与容量

```js
const DEFAULTS = {
  levelCount: 4,
  l0TriggerFiles: 4,
  levelSizeBase: 4096,
  fanout: 4,
  targetFileSize: 1024,
  maxInputBytes: 8192,
  tombstoneBytes: 64,
};
```

- `levelCount` 是 2 ~ 8 的整数，其余都是正数，不合法报 `ERR_BAD_CONFIG`。
- 容量：L0 的容量是**文件个数** `l0TriggerFiles`，L1 是 `levelSizeBase` 字节，
  再往上每层乘一个 `fanout`：`capacity(i) = levelSizeBase × fanout^(i-1)`。

### 打分

`score(state)` 返回 `{ levels: [{ level, files, bytes, capacity, score }, ...] }`，按层号升序：

- L0：`score = 文件个数 / l0TriggerFiles`
- L1 往上：`score = 这层字节数 / capacity(level)`

`pick(state)` 返回**分数大于 1 的最高那层**的层号；分数一样时取层号小的；
**最底层不参与挑选**（它没有下一层可压）；一个都不超就返回 `null`。

### 一个压缩任务长什么样

```js
{
  level: 1,                 // 从哪层压
  reason: 'level-bytes',    // L0 按文件数触发就是 'l0-files'
  score: 1.465,             // 保留三位小数
  inputs: { from: ['g1'], to: ['h1'] },
  inputBytes: 4048,
  outputBytes: 4048,
  outputFiles: 4,
  droppedTombstones: 0,
  writeAmplification: 1,
}
```

- **L0 的任务**：`from` 取 L0 全部文件，按 `oldestSeq` 升序（缺省或并列时按 `id` 升序）
  从旧到新往里加，**累计体积不超过 `maxInputBytes`**（放不下就停，至少留一个文件）；
  `to` 取下一层里所有与这些文件**合并后的键范围**相交的文件，按该层顺序给出。
- **L1 往上的任务**：`from` 只取该层最左边（按 `minKey` 排序的第一个）那个文件；
  `to` 取下一层里和它的键范围相交的文件；如果 `to` 的体积超过 `maxInputBytes`，
  就只保留其中**体积最小**的那一个（体积相同按 `minKey`、再按 `id`）。
- 区间相交按闭区间算：`left.minKey <= right.maxKey && right.minKey <= left.maxKey`。
- `plan(state)` 把每一层独立算一遍，**不会模拟"上一层压完"之后的样子**，
  返回的任务按层号升序，每层最多一个。

### 墓碑和写放大

- **只有 `level + 1` 正好是最底层时**才丢墓碑：`droppedTombstones` 是这些输入文件的墓碑总数。
- 丢墓碑时按文件算：`max(0, size - tombstones × tombstoneBytes)`；不丢墓碑的层原样计入 `size`。
- `outputBytes` 是上面加出来的总和，`outputFiles = ceil(outputBytes / targetFileSize)`
  （0 字节就是 0 个文件）。
- `writeAmplification = outputBytes / inputBytes`，`plan` 顶层的那个是
  `totalOutputBytes / totalInputBytes`（没有任务就是 0）。两者都保留三位小数。
- 最底层自己不会产生任务（没有下一层），但它的 `score` 照常算出来。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `levelCount` 不在 2~8、其余配置不是正数 |
| `ERR_BAD_STATE` | state 不是对象、`levels` 不是数组、层数不等于 `levelCount`、某一层不是数组 |
| `ERR_BAD_FILE` | 文件不是对象、`id` 为空或重复、`size` 不是正整数、键为空、`minKey > maxKey`、`tombstones` / `oldestSeq` 类型不对 |
| `ERR_OVERLAP` | L1 往上没有按 `minKey` 升序摆，或者同层文件范围有交集 |

## API

```js
import { createPlanner, DEFAULTS } from './lib/planner.js';

const planner = createPlanner({ levelCount: 4, levelSizeBase: 4096, fanout: 4 });

planner.capacity(2);        // -> 16384
planner.options;            // -> 生效的配置
planner.score(state);       // -> { levels: [{ level, files, bytes, capacity, score }] }
planner.pick(state);        // -> 层号，或者 null
planner.plan(state);        // -> { jobs, totalInputBytes, totalOutputBytes, totalDroppedTombstones, writeAmplification }
```

出错一律抛 `PlanError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的 state 和配置都是写死的，输出每一行都能对上：

```
levelplan demo
[1] 各层打分
    L0 files=5 bytes=1500 capacity=4 score=1.25
    L1 files=3 bytes=6000 capacity=4096 score=1.465
    L2 files=1 bytes=2048 capacity=16384 score=0.125
    L3 files=0 bytes=0 capacity=65536 score=0
[2] 该压哪一层
    先压 L1
[3] L0 的任务：按 oldestSeq 从旧到新，带上下层所有相交文件
    from=f5,f3,f1,f2,f4 to=g1,g2,g3
    inputBytes=7500 outputBytes=7500 outputFiles=8
[4] 只有压到最底层才丢墓碑
    droppedTombstones=5 inputBytes=1000 outputBytes=750
    writeAmplification=0.75
    同一批文件压在中间层：droppedTombstones=0 outputBytes=1000
[5] 一次把所有该压的都列出来
    jobs=L0(l0-files) L1(level-bytes)
    totalInputBytes=11548 totalOutputBytes=11548 writeAmplification=1
```
