// 分词这边对外只抛这一个错误类型（入参不对）；输入里的毛病走 errors 数组，按 code 分流。
export const CODES = [
  'ERR_BAD_ARGUMENT',
];

// tokenize 返回的 errors[].code 只会有这些
export const TOKENIZER_ERRORS = [
  'unexpected-null-character',
  'invalid-first-character-of-tag-name',
  'eof-in-tag',
  'eof-in-comment',
  'eof-in-doctype',
  'eof-in-cdata',
  'missing-end-tag-name',
  'unexpected-question-mark-instead-of-tag-name',
  'incorrectly-opened-comment',
  'abrupt-closing-of-empty-comment',
  'unexpected-equals-sign-before-attribute-name',
  'duplicate-attribute',
  'missing-whitespace-between-attributes',
  'unexpected-solidus-in-tag',
  'missing-attribute-value',
  'unexpected-character-in-unquoted-attribute-value',
  'invalid-character-reference',
  'null-character-reference',
  'character-reference-outside-unicode-range',
];

export class HtmlError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'HtmlError';
    this.code = code;
    this.details = details;
  }
}
