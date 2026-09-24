# hllset

HyperLogLog 基数估计：一份寄存器用稀疏 / 稠密两种表示来存，支持合并与估计。
只用 Node 标准库（哈希用 `node:crypto` 的 SHA-256），`node >= 20`。

```
hllset/
├── lib/
│   ├── hllset.js   createHll / Hll 的增、估、合并、表示       ← 还没实现
│   └── errors.js   HllError 与错误码
├── test/           basic / merge 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json    npm test / npm run demo
```

```
npm test        # 13 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 哈希与寄存器

一个值先按 UTF-8 码成字节，取 **SHA-256 的前 8 个字节**，当成一个 64 位无符号整数（大端，
第一个字节是最高位）。这 64 位这样分：

- **高 `precision` 位是桶号**，取值 `0 .. 2^precision - 1`；
- 剩下的 `64 - precision` 位**从高位往低位**看，第一个 `1` 落在第几位（1 基）就是这次要往桶里
  写的位置数；一位都没有（全是 0）就是 `64 - precision + 1`。

桶里只留见过的**最大值**，所以同一个值加几遍、或者后来加了个落同一个桶但位置数更小的值，
寄存器都不会变。

### 两种表示

- **稀疏**：只存非 0 的桶，`(桶号, 位置数)` 成对；桶号升序、同一桶只有一条。
- 非 0 桶的个数**超过 `sparseLimit`**（默认 3000）的那一刻就换成**稠密**：长度 `2^precision` 的
  `Uint8Array`，下标就是桶号。换过去之后**不会再退回稀疏**（哪怕后来合并进来的东西很少）。
- `representation()` 报当前是哪一种（`'sparse'` / `'dense'`）；`registers()` 不管当前是哪种表示，
  都吐一个**长度 `2^precision` 的新 `Uint8Array`**（稠密视图，稀疏时把非 0 的位置填进去）。

### 增、估、合

- `add(value)`：`value` 是字符串；**寄存器被改大了返回 1**，否则返回 0（包括同一个值加第二遍）。
- `count()`：估计基数，返回四舍五入后的整数。`m = 2^precision`，`M_j` 是第 `j` 个寄存器：

  - 原始估计 `E = alpha * m * m / Σ 2^(-M_j)`；`m < 128` 时 `alpha` 取 `0.673`（m=16）/ `0.697`
    （m=32）/ `0.709`（m=64），否则 `alpha = 0.7213 / (1 + 1.079 / m)`；
  - 如果 `E <= 2.5 * m` 而且还有 0 寄存器（记个数 `V`），换成线性计数 `E = m * ln(m / V)`；
  - 如果 `E > 2^64 / 30`，换成 `E = -2^64 * ln(1 - E / 2^64)`。

- `merge(other)`：**就地**把另一份并进来，逐桶取大（不是相加）。返回 1 表示有寄存器被改大，
  0 表示一点没变。两边的 `precision` 不一样就是 `ERR_PRECISION_MISMATCH`。
- `clone()`：拿一份独立的副本，之后两边互不影响。

### 出错的地方

| 错误码 | 什么时候抛 |
|---|---|
| `ERR_BAD_ARGUMENT` | `createHll` 的 `options` 不是对象、`sparseLimit` 不是 ≥ 0 的整数、`add` 的值不是字符串、`merge` 传进来的不是 `Hll` |
| `ERR_BAD_PRECISION` | `precision` 不是 4 到 18 之间的整数（`3`、`19`、`4.5`、`'14'`……） |
| `ERR_PRECISION_MISMATCH` | `merge` 两边 `precision` 不同 |

## API

| 入口 | 说明 |
|---|---|
| `createHll({ precision = 14, sparseLimit = 3000 })` | 建一份空的；`precision` 走 4..18 |
| `add(value)` | 加一个值，寄存器变大 1 / 没变 0 |
| `count()` | 基数估计（四舍五入的整数） |
| `registers()` | 长度 `2^precision` 的 `Uint8Array`（拷贝） |
| `representation()` | `'sparse'` 或 `'dense'` |
| `merge(other)` | 就地合并，变化 1 / 没变 0 |
| `clone()` | 独立副本 |
| `hashOf(value, precision)` | 口径里的哈希：返回 `{ bucket, rank }`（用例会拿它核对落位） |

## demo 跑出来应该长这样

```
hllset demo
  empty.count 0
  empty.form sparse
  add.alpha 1
  add.alpha.again 0
  users.count 9921
  users.form dense
  other.count 9876
  merge.changed 1
  merged.count 14820
  merged.form dense
  tiny.form sparse
  tiny.formAfter dense
  tiny.count 404
  mismatch.code ERR_PRECISION_MISMATCH
  badValue.code ERR_BAD_ARGUMENT
```