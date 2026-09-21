# formweave

上传服务里用的 `multipart/form-data` 解析组件。服务端只依赖 Node 标准库，
没有第三方包，`node >= 20`。

```
formweave/
├── lib/
│   ├── multipart.js   解析器本体：parseContentType + MultipartParser   ← 还没实现
│   ├── server.js      上传服务（POST /upload、GET /healthz），已经写好了
│   └── errors.js      MultipartError 与错误码 -> HTTP 状态码的对应表
├── test/              用例：parse / limits / server 三组 + harness.mjs
├── scripts/demo.mjs   手工过一遍解析器的演示脚本
└── package.json       npm test / npm run demo
```

```
npm test        # 21 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### body 结构

```
body      := preamble? delimiter part (delimiter part)* close-delimiter epilogue?
delimiter := CRLF "--" boundary
close-delimiter := CRLF "--" boundary "--"
part      := header-line CRLF (header-line CRLF)* CRLF content
```

- 第一条分隔符可以不带前面那个 CRLF（body 一开头就是 `--boundary` 的时候）。
- `preamble` 和 `epilogue` 一律忽略，不进任何统计。
- `--boundary` 后面只允许接 CRLF（后面还有 part）或者 `--`（整个 body 结束）。
  接别的东西就是坏输入。`--boundary--` 之后不管还有什么都不再看。
- 客户端有时候会让一个 boundary 恰好是内容里某个更长串的前缀（`\r\n--boundary` 后面跟了别的字符）。
  这种按内容处理：那几个字节原样当成内容交付，继续往后找真正的分隔符。

### header 段

- 一个 part 的 header 段从分隔符后面那一行开始，到第一个空行（CRLF CRLF）为止。
  中间那一行都不能有内容，也不接受空 header 段以外的花样。
- 换行只认 CRLF。行里出现单独的 LF 或 CR，算坏输入。
- 一行必须是 `名字: 值`。名字不能是空、名字两侧不能有空白（`Name : v` 是坏的），
  值两侧的空白去掉，值内部的空白保留。
- 不支持折行（下一行以空格或 Tab 开头）；认不出来就是坏输入。
- 同名的 header 后面的覆盖前面的。
- header 段（不含结尾那个空行）超过 `maxHeaderBytes` 就是坏输入，无论是一次到齐还是慢慢到的。
- `Content-Disposition` 的值按 `;` 切（引号内的 `;` 不算分隔），第一段是 `form-data`，
  后面是 `名字=值`；值可以带引号，引号里 `\"` 表示一个引号。参数名大小写不敏感。
  `name` 有就用，没有就是空串；`filename` 有就用，没有就是 `null`。

### 上限与错误分类

| 上限 | 默认值 | 超出时报 |
|---|---|---|
| 单个 part 的内容字节数 | 1 MiB | `PART_TOO_LARGE`（413） |
| 所有 part 内容加起来的字节数 | 8 MiB | `TOTAL_TOO_LARGE`（413） |
| 单个 part 的 header 段 | 16 KiB | `MALFORMED_HEADERS`（400） |

- 两个内容上限同时到线时报 `PART_TOO_LARGE`。
- 到线的判定发生在"这些字节确实属于内容"的那一刻，不能等整个 body 收完；
  已经发出去的内容不回收，超出去的那部分直接不发，然后拒绝。
- 内容上限只算 part 的内容字节，分隔符、header、preamble 都不算。

### 内存

解析器必须边收边发：任何一次 `write()` 返回之后，留在手里还没交付的字节数
不能超过 `boundary 长度 + 8`（`preamble` / `epilogue` 不占额度，因为它们是直接丢掉的）。
也就是说不能先把内容攒起来、等看到分隔符再一次性发出去。

### 错误码

| 错误码 | 什么时候 | HTTP |
|---|---|---|
| `MALFORMED_CONTENT_TYPE` | content-type 不是 multipart 或者没有 boundary | 400 |
| `MALFORMED_HEADERS` | header 段/header 行不合法，或者 header 段超长 | 400 |
| `MALFORMED_BODY` | 结构不对：分隔符后面接了别的东西、body 到头都没看到第一条分隔符 | 400 |
| `UNEXPECTED_EOF` | body 在 part 中间就结束了（header 没收全、内容后没有结束分隔符） | 400 |
| `PART_TOO_LARGE` | 单个 part 的内容超过 `maxPartBytes` | 413 |
| `TOTAL_TOO_LARGE` | part 内容总量超过 `maxTotalBytes` | 413 |

