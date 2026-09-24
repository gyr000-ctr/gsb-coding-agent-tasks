因果投递这块想自己写一份：把「谁见过哪些事件」记成一堆 dot（id 加计数），拿它比较两个副本谁
走在前面、合并、还有按因果关系投递消息 —— 前置没到齐的先挂起来，到齐了再一起并进来。

入口就 empty / tick / merge / compare / dots / contains / missing / createNode，README 的
《口径》和《API》两节把时钟长什么样（段是 { id, from, to }，按 id 升序、同一个 id 上相邻的两段
要并成一段、长度小于 1 的段丢掉）、tick 只把某个 id 的顶加一、merge 取的是点的并集而且收进来
的每一份都必须是已经规范化的时钟、compare 的四种结果怎么分、dots 的展开顺序、missing 返回的
'id:计数' 字符串、消息的 { from, payload, clock } 形状和「里面要有 from 自己的点」这条、deliver
的重复判定和前置判定怎么算、挂起队列怎么扫、每种参数错报哪个码都写死了，照着来。目录里
lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/vclock.js，别的文件不动，
也别引第三方包。

容易写歪的地方：compare 比的是点的集合，别拿某个 id 的顶当点集用 —— 时钟是允许带洞的
（[{a,1..2},{a,4..5}] 合法，点集就是 a:1 a:2 a:4 a:5），所以 [{a,1..3}] 跟 [{a,1..2},{a,4}]
是 concurrent 不是 equal；merge 是点的并集不是计数相加，而且收进来的时钟不是规范化形状就直接
抛 ERR_BAD_CLOCK，别顺手帮人收拾；tick 出来的新点要跟顶上那一段并起来，别让它变成两个相邻的
段；deliver 判前置的时候要把消息自己那个点排除掉（它自己当然还没在本节点时钟里），不然永远齐
不了；消息形状不对一律 ERR_BAD_MESSAGE，别在这儿抛 ERR_BAD_CLOCK，而 contains 收的 dot 形状
不对是 ERR_BAD_DOT。挂起队列扫的时候要「扫到有变化就重来一遍」，别只扫一遍。

跑法两条：npm test 全绿（12 条，里面有规范化形状、merge 是并集不是相加、compare 的四种结果、
dots / contains / missing、时钟形状错误、dot 形状错误、createNode 与 send、send 只动自己那一段、
乱序到达先挂起、重复投递、一条到齐把整串带进来、双向互发与消息形状错误），npm run demo 的
输出跟 README 最后贴的那段一行行对上。
