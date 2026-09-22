import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoller } from '../lib/roll.js';

const roller = () => createRoller({ salt: 'v1' });

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

test('空的规则列表也能跑，只是什么都不命中', () => {
  assert.deepEqual(roller().roll([], { id: 'u1' }), { enabled: false, variant: null, rule: null, bucket: null });
});

test('配置不合法就报 ERR_BAD_CONFIG', () => {
  expectError(() => createRoller(null), 'ERR_BAD_CONFIG');
  expectError(() => createRoller({ salt: '' }), 'ERR_BAD_CONFIG');
  expectError(() => createRoller({ salt: 7 }), 'ERR_BAD_CONFIG');
});

test('规则写错就报 ERR_BAD_RULES', () => {
  const bad = [
    'nope',
    [null],
    [{ when: {} }],
    [{ id: '' }],
    [{ id: 'dup' }, { id: 'dup' }],
    [{ id: 'r1', percent: 101 }],
    [{ id: 'r1', percent: 12.5 }],
    [{ id: 'r1', percent: -1 }],
    [{ id: 'r1', when: 'plan=pro' }],
    [{ id: 'r1', when: { plan: { nested: true } } }],
    [{ id: 'r1', when: { plan: [] } }],
    [{ id: 'r1', variants: [] }],
    [{ id: 'r1', variants: [{ name: 'a', percent: 10 }, { name: 'a', percent: 10 }] }],
    [{ id: 'r1', variants: [{ name: '', percent: 10 }] }],
    [{ id: 'r1', variants: [{ name: 'a', percent: -1 }] }],
    [{ id: 'r1', variants: [{ name: 'a', percent: 1.5 }] }],
  ];
  for (const rules of bad) {
    expectError(() => roller().roll(rules, { id: 'u1' }), 'ERR_BAD_RULES');
  }
});

test('null 和布尔这种原始值可以当匹配条件', () => {
  const rules = [{ id: 'r1', when: { beta: true, tier: null } }];
  assert.equal(roller().roll(rules, { id: 'u1', beta: true, tier: null }).rule, 'r1');
  assert.equal(roller().roll(rules, { id: 'u1', beta: true, tier: 'gold' }).rule, null);
});
