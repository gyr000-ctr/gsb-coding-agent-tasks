import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoller } from '../lib/roll.js';
import { BUCKETS, hash32 } from '../lib/hash.js';

const roller = (extra = {}) => createRoller({ salt: 'v1', ...extra });
const bucketOf = (salt, ruleId, userId) => hash32(`${salt}:${ruleId}:${userId}`) % BUCKETS;

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'RolloutError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('命中规则就是 enabled，桶号按 salt+规则+用户 算', () => {
  const out = roller().roll([{ id: 'r1', when: { plan: 'pro' } }], { id: 'u1', plan: 'pro' });
  assert.equal(out.enabled, true);
  assert.equal(out.rule, 'r1');
  assert.equal(out.bucket, bucketOf('v1', 'r1', 'u1'));
  assert.deepEqual(roller().roll([{ id: 'r1', when: { plan: 'pro' } }], { id: 'u1', plan: 'pro' }), out);
});

test('规则从上往下匹配，先命中的算数', () => {
  const rules = [
    { id: 'first', when: { plan: 'team' } },
    { id: 'second', when: { plan: 'pro' }, percent: 50 },
    { id: 'fallback' },
  ];
  assert.equal(roller().roll(rules, { id: 'u1', plan: 'pro' }).rule, 'second');
  assert.equal(roller().roll(rules, { id: 'u1', plan: 'free' }).rule, 'fallback');
});

test('一条都不匹配时什么都不给', () => {
  const out = roller().roll([{ id: 'r1', when: { plan: 'pro' } }], { id: 'u1', plan: 'free' });
  assert.deepEqual(out, { enabled: false, variant: null, rule: null, bucket: null });
});

test('when 支持数组（在名单里）和兜底空 when', () => {
  const rules = [{ id: 'r1', when: { country: ['cn', 'sg'] } }, { id: 'r2' }];
  assert.equal(roller().roll(rules, { id: 'u1', country: 'sg' }).rule, 'r1');
  assert.equal(roller().roll(rules, { id: 'u1', country: 'us' }).rule, 'r2');
  assert.equal(roller().roll(rules, { id: 'u1' }).rule, 'r2');
});

test('percent 决定进不进灰度，但命中规则本身照报', () => {
  const rules = [{ id: 'r1', percent: 0 }];
  const out = roller().roll(rules, { id: 'u1' });
  assert.equal(out.enabled, false);
  assert.equal(out.rule, 'r1');
  assert.equal(out.bucket, bucketOf('v1', 'r1', 'u1'));
  const full = roller().roll([{ id: 'r1', percent: 100 }], { id: 'u1' });
  assert.equal(full.enabled, true);
});

test('variants 在灰度那一段里按顺序切', () => {
  const rules = [
    { id: 'r1', percent: 100, variants: [{ name: 'a', percent: 30 }, { name: 'b', percent: 20 }] },
  ];
  for (let index = 0; index < 200; index++) {
    const id = `u${index}`;
    const bucket = bucketOf('v1', 'r1', id);
    const expected = bucket < 30 ? 'a' : bucket < 50 ? 'b' : null;
    assert.equal(roller().roll(rules, { id }).variant, expected, `${id} bucket=${bucket}`);
  }
  const half = roller().roll([{ id: 'r2', percent: 0, variants: [{ name: 'a', percent: 30 }] }], { id: 'u1' });
  assert.equal(half.variant, null);
});

test('换 salt 会把桶打散', () => {
  const rules = [{ id: 'r1' }];
  const before = [];
  const after = [];
  for (let index = 0; index < 100; index++) {
    const user = { id: `u${index}` };
    before.push(roller().roll(rules, user).bucket);
    after.push(roller({ salt: 'v2' }).roll(rules, user).bucket);
  }
  assert.notDeepEqual(before, after);
  assert.equal(roller().salt(), 'v1');
});

test('user 不合法就报 ERR_BAD_USER', () => {
  expectError(() => roller().roll([], null), 'ERR_BAD_USER');
  expectError(() => roller().roll([], { id: '' }), 'ERR_BAD_USER');
  expectError(() => roller().roll([], { id: 12 }), 'ERR_BAD_USER');
});
