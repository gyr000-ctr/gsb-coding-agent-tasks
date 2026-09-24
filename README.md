# listdiff

键控列表的 diff 与回放：给两组带 key 的列表，算出一串增删改挪的操作；挪位置的那批要尽量少挪。
只用 Node 标准库，`node >= 20`。

```
listdiff/
├── lib/
│   ├── listdiff.js  diffLists / applyOps                        ← 还没实现
│   └── errors.js    ListDiffError 与错误码
├── test/            diff / apply 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 13 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 列表与 key

- `prev` / `next` 是数组，元素是对象。取 key 的规则由 `options.key` 决定：不写默认按 `'id'` 取，
  也可以给别的字段名，或者给一个 `(item) => key` 的函数。
- key 只能是**非空字符串**或者**有限数字**。取不到（`undefined` / `null` / 空串 / 对象 / 数组 / `NaN` / `Infinity`）
  就是 `ERR_BAD_ARGUMENT`，`details` 是 `{ index, side }`。
- 同一侧里 key 重复是 `ERR_DUPLICATE_KEY`，`details` 是 `{ key, side }`。两侧各自查，prev 和 next 之间随便重。

### 操作流

`diffLists(prev, next, options)` 返回一个操作数组，顺序固定这么四段：

1. `{ op: 'remove', key, index }`：prev 里有、next 里没有的，按 prev 里的先后顺序。`index` 是它在
   **当前列表**里的位置（前面的操作都做完之后的位置）。
2. `{ op: 'insert', key, item, index }`：next 里有、prev 里没有的，按 next 里的先后顺序；`item` 是 next 里那条。
   插入位置 = 它在 next 里的**前一条**现在的位置再加一；它要是 next 的第一条就插到 0。
3. `{ op: 'update', key, from, to }`：两边都在、但 `JSON.stringify` 出来不一样的一条（一样就不出），
   按 next 里的先后顺序。`from` / `to` 是两边那条 item。
4. `{ op: 'move', key, from, to }`：见下。`from` 是它现在的位置；`to` 是**把它摘出来之后**要插回去的位置。

一条操作都没有就返回空数组（比如两边内容完全一样）。

### 挪位置

- 先把增删做完，剩下的按 key 在 next 里的位置（记作目标位置）看一遍：**已经在正确相对顺序上的那批不动**，
  也就是目标位置序列的最长递增子序列（LIS）。LIS 用耐心排序求：从左往右扫，`tails[k]` 存长度为 `k+1` 的
  递增子序列里结尾最小的那个元素的下标，每次拿二分找第一个 `>=` 当前目标位置（相等也替换）的槽位放进去；
  要挑具体是哪几个时，从 `tails` 最后一个槽位（最长那一档）顺着前驱往回走。
- 其余那些按目标位置从小到大挪：摘出来以后，看当前列表里**最后一个目标位置比它小的**在哪儿，就插在它后面；
  前面没有就插到 0 表示队首。
- 这么挪的条数正好是「列表长度减 LIS 长度」，也就是这个模型下的最少挪动数；不会有 `from` 和 `to` 一样的白挪。

### 回放

`applyOps(list, ops, options)` 按顺序把操作走一遍，返回**新数组**（原数组不动，里面的 item 也不动）：

- `insert`：`op.index` 得是 `0..list.length` 的整数，直接插。
- `remove` / `move`：`op.index`（move 是 `op.from`）必须正好是那条 key 现在的位置，对不上就报错。
- `update`：把 key 那条换成 `op.to`。
- 走不动就抛 `ERR_BAD_OPERATION`：key 找不到、位置对不上、插入位置越界、不认识的 `op`、操作不是对象。
  `details` 里带 `{ key }`；不认识的 op 带 `{ op }`。

### 出错的地方

| 错误码 | 什么时候抛 | `details` |
|---|---|---|
| `ERR_BAD_ARGUMENT` | `prev` / `next` / `list` / `ops` 不是数组；`options.key` 既不是非空字符串也不是函数；某条 item 取不到能用的 key | `{ index, side }` 或 `{}` |
| `ERR_DUPLICATE_KEY` | 同一侧里 key 重复 | `{ key, side }` |
| `ERR_BAD_OPERATION` | 回放时 key 找不到、index 对不上、插入越界、op 不认识 | `{ key }` 或 `{ op }` |

## API

| 入口 | 说明 |
|---|---|
| `diffLists(prev, next, { key = 'id' })` | 返回操作数组 |
| `applyOps(list, ops, { key = 'id' })` | 回放，返回新数组 |

## demo 跑出来应该长这样

```
listdiff demo
  ops [{"op":"remove","key":"b","index":1},{"op":"insert","key":"e","item":{"id":"e","title":"E","pinned":false},"index":1},{"op":"update","key":"c","from":{"id":"c","title":"C","pinned":false},"to":{"id":"c","title":"C","pinned":true}},{"op":"update","key":"a","from":{"id":"a","title":"A","pinned":false},"to":{"id":"a","title":"A2","pinned":false}},{"op":"move","key":"c","from":2,"to":0}]
  count {"remove":1,"insert":1,"update":2,"move":1}
  applied [{"id":"c","title":"C","pinned":true},{"id":"a","title":"A2","pinned":false},{"id":"e","title":"E","pinned":false},{"id":"d","title":"D","pinned":false}]
  reorder [{"op":"move","key":"a","from":0,"to":1},{"op":"move","key":"c","from":2,"to":3}]
  noop []
  dup-key ERR_DUPLICATE_KEY {"key":"a","side":"prev"}
  bad-op ERR_BAD_OPERATION {"key":"b"}
  no-key ERR_BAD_ARGUMENT {"index":0,"side":"prev"}
```
