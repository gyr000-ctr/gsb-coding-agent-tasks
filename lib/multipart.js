// multipart/form-data 的流式解析（RFC 7578 + RFC 2046 的一个子集）。
//
// 这个文件是仓库里唯一还没实现的部分：上传服务（lib/server.js）、测试（test/）
// 和演示脚本（scripts/demo.mjs）都已经按 README 的《口径》和《API》两节写好了。
// 那些约定不要改，把这里补出来。
//
// 事件顺序固定为： part -> data* -> partEnd -> (part -> data* -> partEnd)* -> end
// 出错时打破上面的顺序，改为发一次 reject，之后本实例不再产生任何事件。

import { EventEmitter } from 'node:events';
import { MultipartError } from './errors.js';

export const DEFAULTS = Object.freeze({
  maxPartBytes: 1024 * 1024,      // 单个 part 的内容上限
  maxTotalBytes: 8 * 1024 * 1024, // 整个 body 里所有 part 内容加起来的上限
  maxHeaderBytes: 16 * 1024,      // 单个 part 的 header 段上限
});

const NOT_IMPLEMENTED = 'lib/multipart.js 还没实现，口径见 README 的《口径》和《API》';

export function parseContentType(value) {
  throw new Error(NOT_IMPLEMENTED);
}

export class MultipartParser extends EventEmitter {
  constructor(contentType, options = {}) {
    super();
    throw new Error(NOT_IMPLEMENTED);
  }
}
