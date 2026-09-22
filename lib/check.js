// 轻量 JSON 校验。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/check|schema）、演示脚本（scripts/demo.mjs）、
// 错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节写好了。
// 那些约定不要改，把这里补出来。

export const TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'any'];

export const ERROR_CODES = [
  'required',
  'type',
  'enum',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'unexpected',
];

const NOT_IMPLEMENTED = 'lib/check.js 还没实现，口径见 README 的《口径》和《API》';

export function validate(schema, value) {
  void schema;
  void value;
  throw new Error(NOT_IMPLEMENTED);
}
