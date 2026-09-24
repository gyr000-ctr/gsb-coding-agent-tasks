# regexpx

回溯正则引擎：把模式解析成语法树，再按「最左优先 + 贪婪优先」的顺序回溯着试。
只支持一小撮语法（下面《口径》里列了），只用 Node 标准库，`node >= 20`。

```
regexpx/
├── lib/
│   ├── regexpx.js   compile 与 exec / test                    ← 还没实现
│   └── errors.js    RegexError 与错误码
├── test/            engine / edge 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 12 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 支持的语法

| 写法 | 意思 |
|---|---|
| `abc` | 字面字符（按 UTF-16 码元一个算一个，不做 Unicode 折叠） |
| `.` | 任意**一个**字符，**不吃 `\n`** |
| `^` / `$` | 整串的开头 / 结尾（没有多行模式，`$` 不是「行尾」） |
| `[abc]` `[a-f]` `[^abc]` | 字符类：范围、取反；**`]` 或 `[^]` 收尾就立刻闭合**，所以 `[]` 是「配不上任何字符」的空类、`[^]` 是「配得上任意字符（连 `\n` 也算）」；类里的 `]` 要写 `\]` |
| `\d` `\D` `\w` `\W` `\s` `\S` | 简写类：`\d` 是 `0-9`、`\w` 是 `A-Za-z0-9_`、`\s` 是空格 `\t\n\r\f\v`；大写是取反。类里也能用 |
| `\n` `\t` `\r` `\f` `\v`，`\*` `\.` `\\` `\[` …… | 转义 |
| `(...)` | 捕获组，编号按**左括号出现的顺序**从 1 开始（`(?:...)` 不占号） |
| `(?:...)` | 不捕获的组 |
| `a|b|c` | 交替，**从左往右**试；分支可以是空的（`a|` 合法） |
| `*` `+` `?` `{n}` `{n,}` `{n,m}` | 量词；后面再跟一个 `?` 就是非贪婪（`*?` `+?` `??` `{n,m}?`） |
| `\1` … `\9` | 反向引用，可以引后面才出现的组，但编号不能超过整个模式里捕获组的总数 |

别的都是错的：`{` 只有当它能读成 `{n}` / `{n,}` / `{n,m}` 时才是量词，否则报错（不当字面字符）；
量词叠加（`a**`）、量词前面没东西（`*a`）、括号 / 字符类不闭合、`[z-a]` / `[\d-x]` 这种坏范围、
不认识的转义（`\q`、`\0`）、引用到不存在的组，全都是 `ERR_BAD_PATTERN`。

### 匹配语义

- **最左优先**：没锚定时从下标 0、1、2 …… 依次试着起配，第一个配上的起点就是结果。
- **回溯顺序**：交替从左往右挑；量词贪婪的先把能重复的都吃掉再吐回来，非贪婪的反过来；
  所以 `a|ab` 配 `"ab"` 得到 `"a"`，`<.*>` 配 `"<a><b>"` 得到整串，`<.*?>` 只得到 `"<a>"`。
- `exec(input)` 返回 `{ index, match, groups }`：`index` 是起点、`match` 是整段、`groups` 是**第 1 个到
  第 N 个捕获组**（没参与匹配的组是 `undefined`，所以 `(a)(b)?c` 配 `"ac"` 的 `groups` 是
  `['a', undefined]`）。配不上返回 `null`。
- 反向引用指向一个没参与匹配的组时，**这条分支就配不上**（不报错，继续回溯）。
- `test(input)` 就是 `exec(input) !== null`。`compile` 出来的是**无状态**的，同一个对象反复 `exec`
  互不影响；`source` 是原模式、`groupCount` 是捕获组个数。
- 空模式配空串（`index` 0、`match` `''`）。

### 步数预算

`compile(pattern, { maxSteps = 100000 })`。回溯的时候每走一步都算一步，超了立刻抛
`ERR_STEPS_EXCEEDED`（这就是防灾难性回溯的那道闸）。步数怎么数自己定，但**正常模式不许误报**、
真爆掉的必须被拦住。`maxSteps` 不是正整数是 `ERR_BAD_ARGUMENT`。

### 出错的地方

| 错误码 | 什么时候抛 |
|---|---|
| `ERR_BAD_ARGUMENT` | `pattern` / `input` 不是字符串、`options` 不是对象、`maxSteps` 不是正整数 |
| `ERR_BAD_PATTERN` | 语法错（见上）、括号 / 字符类不闭合、量词位置不对或叠加、坏范围、不认识的转义、反向引用编号越界 |
| `ERR_STEPS_EXCEEDED` | 回溯超过 `maxSteps` |

## API

| 入口 | 说明 |
|---|---|
| `compile(pattern, { maxSteps = 100000 })` | 解析模式，返回 `{ source, groupCount, exec, test }` |
| `exec(input)` | `{ index, match, groups }` 或 `null` |
| `test(input)` | 布尔 |

## demo 跑出来应该长这样

```
regexpx demo
  literal {"index":2,"match":"abc","groups":[]}
  anchored {"index":0,"match":"abc_1","groups":[]}
  class {"index":2,"match":"a1b2","groups":[]}
  greedy {"index":0,"match":"<a><b>","groups":[]}
  lazy {"index":0,"match":"<a>","groups":[]}
  groups {"index":1,"match":"key=42","groups":["key","42"]}
  backref {"index":1,"match":"bb","groups":["b"]}
  alternation {"index":2,"match":"dog","groups":[]}
  nomatch null
  test true
  groupCount 2
  badPattern.code ERR_BAD_PATTERN
  blowup.code ERR_STEPS_EXCEEDED
```