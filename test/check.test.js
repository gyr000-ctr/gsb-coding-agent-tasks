import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, ERROR_CODES } from '../lib/check.js';

const profile = {
  type: 'object',
  required: ['name', 'age'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 8 },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    plan: { type: 'string', enum: ['free', 'pro'] },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

const codes = (out) => out.errors.map((one) => `${one.path}:${one.code}`);

test('合法的数据一条错都没有', () => {
  const out = validate(profile, { name: 'an', age: 0, plan: 'pro', tags: ['a', 'b'] });
  assert.deepEqual(out, { valid: true, errors: [] });
  assert.equal(validate(profile, { name: 'ab', age: 150 }).valid, true);
});

test('类型不对只报一条，不再往下钻', () => {
  const out = validate(profile, { name: 'an', age: 'old' });
  assert.equal(out.valid, false);
  assert.deepEqual(codes(out), ['age:type']);
  assert.equal(out.errors[0].message.includes('integer'), true);
  const root = validate({ type: 'object' }, 'nope');
  assert.deepEqual(root.errors.map((one) => one.path), ['']);
});

test('缺字段按 required 的顺序报，路径写全', () => {
  const schema = {
    type: 'object',
    required: ['name', 'age'],
    properties: { name: { type: 'string' }, age: { type: 'number' } },
  };
  assert.deepEqual(codes(validate(schema, {})), ['name:required', 'age:required']);
  assert.deepEqual(codes(validate(schema, { age: 1 })), ['name:required']);
});

test('多出来的字段按值里出现的顺序报', () => {
  const out = validate(profile, { name: 'an', age: 1, extra: 1, other: 2 });
  assert.deepEqual(codes(out), ['extra:unexpected', 'other:unexpected']);
});

test('长度、范围、枚举都卡在边界上', () => {
  const short = validate(profile, { name: 'a', age: 1 });
  assert.deepEqual(codes(short), ['name:minLength']);
  const long = validate(profile, { name: 'abcdefghi', age: 1 });
  assert.deepEqual(codes(long), ['name:maxLength']);
  const low = validate(profile, { name: 'an', age: -1 });
  assert.deepEqual(codes(low), ['age:minimum']);
  const high = validate(profile, { name: 'an', age: 151 });
  assert.deepEqual(codes(high), ['age:maximum']);
  const wrongPlan = validate(profile, { name: 'an', age: 1, plan: 'PRO' });
  assert.deepEqual(codes(wrongPlan), ['plan:enum']);
});

test('同一个值可以同时踩好几条，顺序是 enum 在长度前面', () => {
  const schema = { type: 'string', enum: ['aa', 'bb'], minLength: 5 };
  assert.deepEqual(codes(validate(schema, 'cc')), [':enum', ':minLength']);
});

test('整数和数字分得开，数组按索引报路径', () => {
  assert.deepEqual(codes(validate({ type: 'integer' }, 1.5)), [':type']);
  assert.equal(validate({ type: 'number' }, 1.5).valid, true);
  const schema = {
    type: 'array',
    items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
  };
  assert.deepEqual(codes(validate(schema, [{ id: 'a' }, { name: 'b' }])), ['[1].id:required']);
  assert.deepEqual(codes(validate(schema, [{ id: 1 }])), ['[0].id:type']);
  assert.deepEqual(codes(validate({ type: 'array' }, 'nope')), [':type']);
});

test('any 只做别的检查，其它类型照查', () => {
  assert.equal(validate({ type: 'any' }, { whatever: true }).valid, true);
  assert.deepEqual(codes(validate({ type: 'any', enum: [1, 'x'] }, 2)), [':enum']);
  assert.deepEqual(codes(validate({ type: 'any', minimum: 10 }, 5)), [':minimum']);
});

test('只用这几种错误码', () => {
  const out = validate(profile, { name: 'a', age: -1, plan: 'PRO', extra: 1 });
  for (const error of out.errors) assert.equal(ERROR_CODES.includes(error.code), true, error.code);
  assert.equal(out.errors.every((one) => typeof one.message === 'string' && one.message !== ''), true);
});
