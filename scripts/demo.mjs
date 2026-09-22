import { validate } from '../lib/check.js';

const schema = {
  type: 'object',
  required: ['name', 'age'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 8 },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    plan: { type: 'string', enum: ['free', 'pro'] },
    items: {
      type: 'array',
      items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  },
};

const show = (value) => {
  const out = validate(schema, value);
  if (out.valid) return 'valid';
  return out.errors.map((one) => `${one.path}:${one.code}`).join(' ');
};

console.log('fieldcheck demo');

console.log('[1] 一份合法的数据');
console.log(`    ${show({ name: 'an', age: 30, plan: 'pro', items: [{ id: 'a' }] })}`);

console.log('[2] 缺字段和类型不对');
console.log(`    ${show({ age: 'old' })}`);

console.log('[3] 数组里第几个元素错了');
console.log(`    ${show({ name: 'an', age: 30, items: [{ id: 'a' }, { id: 2 }] })}`);

console.log('[4] 范围和枚举都卡边界');
console.log(`    ${show({ name: 'an', age: -1, plan: 'PRO' })}`);

console.log('[5] 多出来的字段');
console.log(`    ${show({ name: 'an', age: 30, extra: 1, other: 2 })}`);

console.log('[6] schema 自己写错就抛异常');
try {
  validate({ type: 'object', properties: { age: { type: 'nope' } } }, {});
} catch (err) {
  console.log(`    ${err.code} path=${err.details.path}`);
}
