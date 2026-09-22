import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, TYPES } from '../lib/check.js';

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'SchemaError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('schema 写错一律抛 ERR_BAD_SCHEMA', () => {
  const bad = [
    null,
    'nope',
    [],
    {},
    { type: 'list' },
    { type: 'object', required: 'name' },
    { type: 'object', required: [''] },
    { type: 'object', properties: [] },
    { type: 'array', items: 'string' },
    { type: 'object', additionalProperties: 'no' },
    { type: 'string', enum: [] },
    { type: 'string', minLength: '2' },
    { type: 'number', maximum: Number.NaN },
  ];
  for (const schema of bad) expectError(() => validate(schema, {}), 'ERR_BAD_SCHEMA');
  assert.equal(TYPES.length, 7);
});

test('嵌套 schema 就算值里没这个字段也先查出来', () => {
  const schema = { type: 'object', properties: { age: { type: 'nope' } } };
  const err = expectError(() => validate(schema, {}), 'ERR_BAD_SCHEMA');
  assert.equal(err.details.path, 'age');
  const nested = { type: 'array', items: { type: 'object', properties: { id: {} } } };
  assert.equal(expectError(() => validate(nested, []), 'ERR_BAD_SCHEMA').details.path, '[0].id');
});

test('schema 合法但值不合法时不抛异常，只返回 errors', () => {
  const out = validate({ type: 'object', required: ['a'], properties: { a: { type: 'string' } } }, { a: 1 });
  assert.equal(out.valid, false);
  assert.deepEqual(out.errors.map((one) => one.code), ['type']);
});
