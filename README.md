# htmlex

一小段 HTML 的分词器：把源码切成 doctype / 注释 / 标签 / 文本 / CDATA 这些 token，顺手把毛病记下来。
只做分词，不建树，也不做纠错补全。只用 Node 标准库，`node >= 20`。

```
htmlex/
├── lib/
│   ├── htmlex.js    tokenize 与状态机                       ← 还没实现
│   └── errors.js    HtmlError 与错误码清单
├── test/            token / edge 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 11 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### token 形状

`tokenize(html)` 返回 `{ tokens, errors }`，`tokens` 里最后一定跟着一个 `{ type: 'eof' }`：

| type | 字段 |
|---|---|
| `doctype` | `name`（小写）、`publicId`、`systemId`（没有就是 `null`）、`quirks` |
| `comment` | `data` |
| `text` | `data` |
| `cdata` | `data` |
| `startTag` | `name`（小写）、`attributes`（`[{ name, value }]`，名字小写、值已解引用）、`selfClosing` |
| `endTag` | `name`（小写，可能是空串） |

挨着的文本合成一个 `text` token（`a&amp;b`、`a<!--x-->` 这种都会合并到相邻的那一段）。
标签名、属性名统一小写；属性值只解字符引用，不改大小写。名字一直读到空白、`/`、`>` 或者输入结束为止。

### 标签与属性

- `<` 后面是字母就是起始标签，`</` 就是结束标签；`<` 后面是 `!` 或 `?`、或者输入结束，见下面注释那段；
  其它字符（比如 `<3`）报 `invalid-first-character-of-tag-name`，这个 `<` 当普通文本。
- 起始标签里属性一个接一个解析：
  - 重复的属性名报 `duplicate-attribute`（**第一个留下**，后面的丢掉），位置是属性名开头；
  - 没有名字先来个 `=`，报 `unexpected-equals-sign-before-attribute-name` 并把这个 `=` 丢掉；
  - 上一个属性名 / 值紧挨着下一个属性名（中间没空白），报 `missing-whitespace-between-attributes`，位置是新属性名开头；
  - `=` 后面直接就是 `>`，报 `missing-attribute-value`，值是空串；
  - 未加引号的值里，`"` `'` `<` `=` `` ` `` 这几个字符报
    `unexpected-character-in-unquoted-attribute-value` 并且**直接丢掉**，别的字符（包括 `/`）都是值的一部分 ——
    所以 `<a x=1/>` 的值是 `"1/"`、`selfClosing` 是 `false`，想自闭合得写 `<a x="1"/>` 或 `<a x=1 />`；
  - `/` 后面不是 `>`，报 `unexpected-solidus-in-tag` 并把这个 `/` 丢掉。
- 结束标签名后面剩下的东西一律忽略到 `>`；`</>` 和 `</ >` 报 `missing-end-tag-name`，出来的是名字为空串的 `endTag`。
- 标签没收尾（输入结束在半路）报 `eof-in-tag`，位置是输入长度；已经解出来的属性和标签照样给出来。

### 注释

- `<!--` 到 `-->`；`<!-->` 和 `<!--->` 是**空注释**，报 `abrupt-closing-of-empty-comment`；没等到 `-->` 就报
  `eof-in-comment`，剩下的全当注释内容。
- `<!` 开头的其它情况（比如 `<!x>`）和 `<?` 开头的是 **bogus comment**：内容读到第一个 `>` 为止，
  分别报 `incorrectly-opened-comment` / `unexpected-question-mark-instead-of-tag-name`；读到结尾都没 `>` 不额外报错。

### doctype

`<!DOCTYPE` 大小写不敏感。名字取到空白或 `>` 为止（小写）；后面认 `PUBLIC "公参" "系统参"` 和 `SYSTEM "系统参"`
（也认单引号），其它字符跳过到 `>`；没等到 `>` 报 `eof-in-doctype`。
`quirks` 的判据：名字是 `html` 且 `publicId`、`systemId` 都是 `null` 才是 `false`，别的（包括 `<!DOCTYPE>`）都是 `true`。

### CDATA 与 RAWTEXT

- `<![CDATA[` 到 `]]>` 之间原样给一个 `cdata` token；没等到 `]]>` 报 `eof-in-cdata`。
- `script` / `style` 的内容是 **RAWTEXT**：`<` 和 `&` 都是普通字符，只有匹配的 `</name`（后面跟空白、`>`、`/`
  或者输入结束）才算结束，`</scriptx>` 这种不算。一直找不到就吃到输入结尾（不额外报错）。
