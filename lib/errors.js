// 解析失败时统一用 MultipartError 上报：错误码 -> 错误码 -> HTTP 状态码的对应关系在这里定死，
// 上传服务（lib/server.js）直接拿 err.status 当响应码，调用方不要去猜。

export const ERROR_STATUS = Object.freeze({
  MALFORMED_CONTENT_TYPE: 400,
  MALFORMED_HEADERS: 400,
  MALFORMED_BODY: 400,
  UNEXPECTED_EOF: 400,
  PART_TOO_LARGE: 413,
  TOTAL_TOO_LARGE: 413,
});

export class MultipartError extends Error {
  constructor(code, message, details = {}) {
    if (!Object.hasOwn(ERROR_STATUS, code)) {
      throw new TypeError(`未知的 multipart 错误码: ${code}`);
    }
    super(message);
    this.name = 'MultipartError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (details.partIndex !== undefined) this.partIndex = details.partIndex;
    if (details.offset !== undefined) this.offset = details.offset;
  }
}
