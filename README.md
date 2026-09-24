# binpack

确定性装箱：把一堆有重量的小件塞进容量固定的箱子，四种经典挑箱策略，同一份输入跑几遍结果都一样。
只用 Node 标准库，`node >= 20`。

```
binpack/
├── lib/
│   ├── binpack.js  packBins   ← 还没实现
│   └── errors.js   PackError 与错误码
├── test/           pack / edge 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json    npm test / npm run demo
```

```
npm test        # 11 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 入参与出参

- `packBins(items, { capacity, algorithm = 'first-fit', maxBins = null })`。
- `items` 是数组，每项 `{ id, weight }`：`id` 是非空字符串、不许重复，`weight` 是 1..`capacity` 的整数。
- `capacity` 是正整数；`maxBins` 要么不给，要么是不小于 1 的整数。
- 返回 `{ bins, unplaced }`。`bins` 里每项是 `{ index, used, items }`：`index` 从 0 往上连着来，
  `used` 是这箱已占的重量，`items` 是按放进去的先后排好的 id 列表。`unplaced` 是没塞进去的 id 列表。

### 怎么挑箱子

- 件按顺序来、一件一件放。放的时候在下标 0.. 的箱子里挑一个「剩余 `capacity - used` 不小于 `weight`」的：
  `first-fit` 取第一个；`best-fit` 取放进去剩得最少的；`worst-fit` 取放进去剩得最多的。两个箱子剩余一样时，
  三者都取下标小的那个。
- 一个现成的箱子都放不下，才开新箱（新箱下标就是当前箱数，`used` 从 0 起）。
- `best-fit-decreasing` 先把件按 `weight` 从大到小排一遍（一样重的保持原来的先后），再走 `best-fit`；
  别的算法不排序。
- `maxBins` 卡箱数：已经开了 `maxBins` 个箱子又放不下时，这件进 `unplaced`，后面的件接着来。
  箱子开出来就不会变空，所以 `bins` 里没有空箱。

### 出错的地方

| 错误码 | 什么时候抛 | `details` |
|---|---|---|
| `ERR_BAD_ARGUMENT` | `options` 不是对象；`capacity` 不是正整数；`maxBins` 给了但不是正整数；`items` 不是数组；某件不是对象、`id` 不是非空字符串、`id` 重复、`weight` 不是 1..`capacity` 的整数（比容量还重也算这里） | 比容量重那条带 `{ capacity }`，`id` 重复那条带 `{ id }`，其余是 `{}` |
| `ERR_BAD_ALGORITHM` | `algorithm` 不在 `first-fit` / `best-fit` / `worst-fit` / `best-fit-decreasing` 里 | `{ algorithm }` |

## API

| 入口 | 说明 |
|---|---|
| `packBins(items, options = {})` | 装一遍，返回 `{ bins, unplaced }` |

## demo 跑出来应该长这样

```
binpack demo
  first-fit [[[0,10,["a","b","d","e"]],[1,7,["c"]]],[]]
  best-fit [[[0,7,["a","b","e"]],[1,10,["c","d"]]],[]]
  worst-fit [[[0,9,["a","b","d"]],[1,8,["c","e"]]],[]]
  first-fit-bins 4
  best-fit-decreasing [[[0,10,["v","p"]],[1,10,["s","u"]],[2,10,["q","r","t"]]],[]]
  best-fit-decreasing-bins 3
  max-2 [[[0,8,["p","q","t"]],[1,7,["r","u"]]],["s","v"]]
  empty [[],[]]
  too-heavy ERR_BAD_ARGUMENT {"capacity":4}
  bad-algorithm ERR_BAD_ALGORITHM {"algorithm":"next-fit"}
  bad-item ERR_BAD_ARGUMENT {"capacity":4}
```
