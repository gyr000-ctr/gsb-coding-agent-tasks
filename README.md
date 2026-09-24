# selmatch

一个不依赖浏览器的 CSS 选择器引擎：把选择器文本解析成 AST，再按优先级和组合子去一棵普通的节点树上找节点。
只用 Node 标准库，`node >= 20`。DOM 就是普通对象，自己实现，不引第三方包。

```
selmatch/
├── lib/
│   ├── selmatch.js  parse / queryAll                             ← 还没实现
│   └── errors.js    SelectorError 与错误码
├── test/            parse / match 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 11 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 节点长什么样

- 元素节点：`{ tag: 'div', attrs: { id: 'x', class: 'a b', 'data-k': '1' }, children: [...] }`。
  `tag` 是字符串就算元素；`children` 缺省当空数组。
- 文本或者别的节点：没有 `tag` 字段的对象，一律当空气 —— 匹配时跳过，也不参与兄弟计数。
- `attrs` 里的键按不区分大小写找（选择器解析时属性名已经统一小写），`id` 一样。

### 支持哪些选择器

| 类 | 写法 |
|---|---|
| 类型 / 通配 | `div`、`*`（两者都只出现在复合选择器最前面） |
| 类 / id | `.a.b`、`#x`（一个复合选择器里 id 最多一个） |
| 属性 | `[a]`、`[a=v]`、`[a~=v]`、`[a^=v]`、`[a$=v]`、`[a*=v]`、`[a\|=v]` |
| 伪类 | `:first-child`、`:last-child`、`:nth-child(...)`、`:nth-of-type(...)`、`:not(一个复合选择器)` |
| 组合子 | 空白（后代）、`>`、`+`、`~` |
| 列表 | `,` |

不支持的（一律 `ERR_BAD_SELECTOR`）：伪元素、`:hover` 之类状态伪类、`\` 转义、`:not()` 里放组合子或逗号、
选择器里出现别的字符。`nth` 的表达式支持 `odd`、`even`、`3`、`n`、`2n`、`-n+3`、`2n+1`、`2n + 1`（括号里可以有空白），
`+` / `-` 后面必须跟数字。

### parse 出来的形状

```
parse('ul.menu > li:not(.on)[hidden]')
=> { groups: [
     { specificity: [0, 3, 2],
       parts: [
         { combinator: null,    compound: { tag: 'ul', id: null, classes: ['menu'], attrs: [], pseudos: [] } },
         { combinator: 'child', compound: { tag: 'li', id: null, classes: [],
                                            attrs: [{ name: 'hidden', op: null, value: null }],
                                            pseudos: [{ name: 'not', arg: { tag: null, id: null, classes: ['on'], attrs: [], pseudos: [] } }] } },
       ] },
   ] }
```

- `combinator` 是 `null`（这一段是整组最左边）/ `'descendant'` / `'child'` / `'adjacent'` / `'sibling'`。
- 复合选择器里 `tag` 是去掉大小写的标签名，没有类型或者写的是 `*` 就是 `null`；`classes` 按写的顺序放；
  `attrs` 每项是 `{ name, op, value }`，`op` 是那六种比较符之一，只写 `[a]` 时 `op` 和 `value` 都是 `null`；
  `pseudos` 每项是 `{ name, arg }`，`first-child` / `last-child` 的 `arg` 是 `null`，`nth-*` 的 `arg` 是 `{ a, b }`，
  `not` 的 `arg` 是一个复合选择器。
- 优先级就三档 `[id 数, 类 + 属性 + 伪类数, 类型数]`。`:not()` 本身不算，算它括号里那个复合选择器的。
- 空选择器、空的组、结尾多出来的逗号、后面没东西的组合子……都算不合法。

### 匹配口径

- `queryAll(root, selector)` 从 `root` 出发按前序找**子孙**：`root` 自己就算匹配上了也不进结果，但它算祖先
  （所以 `root` 上直接查 `ul > li` 能查到它的儿子）。结果按文档顺序排，命中多个组也只出现一次。
- 匹配是拿选择器最右边那段去套节点，再往左一节一节走：后代找任意祖先，`>` 找父亲，`+` 找紧挨着的上一个
  元素兄弟，`~` 找前面任意一个元素兄弟。中间夹着文本节点不影响相邻。
- 伪类的第几个孩子从 1 开始数，只数元素兄弟；`nth-of-type` 只数同标签的。`:not(x)` 里的 `x` 单独套在这个
  节点自己身上判。
- 类名按空白切成词再比；`[a=v]` 比整体，`[a~=v]` 比词；`^=` / `$=` / `*=` 做前缀 / 后缀 / 包含，值是空串时永远不匹配；
  `[a|=v]` 是等于 `v` 或者以 `v-` 开头；属性存在但值不是字符串时按 `String()` 转一下再比。

### 出错的地方

| 错误码 | 什么时候抛 | `details` |
|---|---|---|
| `ERR_BAD_ARGUMENT` | `parse` 的入参不是字符串；`queryAll` 的 `root` 不是对象、`selector` 不是字符串 | `{}` |
| `ERR_BAD_SELECTOR` | 选择器不认识、写残了（上面列的那些） | `{ position }` |

`position` 是出问题那个字符的下标：不认识或不完整的字符就报它自己；缺东西（组合子后面空了、逗号后面空了、
少个 `(`、字符串没写 `]`）报到缺的那个位置，已经是末尾了就是字符串长度；`:nth-*` / `:not` 括号里面不管出什么
问题，都报回那个 `(` 的下标；紧跟在一起接不上的（`*div`、`a:first-child()`）报到接不上的那个字符。
另外，不带引号的属性值必须是标识符，所以 `[data-x=1]` 不合法，要写 `[data-x="1"]`。

## API

| 入口 | 说明 |
|---|---|
| `parse(selector)` | 解析成上面那个形状；不合法抛 `SelectorError` |
| `queryAll(root, selector)` | 前序找子孙，按文档顺序返回命中的节点数组 |

## demo 跑出来应该长这样

```
selmatch demo
  parse {"groups":[{"specificity":[0,3,2],"parts":[{"combinator":null,"compound":{"tag":"ul","id":null,"classes":["menu"],"attrs":[],"pseudos":[]}},{"combinator":"child","compound":{"tag":"li","id":null,"classes":[],"attrs":[{"name":"hidden","op":null,"value":null}],"pseudos":[{"name":"not","arg":{"tag":null,"id":null,"classes":["on"],"attrs":[],"pseudos":[]}}]}}]}]}
  specificity [1,2,1]
  on ["a","c"]
  order ["a","b","c"]
  adjacent ["b","c"]
  nth ["a","c"]
  attr ["link"]
  none []
  dedup ["a","b","c"]
  bare-number ERR_BAD_SELECTOR {"position":8}
  typo ERR_BAD_SELECTOR {"position":3}
  empty ERR_BAD_SELECTOR {"position":0}
```
