JSON 文档差分这块想自己写一份：指针、patch、merge patch、从两份文档里生成 patch，
再到把一条 patch 反过来的反向 patch，一条龙。

入口就 parsePointer、formatPointer、get、apply、diff、mergePatch、invert、equals，
README 的《口径》和《API》两节把指针转义怎么还原（要从左往右一个字符一个字符地看）、
数组下标什么样的算合法、add/remove/replace/move/copy/test 各自在对象和数组上什么语义、
空指针怎么算、深度相等怎么比、diff 的 LCS 并列时破哪边、merge patch 什么时候删键、
invert 怎么知道旧值、每种错误报哪个码都写死了。目录里 lib/errors.js、test 下三组用例、
scripts/demo.mjs 都已经写好，就差 lib/jsonpatch.js，别的文件不动，也别引第三方包。

几个最容易写歪的地方：apply 返回的是新文档，原文档一个字节都不能动，而且整条 patch 是原子的，
中途炸了就当什么都没发生，错误里还要带上是第几条出的问题；add 到数组的下标可以等于长度（等于
追加）、比长度大才算越界，- 只有在 add 的路径最后一段上才算数；diff 数组那段，删要从大到小、
加要从小到大，LCS 并列的时候算放弃 a 这边，不然同样两份文档出两套 patch；invert 得拿着 doc
把 patch 往前走一遍，每条操作的旧值取的是那一刻的值，不是最开始 doc 上的值，不然后面几条
删掉/插进去的下标全对不上。

跑法两条：npm test 全绿（12 条，里面有指针转义与非法写法、取不到与下标写歪的区分、
add/remove/replace 的对象数组语义、越界与 move/copy/test、原子性与错误里的 index、
不认识的 op 与缺字段、对象 diff、数组 LCS、十一种形状的 apply(diff) 还原、
merge patch、invert 的来回、以及 invert 压掉旧值的写回），npm run demo 的输出跟 README
最后贴的那段一行行对上。
