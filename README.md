# tplate

一个小模板引擎，办公室内部几个邮件 / 页面片段在用它。现在已经能跑：插值（默认 HTML 转义）、
`{{#x}}…{{/x}}` 段落、注释、上下文栈，`node >= 20`，只用 Node 标准库。

```
tplate/
├── lib/
│   ├── tplate.js    render 与整套模板口径
│   └── errors.js    TplError 与错误码
├── test/
│   ├── tplate.test.js   已经在跑的那批（现在全绿）
│   └── tplate2.test.js  这次要加的东西的验收用例（现在全红）
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 18 条用例（9 条老的 + 9 条新的）
npm run demo    # 打印下面那段固定输出
```

## 现在的口径（这批别改坏）

- **插值 `{{name}}`**：名字两边的空白不算；取到的值 `null` / `undefined` 当空串，别的 `String(value)`
  （所以 `false` 就是 `"false"`、`0` 就是 `"0"`）；**默认过 HTML 转义**：`&` `<` `>` `"` `'` 依次换成
  `&amp; &lt; &gt; &quot; &#39;`。
- **名字**：只允许字母、数字、`_`、`$`、`-`，以及 `.`（老版本里带点的名字就是**一个字面键名**，
  不拆开找）；不合法 / 为空是 `ERR_BAD_TEMPLATE`。名字是 `.` 时取当前上下文本身。
- **段落 `{{#name}}…{{/name}}`**：值是数组就逐项渲染（每一项压进上下文栈，`{{.}}` 取当前项）；
  是别的真值就在那个值上渲染一次（对象换上下文、字符串数字也能用 `{{.}}` 拿到）；`null` /
  `undefined` / `false` / `''` / `0` / `NaN` 以及空数组都跳过。
- **上下文栈**：里层找不到的键，一层层往外找，最外层是传进来的 `data`。
- **注释 `{{! … }}`**：什么都不输出。
- **数据里没有的键**：空串，不报错。`data` 得是非 `null` 的对象（数组也行），否则 `ERR_BAD_ARGUMENT`；
  模板不是字符串也是这个码。

## 这次要加的（`test/tplate2.test.js` 是验收用例）

1. **不转义的插值**：`{{{name}}}` 和 `{{&name}}` 两种写法都原样输出（名字两边空白同样不算）。
2. **反向段落 `{{^name}}…{{/name}}`**：值是不渲染的那种（`null` / `undefined` / `false` / `''` / `0` /
   `NaN`）或者空数组时渲染，渲染时**上下文不变**；别的值跳过。
3. **点路径**：`{{a.b.c}}` 先在有 `a` 的那层上下文里找到 `a`，再顺着 `b`、`c` 往下取；路径中间断了
   （或者 `a` 是个数组）就当没取到 —— 注意是**从里往外找第一个有 `a` 的上下文**，找到之后路径断了
   就不再往外层找。
4. **片段 `{{> name}}`**：`render(template, data, { partials })` 里的 `partials` 是
   `名字 -> 模板字符串`；片段用**当前上下文**渲染，可以再套片段；找不到的名字什么都不输出（不报错）；
   `partials` 不是对象、或者某个片段不是字符串 → `ERR_BAD_ARGUMENT`。
5. **片段的缩进**：`{{> name}}` 那一行前面的空白当**缩进**，贴在片段渲染结果**每一行的行首**上
   （渲染结果正好以换行结尾时，最后那个空行不加）。
6. **独立行的空白**：`#` / `^` / `/` / `!` / `>` 这些**结构标签**，如果它所在的一行除了它以外只有
   空白（空格、制表符），那么这一行**连缩进带行尾换行一起删掉**（文件最后一行没换行也算）。
   插值标签（`{{x}}` / `{{{x}}}` / `{{&x}}`）没有这个待遇；一行里还有别的东西也不算独立行。
7. **新的错误**：`{{{` 没闭合、`{{&}}` / `{{> }}` 这种空名字、`{{> a b}}` 这种不合法名字、
   反向段落没配对上 / 没闭合，都是 `ERR_BAD_TEMPLATE`。

## API

| 入口 | 说明 |
|---|---|
| `render(template, data, options = {})` | 渲染模板；`options.partials` 是片段表 |
| `TplError` / 错误码 | `ERR_BAD_ARGUMENT`（入参类型）、`ERR_BAD_TEMPLATE`（模板写坏） |

## demo 跑出来应该长这样

```
tplate demo
  page "<h1>A&amp;B</h1>\n  <li>x</li>\n  <li>y</li>\n<footer>Ada</footer>"
  emptyList "<h1>t</h1>\n  <p>empty</p>\n<footer>Ada</footer>"
  escaped "&lt;i&gt; / <i>"
  dotted "42"
  missing "[][]"
  badTemplate.code ERR_BAD_TEMPLATE
  badArgument.code ERR_BAD_ARGUMENT
```