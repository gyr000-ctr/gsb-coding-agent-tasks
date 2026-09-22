// 校验器对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_JWK',
  'ERR_MALFORMED',
  'ERR_UNSUPPORTED_ALG',
  'ERR_KID_MISSING',
  'ERR_KID_UNKNOWN',
  'ERR_SIGNATURE',
  'ERR_EXPIRED',
  'ERR_NOT_YET_VALID',
  'ERR_TOKEN_TOO_OLD',
  'ERR_BAD_ISSUER',
  'ERR_BAD_AUDIENCE',
  'ERR_BAD_CLAIMS',
];

export class JwtError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'JwtError';
    this.code = code;
    this.details = details;
  }
}