- `textarea` / `title` 的内容是 **RCDATA**：解字符引用，但不认标签，只有匹配的结束标签能收尾。
- 自闭合的 `<script/>` 不进 RAWTEXT，后面照常当普通内容。

### 字符引用

文本和属性值里都解。名字**大小写敏感**，而且必须带 `;`：

`amp lt gt quot apos nbsp copy reg trade hellip mdash ndash laquo raquo times divide deg plusmn micro middot bull euro pound yen sect para lsquo rsquo ldquo rdquo dagger permil`

数字写法是 `&#123;` 和 `&#x1F4A9;`（十六进制大小写都认）。几种特殊处理：

| 写法 | 结果 |
|---|---|
| `&#0;` | `U+FFFD` + `null-character-reference` |
| 超过 `0x10FFFF` 或者落在代理区（`0xD800`–`0xDFFF`） | `U+FFFD` + `character-reference-outside-unicode-range` |
| 其它不成形的（`&nope;`、`&amp`、`&#;`、`&#x;`） | 只吃掉 `&`，剩下的当普通文本 + `invalid-character-reference` |

位置记的都是**触发这个错误的那个字符**的下标（`&` 就记 `&` 的下标，标签没收尾记输入长度）。

### NUL 和错误码

文本里的 `\0` 报 `unexpected-null-character` 但**原样留着**；属性值、引号值里的 `\0` 换成 `U+FFFD` 再报。

| 错误码 | 什么时候 |
|---|---|
| `unexpected-null-character` | 文本或属性值里的 `\0` |
| `invalid-first-character-of-tag-name` | `<` 后面不是字母 / `/` / `!` / `?` |
| `eof-in-tag` | 标签没收尾 |
| `eof-in-comment` / `eof-in-doctype` / `eof-in-cdata` | 这三种结构没收尾 |
| `missing-end-tag-name` | `</>` 或 `</ >` |
| `unexpected-question-mark-instead-of-tag-name` | `<?` |
| `incorrectly-opened-comment` | `<!` 后面不是 `--`、不是 `DOCTYPE`、也不是 `[CDATA[` |
| `abrupt-closing-of-empty-comment` | `<!-->` 或 `<!--->` |
| `unexpected-equals-sign-before-attribute-name` | 属性名位置先来了 `=` |
| `duplicate-attribute` | 属性名重复 |
| `missing-whitespace-between-attributes` | 两个属性之间没空白 |
| `unexpected-solidus-in-tag` | `/` 后面不是 `>` |
| `missing-attribute-value` | `=` 后面直接 `>` |
| `unexpected-character-in-unquoted-attribute-value` | 未加引号的值里出现 `"` `'` `<` `=` `` ` `` |
| `invalid-character-reference` | 不成形的字符引用 |
| `null-character-reference` | `&#0;` |
| `character-reference-outside-unicode-range` | 数字引用越界或落在代理区 |

## API

| 入口 | 说明 |
|---|---|
| `tokenize(html)` | 返回 `{ tokens, errors }`；`errors[].code` 是上表里的码，`errors[].index` 是下标 |

`html` 不是字符串抛 `HtmlError`（`code` 是 `ERR_BAD_ARGUMENT`）。空串出来就是 `{ tokens: [{ type: 'eof' }], errors: [] }`。

## demo 跑出来应该长这样

```
htmlex demo
  basic startTag(p)[class="hi"] #text[a & b] endTag(p) eof
  attrs startTag(a /)[x="1" y=""] eof
  refs #text[©AA � &nope;] eof
  refs.errors null-character-reference@18 invalid-character-reference@23
  raw startTag(script) #text[if (a < b) x = "</div>";] endTag(script) eof
  rcdata startTag(title) #text[&<b>] endTag(title) eof
  cdata cdata[raw <b>] eof
  doctype doctype(html quirks)[- about:legacy-compat] eof
  comment #text[a] comment[x] #text[b] comment[] eof
  comment.errors abrupt-closing-of-empty-comment@14
  broken startTag(a)[b="1" c=""] eof
  broken.errors duplicate-attribute@9 missing-attribute-value@17
```
