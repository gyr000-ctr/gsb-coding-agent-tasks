调用第三方接口老是抖，想在网关里放一套统一的重试判断：这次失败要不要再试、等多久再试。

入口一个 createRetryPolicy，README 的《口径》和《API》两节把配置怎么校验、next 的判断顺序、指数退避怎么算、Retry-After 怎么优先、抖动什么时候加、reason 有哪几种、每种错误报哪个码都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/retry.js，别的文件别动，也别引第三方包。

判断顺序不能乱：先看这次错误本身能不能重试（retryable 为 false 就直接不重试，跟试了几次无关），再看次数用完没有，然后才轮到 Retry-After，最后才是指数退避。Retry-After 优先但仍受 maxDelayMs 封顶；抖动要在延迟算完之后再乘，抖完不能超过原来的值。

随机数要能注入（random），方便测试；jitter 是 none 的时候根本不该调用 random。attempt 从 1 开始，不是正整数就当坏请求；延迟和次数必须是可以判定的整数，别出现负数或者 NaN。

跑法两条：npm test 全绿（11 条，里面有退避翻倍与封顶、Retry-After 优先与截断、retryable 优先级、full jitter 的边界、random 不被调用），npm run demo 的输出跟 README 最后贴的那段一行行对上。
