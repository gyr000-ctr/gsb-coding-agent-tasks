// 校验器只在这一个时候抛异常：schema 本身写错了。
export const CODES = [
  'ERR_BAD_SCHEMA',
];

export class SchemaError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SchemaError';
    this.code = code;
    this.details = details;
  }
}
