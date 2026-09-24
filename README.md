# dnscodec

DNS 报文编解码：头部、问询、资源记录、名字压缩指针、几种常见 rdata 的拆装，还有按 `maxSize` 做 TC 截断。
只用 Node 标准库，`node >= 20`。

```
dnscodec/
├── lib/
│   ├── dnscodec.js  encodeMessage / decodeMessage   ← 还没实现
│   └── errors.js    DnsCodecError 与错误码
├── test/            decode / encode 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 10 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 报文长什么样

- 12 字节头：2 字节 id，2 字节标志位，然后是 questions / answers / authorities / additionals 四节各自的
  2 字节条数，都是大端。
- 标志位这 16 位从高位往低位摆：`qr`(0x8000)、`opcode`(4 位，0x7800)、`aa`(0x0400)、`tc`(0x0200)、
  `rd`(0x0100)、`ra`(0x0080)、`rcode`(4 位)。`opcode` 和 `rcode` 得是 0..15 的整数，其余五个是布尔。
  解码出来的 `flags` 这七个字段一个不少。
- 名字就是一串「长度 + 标签」，最后跟一个 0；根名字是空串，编出来只有一个 0 字节。标签最长 63 字节，
  整个名字的线上长度（含末尾 0）不超过 255 字节。字符串按 Latin-1 走，每个字符一个字节。

### 名字压缩

- 写到某个名字时，如果它的某个后缀之前已经写过，就写一个 2 字节指针（高两位 `11`，低 14 位是偏移），
  指向那个后缀；后缀从前往后逐段试，能指就指。只有起始位置小于 `0x4000` 的名字才记进压缩表，
  所以编出来的指针永远指不到 `0x4000` 及以上（那 14 位也放不下）。
- 压缩表按小写比对（`Example.com` 与 `example.com` 算同一个后缀），解码时按写进去的样子原样展开。
- 解码时指针可以套指针，也能指到前面任何位置（比如某条记录 rdata 里的名字）。指针绕圈、
  指到标签中间、标签长度字节前面带了别的位、名字超过 255 字节，都算坏名字。

### rdata 怎么拆

| 类型 | 编号 | rdata |
|---|---|---|
| A | 1 | 4 字节地址，解出来是 `{ address }`，点分十进制字符串 |
| NS | 2 | 一个名字，解出来是 `{ name }` |
| CNAME | 5 | 一个名字，解出来是 `{ name }` |
| SOA | 6 | 两个名字（`mname`、`rname`）后面跟 5 个 4 字节整数（`serial`/`refresh`/`retry`/`expire`/`minimum`） |
| PTR | 12 | 一个名字，解出来是 `{ name }` |
| MX | 15 | 2 字节优先级（`preference`）+ 一个名字（`exchange`） |
| TXT | 16 | 一串「1 字节长度 + 内容」，解出来是 `{ strings }`，每段最长 255 字节 |
| 其它 | 任意 | 原样字节，解出来是 `{ raw: Uint8Array }` |

- rdata 长度得跟内容严丝合缝：A 不是 4 字节、名字型 rdata 没用完、MX 太短、TXT 段伸出 rdata、
  SOA 尾巴对不上，都算坏记录。
- 解码出来的记录是 `{ name, type, class, ttl, data }`，问询是 `{ name, type, class }`，
  报文是 `{ id, flags, questions, answers, authorities, additionals }`。

### 按 maxSize 截断

- `encodeMessage(message, { maxSize })`：`maxSize` 要么不给，要么是不小于 12 的整数。
  编出来的字节超过 `maxSize` 就往下丢记录，次序是 additional → authority → answer → question，
  每节都从末尾往前丢，一直丢到装得下为止；动过刀子的报文 `tc` 置 1。最坏丢到只剩 12 字节的头，
  那时四节都是 0 条。
- 没给 `maxSize`，或者本来就装得下，`tc` 按 `flags.tc` 原样输出。
- 每丢一轮都重算一遍报文（压缩表也一起重算），所以剩下的名字还是按新偏移压缩的。

### 出错的地方

| 错误码 | 什么时候抛 | `details` |
|---|---|---|
| `ERR_BAD_ARGUMENT` | 入参不是对象；`id` 不是 0..65535 的整数；布尔/`opcode`/`rcode` 类型不对；四节不是数组；名字不是字符串、有空标签、标签超 63 字节、整名线上超过 255 字节、含非 Latin-1 字符；记录字段的 type/class/ttl 不合法；A 地址不是四段 0..255；TXT 没有 `strings` 数组或段不合法；MX 优先级不合法；SOA 少字段；未知类型没给 `raw`；`maxSize` 小于 12 或不是整数；编出来超过 65535 字节 | `{}`（`maxSize` 那条带 `{ maxSize }`，超长那条带 `{ size }`） |
| `ERR_TRUNCATED` | 解码时字节不够：连 12 字节头都不够、名字没读完、类型/记录头/rdata 读不到 | `{ offset }` |
| `ERR_BAD_NAME` | 指针绕圈、指到标签中间、标签长度前缀带了别的位、名字超过 255 字节 | `{ offset }` |
| `ERR_BAD_RECORD` | rdata 跟类型对不上：A 不是 4 字节、名字没用完、MX 太短、TXT 越界、SOA 对不上 | `{ type, offset, length }` |

## API

| 入口 | 说明 |
|---|---|
| `encodeMessage(message, options = {})` | 编成 `Uint8Array`；`options.maxSize` 给了上限就按上面的规则截断 |
| `decodeMessage(bytes)` | 从 `Uint8Array` 解出报文对象 |

## demo 跑出来应该长这样

```
dnscodec demo
  query 12340100000100000000000003777777076578616d706c6503636f6d0000010001
  reply-size 68
  reply 12348580000100020000000003777777076578616d706c6503636f6d0000010001c00c000500010000012c00070465646765c010c02d000100010000003c0004c0000201
  names ["www.example.com","edge.example.com"]
  data [{"name":"edge.example.com"},{"address":"192.0.2.1"}]
  unknown [222,173]
  full-size 95
  max-94 [79,true,1,2,1,0]
  max-60 [45,true,1,1,0,0]
  max-40 [29,true,1,0,0,0]
  max-20 [12,true,0,0,0,0]
  bad-name ERR_BAD_ARGUMENT {}
  bad-arg ERR_BAD_ARGUMENT {"maxSize":4}
  truncated ERR_TRUNCATED {"offset":2}
```
