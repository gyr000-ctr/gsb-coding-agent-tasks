网关要对接一套对象存储，人家的鉴权是按 SigV4 算的：每个请求都得把方法、路径、查询串、
参与签名的头、载荷摘要拼成规范请求，派生密钥算出签名塞进 Authorization，网关自己也要
能反过来验客户端递上来的签名，还要能给前端发预签名下载 URL。现在这块是空的，想在这仓库里
把签名器补出来。

入口一个 createSigner，README 的《口径》和《API》两节把编码口径、要签哪些头、规范请求
怎么拼、密钥怎么派、Authorization 长什么样、预签名的参数和过期怎么算、每种错误报哪个码
都写死了，照着来。目录里 lib/encode.js、lib/errors.js、test 下三组用例、scripts/demo.mjs
都已经写好，就差 lib/signer.js，别的文件别动，也别引第三方包。

规范化必须两边算出来一模一样，差一个字节签名就废：路径要先解一次转义
再按段重编码（不能编两遍），查询串按键再按值排序，头部名小写、值去空白并把中间连续空白
压成一个空格，同名头合并成一行，host 不管调用方给没给都要签进去。

签进去的头也定死了：authorization、content-length、user-agent 这类传输层会改的头一个都不能签，
调用方还能再指定几个不签；反过来请求头里给了 x-amz-content-sha256 就得用它，不能被 body 覆盖。
时钟必须由 clock 注入来做，签名时间一律现算，调用方传的 x-amz-date 不算数，不然重放和偏移都测不了。

校验这块要求同样死：头签名和预签名两种方式只能出现一种；凭证里的 access key、region、service
都要对上；签名头里必须同时有 host 和 x-amz-date；头签名的时间偏移超过 skewMs 就拒；带了
x-amz-content-sha256 的要先拿 body 复核摘要；预签名只认 X-Amz-Expires 判过期，签完再往 URL 上
挂参数就得验不过。签名比对别用字符串 ===，要按字节安全比较。

跑法两条：npm test 全绿（30 条，里面有官方 get-vanilla 向量、绕回编码、预签名过期边界和
各种错误码），npm run demo 的输出跟 README 最后贴的那段一行行对上。
