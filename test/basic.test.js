import test from 'node:test';
import assert from 'node:assert/strict';

import { createHll } from '../lib/hllset.js';
import { code, expectedSlot, nonzeroCount, values } from './util.js';

test('空集合：估计 0、寄存器全 0、还是稀疏表示', () => {
  const hll = createHll({ precision: 14 });
  assert.equal(hll.count(), 0);
  assert.equal(hll.representation(), 'sparse');
  const registers = hll.registers();
  assert.equal(registers.length, 2 ** 14);
  assert.equal(registers instanceof Uint8Array, true);
  assert.equal(nonzeroCount(registers), 0);
});

test('寄存器落位跟口径对得上（另写一份哈希核对）', () => {
  const hll = createHll({ precision: 14 });
  for (const value of ['alpha', 'beta', '', '用户-42']) hll.add(value);
  const registers = hll.registers();
  for (const value of ['alpha', 'beta', '', '用户-42']) {
    const { bucket, rank } = expectedSlot(value, 14);
    assert.equal(registers[bucket], rank, value);
  }
});

test('add 的返回值与幂等：同一个值加几遍寄存器不变', () => {
  const hll = createHll({ precision: 12 });
  const batch = values('k', 200);
  assert.equal(hll.add(batch[0]), 1);
  assert.equal(hll.add(batch[0]), 0);
  const reference = createHll({ precision: 12 });
  for (const value of batch) reference.add(value);
  for (let round = 0; round < 4; round += 1) {
    for (const value of batch) hll.add(value);
  }
  assert.deepEqual(hll.registers(), reference.registers());
  assert.equal(hll.count(), reference.count());
});

test('小集合估计得准，线性计数那一档也走通', () => {
  for (const size of [10, 100, 1000]) {
    const hll = createHll({ precision: 14 });
    for (const value of values('s', size)) hll.add(value);
    const estimate = hll.count();
    assert.ok(Math.abs(estimate - size) <= Math.max(2, Math.ceil(size * 0.02)),
      `${size} 估成了 ${estimate}`);
  }
});

test('大规模下误差在口径范围内', () => {
  const wide = createHll({ precision: 14 });
  for (const value of values('wide', 20000)) wide.add(value);
  const estimate = wide.count();
  assert.ok(Math.abs(estimate - 20000) / 20000 <= 0.02, `p=14 估成 ${estimate}`);

  const narrow = createHll({ precision: 10 });
  for (const value of values('narrow', 5000)) narrow.add(value);
  const small = narrow.count();
  assert.ok(Math.abs(small - 5000) / 5000 <= 0.06, `p=10 估成 ${small}`);
});

test('clone 出来的互不影响', () => {
  const hll = createHll({ precision: 8 });
  hll.add('one');
  const copy = hll.clone();
  copy.add('two');
  copy.add('three');
  assert.notEqual(copy.count(), hll.count());
  assert.equal(hll.count(), 1);
  assert.equal(hll.registers()[expectedSlot('two', 8).bucket], 0);
  assert.equal(copy.registers()[expectedSlot('two', 8).bucket], expectedSlot('two', 8).rank);
});

test('precision / sparseLimit / 入参的口径', () => {
  for (const precision of [4, 18]) assert.equal(createHll({ precision }).registers().length, 2 ** precision);
  for (const precision of [3, 19, 4.5, '14', true]) {
    assert.equal(code(() => createHll({ precision })), 'ERR_BAD_PRECISION');
  }
  for (const options of ['x', 7, [], true]) {
    assert.equal(code(() => createHll(options)), 'ERR_BAD_ARGUMENT');
  }
  for (const sparseLimit of [-1, 1.5, '3', true]) {
    assert.equal(code(() => createHll({ sparseLimit })), 'ERR_BAD_ARGUMENT');
  }
  const hll = createHll();
  for (const value of [7, null, undefined, {}, ['x']]) {
    assert.equal(code(() => hll.add(value)), 'ERR_BAD_ARGUMENT');
  }
});