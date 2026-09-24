Merkle 日志这块想自己写一份：叶子哈希、节点哈希、树根，外加「某个叶子在这棵树里」的包含证明和
「老树是新树前缀」的一致性证明，都按 RFC 6962 那套拆树口径来，两条证明还得能各自验回去。

入口就 leafHash / nodeHash / createLog / verifyInclusion / verifyConsistency，README 的
《口径》和《API》两节把两个哈希怎么拼（叶子前面补 0x00、节点前面补 0x01）、空树的根是什么、
拆树时 k 取哪个 2 的幂（是「小于 n 的最大的 2 的幂」，n 是 2 的时候就取 1）、包含证明按什么
顺序往 path 里塞哈希、一致性证明里那个 whole 标志干什么、m = 0 和 m = n 各是什么口径、
校验时怎么按同样的顺序取用证明、什么时候返回 false 什么时候抛码、每种参数错报哪个码
都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，
就差 lib/merkletree.js，别的文件不动，也别引第三方包（用 node:crypto 的 SHA-256）。

容易写歪的地方：k 是严格小于 n 的最大 2 的幂，别把 n 本身当幂；一致性证明里 whole 只在
「整棵子树都属于老树、而且它就是最外面那棵」时才是 true，往右半边递归时必须转成 false；
m = n 的证明是空数组，别硬塞一个根进去；校验是「证明不多不少刚好用完」，多一个少一个都得 false，
所以要拿游标数着取；verify 只在参数形状不对时抛 ERR_BAD_ARGUMENT，值对不上是 false，
别把 false 写成异常。

跑法两条：npm test 全绿（13 条，里面有叶子与节点的哈希构造、append/appendAll/size/leafAt/root、
包含证明的形状、每棵子树每个下标都能验过、一致性证明的形状、日志自己的参数错误、包含证明篡改、
包含证明参数检查、m <= n 全组合验过、一致性篡改、m = n 与 m = 0 的口径、一致性参数检查、
100 条叶子的大日志抽查），npm run demo 的输出跟 README 最后贴的那段一行行对上。
