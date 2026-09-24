调度那边要个装箱的小工具：一堆有重量的件往固定容量的箱子里塞，想要 first-fit / best-fit / worst-fit /
best-fit-decreasing 四种经典挑法，还得能在只准开 N 个箱子的时候把塞不下的挑出来。环境里没有现成的，
自己写一份。

入口一个 packBins，README 的《口径》和《API》两节是标准答案：入参长什么样、返回的 bins 和 unplaced
怎么摆、四种算法各自怎么挑箱子、平手怎么比、什么时候才开新箱、best-fit-decreasing 怎么排序、
maxBins 卡住以后放不下的往哪儿去、两个错误码分别在什么时候抛、details 各带什么，都写死了，照着来。
目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/binpack.js，别的文件不动
（用例是标准，别改用例去迁就实现），也别引第三方包 —— 更不是让你按重量排个序糊过去，用例里既有写死的
期望箱子，也有跟朴素模型对拍、顺便检查结果是不是一个划分的。

容易写歪的地方：first-fit 是「第一个放得下的」，不是「剩余最少的」；best-fit 要比剩余、取最小的那个，
worst-fit 取最大的那个，剩余一样时这三者都取下标的——别写成取最后一个。一个现成的箱子都放不下才开新箱，
开出来的箱子不会变空，所以 bins 里没有空箱，下标从 0 连着来。best-fit-decreasing 只是先排个序再走
best-fit，别把它当成第四种挑法；排序要稳，一样重的保持原来的先后。maxBins 是卡箱数不是卡总重量：
已经开了 maxBins 个箱子、这件又哪儿都放不下，就进 unplaced，后面的件接着按原规则走，别提前收工。
校验别偷懒：capacity 得是正整数，maxBins 给了就得是正整数，items 里每件要是对象、id 是非空字符串
而且不许重复、weight 得是 1 到 capacity 的整数（比容量还重是入参错，不是塞进 unplaced），算法名不在这
四个里要单独报 ERR_BAD_ALGORITHM。

跑法两条：npm test 全绿（11 条，里面有四种算法的挑箱与平手、开新箱的时机、maxBins 与 unplaced、
入参校验与错误码，还有几百轮随机跟朴素模型对拍），npm run demo 的输出跟 README 最后贴的那段一行行对上。
