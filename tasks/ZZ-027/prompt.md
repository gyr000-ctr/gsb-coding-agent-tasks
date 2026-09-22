网关里想放一层本地缓存，按 key 存小对象，久了要自动过期，条数也不能无限涨。

入口一个 createCache，README 的《口径》和《API》两节把容量和 TTL 的配置、使用顺序怎么维护、满了淘汰谁、过期怎么算、惰性清理的口径、统计怎么记、每种错误报哪个码都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/cache.js，别的文件别动，也别引第三方包。

顺序和过期都要经得起推敲：set 和命中的 get 会把 key 挪到最新，has 不改顺序；覆盖已有的 key 是更新不是淘汰；过期时刻按写入时间加 TTL 算，now 正好到点那一刻就算过期。过期是惰性的，没被碰到就还占着容量，也可能被 LRU 挤掉——size 不主动清理，prune 和 keys 会清。

"现在几点"只能从 clock 拿，别在代码里偷偷 Date.now()，不然 TTL 边界测不了；命中统计只在 get 上算，has 不参与。

跑法两条：npm test 全绿（14 条，里面有 LRU 淘汰顺序、覆盖不算淘汰、TTL 到点、ttlMs=0 永不过期、惰性清理与统计），npm run demo 的输出跟 README 最后贴的那段一行行对上。
