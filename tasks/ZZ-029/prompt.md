灰度发布现在靠人肉记名单，想改成按规则算：先看命中了哪条规则，再用稳定分桶决定这个人进不进灰度、看到哪个变体，同一个人不能一会儿进一会儿不进。

入口一个 createRoller，README 的《口径》和《API》两节把配置怎么校验、规则结构、when 怎么匹配、分桶怎么算、percent 怎么放量、variants 怎么切、返回哪几个字段、每种错误报哪个码都写死了，照着来。目录里 lib/hash.js、lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/roll.js，别的文件别动，也别引第三方包。

分桶只能用 lib/hash.js 那个哈希，素材是 salt + 规则 id + 用户 id，除以 100 取余，换进程换机器都得是同一个数；换 salt 等于重新洗牌。规则从上往下匹配，第一条 when 全落上的算数，when 里数组值表示在名单里，用户缺字段就是不匹配，不给 when 就等于兜底全匹配。

没进灰度不代表没命中规则：命中了但 bucket 落在 percent 外面时，rule 和 bucket 照样要返回，方便排查。variants 是在已经进灰度的那一段里按累加百分比切，切不到就是 null。规则写错（缺 id、id 重复、percent 不是 0~100 的整数、when 里塞对象、variants 结构不对）要报 ERR_BAD_RULES，用户没有 id 报 ERR_BAD_USER。

跑法两条：npm test 全绿（12 条，里面有规则优先级、数组匹配、分桶口径与稳定性、percent 0 和 100、变体切分、换 salt 打散、各种规则错误），npm run demo 的输出跟 README 最后贴的那段一行行对上。
