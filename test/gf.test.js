import test from 'node:test';
import assert from 'node:assert/strict';

import { gfDiv, gfMul, gfPow } from '../lib/rscodec.js';
import { code, mulberry32 } from './util.js';

test('GF(256) 的已知值', () => {
  assert.equal(gfPow(2, 0), 1);
  assert.equal(gfPow(2, 8), 0x1d);
  assert.equal(gfMul(2, 0x80), 0x1d);
  assert.equal(gfPow(2, 255), 1);
  assert.equal(gfPow(2, 256), 2);
  assert.equal(gfPow(0, 0), 1);
  assert.equal(gfPow(0, 5), 0);
  assert.equal(gfPow(5, 0), 1);
  assert.equal(gfMul(0, 5), 0);
  assert.equal(gfMul(5, 0), 0);
  assert.equal(gfMul(1, 5), 5);
  assert.equal(gfMul(5, 1), 5);
  assert.equal(gfDiv(0, 5), 0);
  assert.equal(gfDiv(5, 1), 5);
  assert.equal(code(() => gfDiv(5, 0)), 'ERR_BAD_ARGUMENT');
});

test('每个非零元都有逆元', () => {
  for (let value = 1; value < 256; value += 1) {
    const inverse = gfDiv(1, value);
    assert.equal(gfMul(value, inverse), 1, `${value} 的逆元不对`);
    assert.equal(gfMul(inverse, value), 1, `${value} 的逆元反着乘也不对`);
  }
});

test('交换律、分配律、结合律', () => {
  for (let left = 0; left < 256; left += 1) {
    for (let right = 0; right < 256; right += 1) {
      assert.equal(gfMul(left, right), gfMul(right, left));
    }
  }
  for (let left = 0; left < 256; left += 1) {
    for (let right = 0; right < 256; right += 1) {
      for (let third = 0; third < 256; third += 7) {
        assert.equal(gfMul(left, right ^ third), gfMul(left, right) ^ gfMul(left, third), '分配律不对');
      }
    }
  }
  const random = mulberry32(20260924);
  for (let round = 0; round < 4000; round += 1) {
    const a = Math.floor(random() * 256);
    const b = Math.floor(random() * 256);
    const c = Math.floor(random() * 256);
    assert.equal(gfMul(gfMul(a, b), c), gfMul(a, gfMul(b, c)));
  }
});
