状态机这块想自己写一份：状态树、初始链、历史状态、事件队列，退和进按什么顺序
发生都得一模一样地复现出来，后面拿它去跟同事手画的流程图对。

入口就 createMachine 和 run，README 的《口径》和《API》两节把机器定义长什么样、
构造时哪儿有问题报哪个码、退和进的顺序、keep 怎么取、when 怎么比、assign 什么时候写、
历史状态什么时候记什么时候用、内部事件队列怎么排都写死了，照着来。目录里 lib/errors.js、
test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/stateflow.js，别的文件别动，
也别引第三方包。

最容易写歪的是顺序。一条转换先把 source 和 target 最近公共祖先的父状态当 keep，
退出的时候凡是不等于 keep 的状态从内到外退掉，assign 在这之后才写，然后才从外到内
把 target 那一条进回来，最后顺着 initial 走到叶子。自转换（running 上 RESTART 又指回
running）的 keep 是它的父状态，所以它自己也得退出去再进来一次，等于重走初始链——
除非那条转换写了 viaHistory，那就要吃历史里记下的那片叶子，不走 initial。这些在 demo
的输出里一行一行都能对上。

还有队列：raise 排进去的内部事件，下一次 send 得先按 FIFO 清完，再处理传进来的那个
外部事件，中间新排进来的接着往后排；handled 要把这一轮处理过的事件名按顺序列出来，
没命中的也算处理过。一轮里处理太多（超过 DEFAULTS.maxSteps）直接报 ERR_TOO_MANY_EVENTS，
别让它自己喂自己转到天荒地老。

跑法两条：npm test 全绿（11 条，里面有初始链、退进的顺序、祖先上命中的转换、进了 final
之后还能不能走、同事件多条转换按顺序挑 when、assign 的时机、viaHistory 和自转换的区别、
队列排在外部事件前面、超上限报错、run 串一串，还有一堆定义和事件名的错误码），
npm run demo 的输出跟 README 最后贴的那段一行行对上。
