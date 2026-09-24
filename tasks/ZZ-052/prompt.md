接口签名这块想自己写一份：方法、路径、查询串、请求头、正文进去，规范请求那段字符串出来，
再按派生的密钥签一下，最后拼成 Authorization 头，或者拼一个能直接发出去的预签名 URL。
路子就是 AWS SigV4 那一套，照着 README 的口径来，别自己发挥。

入口就 canonicalRequest、sign、presign，README 的《口径》和《API》两节把编码留哪几个字符、
路径怎么分段编、查询串怎么排序、头怎么规范化、哪些头不签、正文不给算什么样的哈希、
timestamp 收什么、签名密钥怎么一层层派生、规范请求和签名串各是几行、预签名那几条 X-Amz
参数怎么并进查询串、每种错误报哪个码都写死了。目录里 lib/errors.js、test 下两组用例、
scripts/demo.mjs 都已经写好，就差 lib/reqsign.js，别的文件不动，也别引第三方包。

最容易掉坑的是编码和排序：encodeURIComponent 不编码 ! ' ( ) * 这四个，得自己补成大写十六进制；
路径是按 / 切开每段各自编码，空段要留着；查询串先按编码后的名比字典序、名一样再比值，
同名同值的都留着别去重；头的名字按小写看，同一个头写两遍要把值用逗号接起来，值里连续的空白
压成一个空格，authorization 和 user-agent 当没看见，host 少一个直接报错。签名密钥那串 HMAC
每步喂的是上一步的字节，不是十六进制串，这里写错的话整条签名都对不上。

timestamp 收 Date、epoch 毫秒和能解析出时间的串，统一转 UTC 再取那两段；预签名的正文一律
按 UNSIGNED-PAYLOAD 算，X-Amz-Signature 追加在查询串最后，expires 不给自己取 604800、给了不能超。

跑法两条：npm test 全绿（10 条，里面有规范请求那几行、编码与排序、空路径空段、头合并与不签的头、
空正文与 UNSIGNED-PAYLOAD、请求形状错误码、跟手算 HMAC 链对签名、动一处就变、
timestamp 三种写法、预签名参数顺序与签名位置、expires 范围），npm run demo 的输出跟 README
最后贴的那段一行行对上。
