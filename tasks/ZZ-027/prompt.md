入口一个 createCachePolicy，README 的《口径》和《API》两节把指令怎么解析、当前年龄怎么算、新鲜期按什么顺序取、Vary 怎么比、能不能存、这次该怎么办的判断顺序、304 怎么合并、每种错误报哪个码都写死了，照着来。目录里 lib/parse.js、lib/errors.js、test 下四组用例、
scripts/demo.mjs 都已经写好，就差 lib/policy.js，别的文件别动，也别引第三方包。

"现在几点"只能从 clock 拿，别在代码里偷偷 Date.now()，不然跨月和过期边界
根本没法测。Cache-Control 的解析要经得起脏数据：引号里的逗号不算分隔，数值指令的值不是纯非负
整数就整条丢掉（max-stale 不带值例外），同名指令只认第一个。当前年龄按 RFC 那套 apparent_age、
Age 头、响应耗时取大的再加驻留时间，别只拿 now 减 storedAt。

判断顺序不能乱：请求 no-store 最先，共享缓存碰 private 和带 Authorization 的请求要排在 Vary
前面，no-cache / max-age / min-fresh 这些请求侧指令要排在"还新鲜"前面；过期之后先看
only-if-cached，再看 no-cache / must-revalidate / proxy-revalidate 这些必须回源的，
然后才是 max-stale、stale-while-revalidate。给过期内容时要在 warnings 里带 110，启发式新鲜期
做的决定要带 113。

304 合并只更新该更新的：connection、transfer-encoding、content-length、content-range 一律不动，其余用 304 里的覆盖，头名统一小写，三个时间戳重置成这次的时间（新鲜期从这次重新算），而且不能就地改原来的 entry。

跑法两条：npm test 全绿（30 条，里面有年龄的四段构成、启发式新鲜期上限、Vary 逐个头比对、
判断顺序的每个分支和 304 合并），npm run demo 的输出跟 README 最后贴的那段一行行对上。
