import test from 'node:test';
import assert from 'node:assert/strict';

import { createHll } from '../lib/hllset.js';
import { code, nonzeroCount, values } from './util.js';

const build = (precision, list, sparseLimit) => {
  const hll = createHll({ precision, sparseLimit });
  for (const value of list) hll.add(value);
  return hll;
};

test('合并就是逐桶取大，等价于把所有值加一遍', () => {
  const left = values('l', 300);
  const right = values('r', 300);
  const merged = build(12, left);
  assert.equal(merged.merge(build(12, right)), 1);
  assert.deepEqual(merged.registers(), build(12, [...left, ...right]).registers());
  assert.equal(merged.count(), build(12, [...left, ...right]).count());
});

test('合并的返回值：没变化就是 0', () => {
  const all = values('x', 200);
  const target = build(12, all);
  assert.equal(target.merge(build(12, all.slice(0, 50))), 0);
  assert.equal(target.merge(build(12, ['brand-new-value'])), 1);
});

test('精度不一样 / 传进来的不是 Hll 都要报', () => {
  const hll = createHll({ precision: 12 });
  assert.equal(code(() => hll.merge(createHll({ precision: 13 }))), 'ERR_PRECISION_MISMATCH');
  for (const other of [null, 7, 'x', {}, []]) {
    assert.equal(code(() => hll.merge(other)), 'ERR_BAD_ARGUMENT');
  }
});

test('稀疏到稠密：越过 sparseLimit 那一刻就换，换完值一个不丢', () => {
  const hll = createHll({ precision: 4, sparseLimit: 3 });
  assert.equal(hll.representation(), 'sparse');
  let denseRegisters = null;
  for (const value of values('flip', 200)) {
    hll.add(value);
    const registers = hll.registers();
    const expected = nonzeroCount(registers) > 3 ? 'dense' : 'sparse';
    assert.equal(hll.representation(), expected);
    if (expected === 'dense') {
      denseRegisters = registers;
      break;
    }
  }
  assert.notEqual(denseRegisters, null);
  assert.deepEqual(hll.registers(), denseRegisters);
  assert.equal(hll.representation(), 'dense');
});

test('转过稠密就不会退回稀疏了，合并也一样', () => {
  const dense = createHll({ precision: 4, sparseLimit: 2 });
  for (const value of values('d', 100)) dense.add(value);
  assert.equal(dense.representation(), 'dense');
  dense.merge(createHll({ precision: 4, sparseLimit: 2 }));
  assert.equal(dense.representation(), 'dense');

  const sparse = createHll({ precision: 10, sparseLimit: 50 });
  for (const value of values('few', 5)) sparse.add(value);
  assert.equal(sparse.representation(), 'sparse');
  const heavy = build(10, values('e', 400), 50);
  assert.equal(heavy.representation(), 'dense');
  assert.equal(sparse.merge(heavy), 1);
  assert.equal(sparse.representation(), 'dense');
  assert.deepEqual(sparse.registers(), (() => {
    const all = createHll({ precision: 10, sparseLimit: 50 });
    for (const value of [...values('few', 5), ...values('e', 400)]) all.add(value);
    return all.registers();
  })());
});

test('分批合并和一次性加完结果一样', () => {
  const every = values('batch', 10000);
  const oneShot = build(14, every);
  const chunked = createHll({ precision: 14 });
  for (let start = 0; start < every.length; start += 1000) {
    chunked.merge(build(14, every.slice(start, start + 1000)));
  }
  assert.deepEqual(chunked.registers(), oneShot.registers());
  assert.equal(chunked.count(), oneShot.count());
});