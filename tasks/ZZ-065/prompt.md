avlmap 这份有序表是上个同事留下的（lib/avlmap.js），能跑、demo 也不炸，但行为跟仓库里 README 的
《口径》对不上：test 下 12 条用例现在红了 7 条，demo 打出来的东西也跟 README 最后贴的那段对不上。
我要你把 lib/avlmap.js 修到全绿，README 的《口径》和《API》两节就是标准答案，照着来。

外面要的就是 createMap 出来的那套（set / get / has / remove / min / max / at / indexOf / range /
entries / size / height / clear / stats），键只收安全整数，别的都按口径抛码。目录里 lib/errors.js、
test 下两组用例、scripts/demo.mjs 都已经写好，只动 lib/avlmap.js，别的文件别改（用例是标准，
别改用例去迁就实现），也别引第三方包。

现在能看到的毛病大概是这些：查名次的时候把左边那棵子树的大小漏算了，从右边下来的键名次会偏小；
range 的右端点那条不进去，闭区间少一条；删掉一个有两个孩子的键之后 size 会比实际少一个；has
压根没查键的类型，传字符串进去它也一路往下找；按 1..n 递增插入完，height() 涨到跟键的个数一样大，
明显是往右边长成链了、另一边该转的没转；还有 at()，值是给对了，但它是整棵树中序遍历数到第几个
才停的，用例里名次查询的访问量上限（stats().visited 不许超过树高那条上界）就是这么挂的 ——
得改成顺着每个节点的子树大小往下走。

跑法两条：npm test 全绿（12 条，里面有增删查改、清空、键类型错误、下标越界与非法下标、名次与
闭区间 range、min / max / height 的口径、递增递减和锯齿插入的高度上界、边加边删的高度控制、
名次查询的访问量、以及和朴素实现逐项对比），npm run demo 的输出跟 README 最后贴的那段一行行对上。
