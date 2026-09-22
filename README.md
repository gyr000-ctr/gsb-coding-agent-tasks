# sheetcalc

表格公式引擎：解析公式、维护依赖图、增量重算、循环引用标成 `#CYCLE!`、错误值一路往外传。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
sheetcalc/
├── lib/
│   ├── engine.js    createEngine 本体                        ← 还没实现
│   ├── cells.js     A1 记法解析、格式化、范围展开
│   └── errors.js    SheetError 与全部错误码
├── test/            formula / recalc 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 14 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 格子里的东西

值只有这几种：数字、字符串、布尔、空（`null`），以及六个错误值
`#DIV/0!` / `#VALUE!` / `#NAME?` / `#REF!` / `#CYCLE!` / `#ERROR!`。

- 初始 `sheets` 写成 `{ 表名: { A1: 值 } }`，单元格的写法是 `A1` 或者 `Sheet2!A1`，
  `$` 会被忽略（`$B$2` 就是 `B2`）。不是合法单元格报 `ERR_BAD_REF`。
- 普通值：`2` 就是数字，`"x"` 是字符串，`TRUE` / `FALSE` 是布尔，空串当空。
  字符串形式的数字（`'5'`）会按数字收；`'=...'` 是公式。
- 公式解不开（少括号、少逗号、莫名其妙的符号）→ 这格是 `#ERROR!`，**不是抛异常**。

### 公式语法

- 一元：`+` `-`；二元：`+ - * / ^`、连接 `&`、比较 `= <> < <= > >=`；括号随意套。
- 优先级从松到紧：比较 < `&` < `+ -` < `* /` < 一元负号 < `^`；`^` 右结合。
  所以 `2^3^2 = 512`，`-2^2 = -4`。
- 比较时先按类型分档：**数字 < 文本 < 布尔**，同档比大小 / 字典序 / 真假；
  空格子按对面那一档的零值算（`Z9+1 = 1`，`Z9&"x" = "x"`）。
- 字符串字面量用双引号，里面要写双引号就写两个（`"a""b"` 是 `a"b`）。
- 引用可以跨表：`Sheet2!A1`；引用不存在的表 → `#REF!`；引用没写过内容的格子 → 空。
- 范围 `A1:B3` **只能当函数参数**（展开是行优先的闭区间），直接当值用 → `#VALUE!`。

### 函数

`SUM` / `MIN` / `MAX` / `COUNT` / `IF` / `ROUND` / `ABS` / `AND` / `OR` / `NOT` / `LEN`，
别的名字 → `#NAME?`。

- `SUM` / `MIN` / `MAX`：范围里的文本和空格子**跳过**，直接传进来的参数必须能转成数字
  （`SUM("x")` → `#VALUE!`）；一个数字都没有时 `MIN` / `MAX` 给 0。
- `COUNT`：数能算成数字的个数（范围里只数真正的数字）。
- `IF(条件, 真值, 假值?)`：**只算走到的那个分支**，所以 `IF(FALSE,1/0,5)` 是 5；
  参数个数不是 2 或 3 个 → `#VALUE!`；条件本身是错误值就直接往外传。
- `ROUND(数字, 位数)`：位数必须是整数，负数表示往十位、百位取整；`ABS` / `NOT` / `LEN` 只要一个参数。
- `AND` / `OR`：至少一个参数，参数按真值规则转（数字非 0 为真、空串为假、非空文本为真）。
- 转换口径：算术和 `SUM` 这类要求数字的地方，布尔按 1/0、空格子按 0、数字字符串按数字，
  其他文本 → `#VALUE!`；除零 → `#DIV/0!`。**任何参数是错误值，结果就是这个错误值**
  （`IF` 的未走分支不算参数）。

### 依赖与重算

- `set(target, source)` 把某格改成新内容，返回
  `{ changed, values, evaluated }`：`changed` 是**值真的变了**的格子（按键名排序），
  `values` 是这些格子现在的新值，`evaluated` 是这一轮参与的格子数。
- 只有"这个格子 + 所有直接间接依赖它的格子"会被重算；范围依赖按展开后的每一格算，
  范围外的格子不动。`stats().lastEvaluated` 就是最近一次重算的格子数。
- 依赖表按最新的公式重建，所以把公式改成常量、或者常量改成公式，下游都会跟着更新。
- **循环引用**：环上的格子以及依赖它们的格子都是 `#CYCLE!`（`A1=B1+1`、`B1=A1+1` 这种），
  把环里任意一格改成常量或改到不依赖环上，链上就会重新算出正常值。
- `evaluate()` 全量重算一遍，返回结构和 `set` 一样（没有变化时 `changed` 是空数组）。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `createEngine` 收到的不是对象、`sheets` 不是 `{ 表名: { A1: 值 } }` |
| `ERR_BAD_REF` | `get` / `set` 的目标不是 `A1` 或 `Sheet!A1`（表名为空也算） |
| `ERR_UNKNOWN_SHEET` | `get` 的表在 `sheets()` 里不存在（`set` 会自动建新表） |

公式层面的错误（`#NAME?`、`#REF!`、`#VALUE!` 这些）是**值**，不抛异常。

## API

```js
import { createEngine, ERROR_VALUES, FUNCTIONS } from './lib/engine.js';

const engine = createEngine({
  sheets: { Sheet1: { A1: 2, B1: '=A1*3' }, Sheet2: { A1: '=Sheet1!B1+1' } },
});

engine.get('Sheet1!B1');            // -> 6（不写表名就用第一张表）
engine.set('Sheet1!A1', 5);         // -> { changed, values, evaluated }
engine.values();                    // -> { 'Sheet1!A1': 5, ... }（按键名排序）
engine.evaluate();                  // -> 全量重算，结构同上
engine.stats();                     // -> { cells, lastEvaluated }
engine.sheets();                    // -> ['Sheet1', 'Sheet2']
engine.keys();                      // -> 所有格子，按键名排序
```

出错一律抛 `SheetError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的表都是写死的，输出每一行都能对上：

```
sheetcalc demo
[1] 一个中规中矩的表
    B1=14 B2=9 B3=big
[2] 错误值会一路往外传
    C1=#DIV/0! C2=#DIV/0!
[3] 跨表引用
    Sheet2!A1=90
[4] 改一格只重算受影响的
    changed=Sheet1!A2,Sheet1!B1,Sheet1!B2,Sheet2!A1 evaluated=7
    Sheet2!A1 现在是 160
[5] 绕成环的整条链都是 #CYCLE!
    D1=#CYCLE! E1=#CYCLE!
    把 D1 改成常量之后 E1=2
```
