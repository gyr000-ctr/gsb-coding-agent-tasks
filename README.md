# rscodec

GF(256) 上的 Reed-Solomon 纠删码：把 k 个等长数据块编成 k 个数据块加 m 个校验块，丢了任意不超过 m 块
（数据块、校验块都算）还能把数据块补回来。只管「丢了」，不管「被改坏了」。只用 Node 标准库，`node >= 20`。

```
rscodec/
├── lib/
│   ├── rscodec.js   gfMul / gfDiv / gfPow / encode / decode         ← 还没实现
│   └── errors.js    RsCodecError 与错误码
├── test/            gf / codec 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 9 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### GF(256)

- 本原多项式固定 `0x11d`（x^8 + x^4 + x^3 + x^2 + 1），生成元 α = 2，也就是 `gfPow(2, 1) === 2`。
  所以 `gfPow(2, 8) === 0x1d`、`gfPow(2, 255) === 1`。
- `gfMul(a, b)`：有一边是 0 就是 0，其余按 `α^(log a + log b)` 查表；`gfMul(1, x) === x`。
- `gfDiv(a, b)`：`b` 是 0 直接抛 `ERR_BAD_ARGUMENT`；`a` 是 0 返回 0；其余按 `α^(log a - log b)` 算。
- `gfPow(base, power)`：`power` 是 0 返回 1（`gfPow(0, 0)` 也是 1）；`base` 是 0 返回 0；指数按 255 取模。
- 三个函数都收 0..255 的整数，别传别的；加减法就是异或。

### 编码

- `encode(data, { parity })`：`data` 是非空的 `Uint8Array` 数组，块长必须一致（长度 0 也行）。
  `parity` 是正整数。
- 返回 `data.length + parity` 个块：前 k 个是数据块的**拷贝**（改返回的数组不影响传进去的），
  后面 m 个是按下面这个矩阵算出来的校验块。
- 第 j 个校验块（j 从 0 数）的第 i 个数据块的系数是 `α^((j+1) * i)`，校验块就是
  `Σ 系数 * 数据块`（逐字节，乘是 `gfMul`，加是异或）。比如 k = 3、m = 3、数据块
  `[1,2,3,200] / [9,8,7,6] / [0,255,128,4]`，前两个校验块就是 `[19,201,55,212]` 和 `[37,105,247,144]`。

### 解码

- `decode(shards, { data, parity })`：`shards` 长度必须是 `data + parity`，丢了的位置写 `null`，
  其余位置是 `Uint8Array`（长度必须一致）。返回补好的 `data` 个数据块，**按原下标排好**；
  没丢的那几个也是拷贝。
- 缺的块数超过 `parity` 就抛 `ERR_TOO_MANY_ERASURES`（`details` 是 `{ missing, parity }`）——
  数据块、校验块一起算，比如 k = 3、m = 2 丢 3 块就是补不回来的。
- 缺的数据块是未知量，每个未知量用一条还在的校验块方程来解：把等式右边还在的数据块算出来，
  然后在 GF(256) 上做高斯消元。方程按位置从前往后取，取前 u 条还在的校验块（u 是缺的数据块个数，
  缺块不超过 m 时一定够用），所以同一组输入解出来的结果是唯一的。
- 数据块都在的时候，校验块对不对不归这里管：不会去验算，直接把它们拷回去。
- 只认 `null` 表示丢失；位置上的值被改坏了是查不出来的（这里不是校验和）。

### 出错的地方

| 错误码 | 什么时候抛 | `details` |
|---|---|---|
| `ERR_BAD_ARGUMENT` | `data` / `shards` 不是数组；块不是 `Uint8Array`；块长不一致；`parity` / `data` 不是正整数；`shards` 长度不等于 `data + parity`；`gfDiv` 除以 0 | `{ index }` / `{ index, expected, actual }` / `{ expected, actual }` / `{}` |
| `ERR_TOO_MANY_ERASURES` | 丢的块数超过 `parity` | `{ missing, parity }` |

## API

| 入口 | 说明 |
|---|---|
| `encode(data, { parity })` | 返回 k + m 个块，前 k 个是数据块的拷贝 |
| `decode(shards, { data, parity })` | `null` 表示丢失，返回补好的 k 个数据块 |
| `gfMul(a, b)` / `gfDiv(a, b)` / `gfPow(base, power)` | GF(256) 乘法 / 除法 / 乘方 |

## demo 跑出来应该长这样

```
rscodec demo
  alpha^8 29
  0x53*0xca 143
  0x53/0xca 109
  parity [[19,201,55,212],[37,105,247,144]]
  missing [0,4]
  rebuilt [[1,2,3,200],[9,8,7,6],[0,255,128,4]]
  data-gone [[1,2,3,200],[9,8,7,6],[0,255,128,4]]
  too-many ERR_TOO_MANY_ERASURES {"missing":3,"parity":2}
  bad-parity ERR_BAD_ARGUMENT {}
  bad-shard ERR_BAD_ARGUMENT {"index":1,"expected":2,"actual":3}
```
