上传接口那块 body 解析是之前拿正则硬凑的，我要在 formweave 这个仓库里自己重写一个。

服务端是 node:http，不加任何三方包。lib/server.js、lib/errors.js、test 下的用例和
scripts/demo.mjs 都已经写好了，就差 lib/multipart.js 里的 parseContentType 和
MultipartParser。README 的口径把分隔符写法、header 段规则、content-disposition 参数、
三个上限、未决字节的额度、每种情况报哪个错误码都写死了，事件顺序和 info 的形状在API那一节，
照那个来。这些约定和别的文件都别改，package.json 也保持原样。

还有几个点：拒绝之后服务端要先把剩下的请求体读完再回错误码，不然客户端只会看到连接被重置，
看不到我们的 413；客户端传到一半断开不能把服务挂掉；两个内容上限同时到线的报
PART_TOO_LARGE；内容里的字节一个都不能动，中文、二进制、单独的 CR 和 LF 都得原样交出来。

跑法两条：npm test 全绿（21 条，里面有真起一个服务、把请求切成单个字节发过来、还有一条故意
发到一半就断开的）；npm run demo 的输出跟 README 最后贴的那段逐行对上。
