我们的 Node 服务没有框架，路由和参数校验全是手写的 if，方法不对还返回 404、大 body 也能灌进来，想在这仓库里写一层入口网关。

入口一个 createGateway，README 的《口径》和《API》两节把注册路由的校验、匹配规则、静态段优先、404/405/413/415/400/401 的判断顺序、handler 的入参与返回值、统计口径、每种错误报哪个码都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/gateway.js，别的文件别动，也别引第三方包。

顺序不能乱：先匹配路径（没有就 404），再看方法（不在就 405 并且给出 allow），然后才是 body 大小、content-type、JSON 解析、必填头，这几步没过 handler 一次都不能被调用。body 为空的时候不要因为没带 content-type 就拒掉。

匹配上要稳：路径按段比，静态段优先于参数段，参数段取到的值放进 params 给 handler；handler 拿到的 headers 键统一小写，返回对象时自动补 content-type，抛异常统一 500 并记一次 errors（别算进 rejected）。

跑法两条：npm test 全绿（13 条，里面有路径参数与静态优先、404/405+Allow、body 上限、content-type 与坏 JSON、必填头、handler 抛异常、统计各项），npm run demo 的输出跟 README 最后贴的那段一行行对上。