## API

```js
import { MultipartParser, parseContentType, DEFAULTS } from './lib/multipart.js';
```

### `parseContentType(value)`

- 入参：`content-type` 头的原文（可能是 `undefined`）。
- 出参：`{ type, subtype, params }`；`type`/`subtype` 是小写，`params` 的键是小写、
  值去过引号和反斜杠转义。整条头解析不出来（空串、没有 `/`）时返回 `null`。
- 没有 boundary 时照样返回对象，`params.boundary` 是 `undefined`。

### `new MultipartParser(contentType, options)`

- `options`：`maxPartBytes` / `maxTotalBytes` / `maxHeaderBytes`，不传用 `DEFAULTS`。
- content-type 不是 multipart 或缺 boundary 时，构造函数直接抛 `MultipartError`
  （`code = 'MALFORMED_CONTENT_TYPE'`）。

### `write(chunk)` / `end()`

- `write` 收 `Buffer`；返回 `undefined`；不抛错，出错一律通过事件上报。
- `end()` 表示 body 收完了。已经正常结束或者已经拒绝的实例，再调 `write` / `end` 不做事。
- 事件是同步发的：`reject` 会发生在造成它的那次 `write()` / `end()` 里面。

### 事件

顺序固定：`part` → `data`* → `partEnd` →（下一个 part 同样三段）→ `end`。
出错时改为发一次 `reject`，之后不再有任何事件。

| 事件 | 参数 | 说明 |
|---|---|---|
| `part` | `info` | 一个 part 的 header 收全了 |
| `data` | `chunk, info` | 这个 part 的一段内容（`Buffer`，字节原样，不做任何解码） |
| `partEnd` | `info` | 这个 part 的内容结束；此时 `info.size` 是这个 part 的内容字节数 |
| `end` | — | 收到 `--boundary--`，整个 body 结束 |
| `reject` | `error` | `MultipartError`，带 `code` / `status` |

`info` 的形状（`part` 事件时 `size` 还是 0，`partEnd` 时填上最终值）：

```js
{
  index: 0,                 // 第几个 part，从 0 开始
  headers: { 'content-disposition': '...', 'content-type': '...' },
  name: 'file',             // Content-Disposition 里的 name，没有就是 ''
  filename: 'a.png',        // 没有 filename 就是 null
  contentType: 'image/png', // 没有 Content-Type 头就是 ''
  size: 1024,
}
```

## 服务端怎么用它

`lib/server.js` 已经是成品，不要再改：

- `GET /healthz` → `200 {"ok":true}`
- `POST /upload` → 收完整份表单，回
  `200 {"fields":{...},"files":[{"name","filename","size","sha256"}],"totalBytes":N}`，
  字段按 UTF-8 解码，文件只算 size 和 sha256（不落盘）。
- 解析被拒时回 `{"error":"<错误码>","message":"..."}`，状态码取 `MultipartError.status`；
  回之前会先把剩下的请求体读完丢掉，免得连接被 reset。
- 其它路径 / 方法 → 404。客户端中途断开不算错误，服务不能因此挂掉。

## demo 跑出来应该长这样

`npm run demo` 里用的 boundary、内容都是写死的，所以输出每一行都能对上
（`sha256=` 后面是内容 sha256 的前 12 位）：

```
formweave demo
[1] 三字节一块喂进来的三段表单
    part #0 name=note filename=- type=text/plain size=15 sha256=05fbaff3b6a7
    part #1 name=avatar filename=avatar.png type=image/png size=24 sha256=4cb15f4f9775
    part #2 name=empty filename=- type=- size=0 sha256=e3b0c44298fc
    end: 3 parts
[2] 单 part 上限 32 字节，喂一份 64 字节的内容
    reject PART_TOO_LARGE (413): part 0 的内容超过 32 字节
[3] 起一个服务，真收一次上传
    GET /healthz -> 200 {"ok":true}
    POST /upload -> 200 fields={"note":"hello"}
    files=[{"name":"file","filename":"upload.bin","size":25,"sha256":"6de68d1a9730ed06ee5a49f97c4110f237fbead15e0fd5ec3fa5b887392474fd"}] totalBytes=30
```
