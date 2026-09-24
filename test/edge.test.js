import test from 'node:test';
import assert from 'node:assert/strict';

import { createSheet } from '../lib/gridfit.js';
import { code } from './util.js';

test('循环引用：环上的和依赖环的都是 #CYCLE!，拆掉环能自己好', () => {
  const sheet = createSheet({
    A1: '=B1', B1: '=A1',
    C1: '=A1+1', D1: '=C1',
    E1: '=E1', F1: '=E1',
    I1: '=J1', J1: '=K1', K1: '=I1',
    G1: '1', H1: '=G1+1',
  });
  for (const address of ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'I1', 'J1', 'K1']) {
    assert.equal(sheet.value(address), '#CYCLE!', address);
  }
  assert.equal(sheet.value('G1'), 1);
  assert.equal(sheet.value('H1'), 2);
  sheet.set('B1', '5');
  assert.equal(sheet.value('A1'), 5);
  assert.equal(sheet.value('B1'), 5);
  assert.equal(sheet.value('C1'), 6);
  assert.equal(sheet.value('D1'), 6);
  assert.equal(sheet.value('E1'), '#CYCLE!');
  sheet.set('E1', '3');
  assert.equal(sheet.value('E1'), 3);
  assert.equal(sheet.value('F1'), 3);
});

test('错误值清单', () => {
  const sheet = createSheet({
    A1: '1', A2: '2',
    B1: '=1+', B2: '=(', B3: '=@', B4: '=A1:A', B5: '=NOPE()', B6: '=nope(1)',
    B7: '=ZZZ1', B8: '=ZZZ1:ZZZ2', B9: '=A1:ZZZ5', B10: '="a"-1',
    B11: '=A1:A2+1', B12: '=SUM("x")', B13: '=LEN(A1:A2)', B14: '=1/0',
    B15: '=AVERAGE(A1:A2)', B16: '=SUM(A1,NOPE())', B17: '=1/0+NOPE()',
    B18: '=SUM(A1:A2)', B19: '=A1+A2', B20: '=#VALUE!',
  });
  assert.equal(sheet.value('B1'), '#ERROR!');
  assert.equal(sheet.value('B2'), '#ERROR!');
  assert.equal(sheet.value('B3'), '#ERROR!');
  assert.equal(sheet.value('B4'), '#ERROR!');
  assert.equal(sheet.value('B5'), '#NAME?');
  assert.equal(sheet.value('B6'), '#NAME?');
  assert.equal(sheet.value('B7'), '#REF!');
  assert.equal(sheet.value('B8'), '#REF!');
  assert.equal(sheet.value('B9'), '#REF!');
  assert.equal(sheet.value('B10'), '#VALUE!');
  assert.equal(sheet.value('B11'), '#VALUE!');
  assert.equal(sheet.value('B12'), '#VALUE!');
  assert.equal(sheet.value('B13'), '#VALUE!');
  assert.equal(sheet.value('B14'), '#DIV/0!');
  assert.equal(sheet.value('B15'), 1.5);
  assert.equal(sheet.value('B16'), '#NAME?');
  assert.equal(sheet.value('B17'), '#DIV/0!');
  assert.equal(sheet.value('B18'), 3);
  assert.equal(sheet.value('B19'), 3);
  assert.equal(sheet.value('B20'), '#ERROR!');
});

test('地址校验与入参检查', () => {
  for (const cells of ['x', 7, null, []]) {
    assert.equal(code(() => createSheet(cells)), 'ERR_BAD_ARGUMENT');
  }
  assert.equal(code(() => createSheet({ A1: 1 })), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => createSheet({ A1: null })), 'ERR_BAD_ARGUMENT');
  assert.deepEqual(createSheet().snapshot(), {});

  const sheet = createSheet({ A1: '1' });
  for (const address of ['A0', '1', 'A', 'A1B', 'AAA1', 'A1000', '', 'a-1', 'A 1']) {
    assert.equal(code(() => sheet.value(address)), 'ERR_BAD_ADDRESS', `地址 ${address}`);
    assert.equal(code(() => sheet.get(address)), 'ERR_BAD_ADDRESS', `地址 ${address}`);
    assert.equal(code(() => sheet.set(address, '1')), 'ERR_BAD_ADDRESS', `地址 ${address}`);
    assert.equal(code(() => sheet.clear(address)), 'ERR_BAD_ADDRESS', `地址 ${address}`);
  }
  for (const address of [null, 7, undefined, {}, []]) {
    assert.equal(code(() => sheet.value(address)), 'ERR_BAD_ADDRESS');
  }
  assert.equal(code(() => sheet.set('A1', 5)), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => sheet.set('A1', null)), 'ERR_BAD_ARGUMENT');
  assert.equal(sheet.value('a1'), 1);
  assert.equal(sheet.value('ZZ999'), null);
  assert.equal(sheet.value('$A$1'), 1);
  assert.equal(createSheet({ B2: 'ok' }).value('B2'), 'ok');
});

test('addresses / snapshot 的规范顺序与大小写', () => {
  const sheet = createSheet();
  sheet.set('b1', '2').set('A2', '1').set('A10', '=A2+2').set('AA1', '4').set('zz999', '5');
  assert.deepEqual(sheet.addresses(), ['A2', 'A10', 'B1', 'AA1', 'ZZ999']);
  assert.deepEqual(Object.keys(sheet.snapshot()), ['A2', 'A10', 'B1', 'AA1', 'ZZ999']);
  assert.deepEqual(sheet.snapshot(), { A2: 1, A10: 3, B1: 2, AA1: 4, ZZ999: 5 });
  assert.equal(sheet.get('b1'), '2');
  assert.equal(sheet.get('A10'), '=A2+2');
  sheet.clear('A10');
  assert.deepEqual(sheet.addresses(), ['A2', 'B1', 'AA1', 'ZZ999']);
  assert.equal(sheet.snapshot().A10, undefined);
  assert.equal(sheet.get('A10'), '');
  assert.equal(sheet.value('A10'), null);
});

test('长依赖链与整片区间', () => {
  const chain = {};
  for (let row = 1; row <= 999; row += 1) {
    chain[`A${row}`] = row === 999 ? '1' : `=A${row + 1}+1`;
  }
  const sheet = createSheet(chain);
  assert.equal(sheet.value('A1'), 999);
  assert.equal(sheet.addresses().length, 999);
  sheet.set('A999', '10');
  assert.equal(sheet.value('A1'), 1008);

  const letters = (index) => String.fromCharCode(64 + index);
  const wide = {};
  for (let column = 1; column <= 26; column += 1) {
    for (let row = 1; row <= 20; row += 1) wide[`${letters(column)}${row}`] = String(row);
  }
  wide.AB1 = '=SUM(A1:Z20)';
  wide.AB2 = '=COUNT(A1:Z20)';
  wide.AB3 = '=AVERAGE(A1:Z20)';
  const area = createSheet(wide);
  assert.equal(area.value('AB1'), 5460);
  assert.equal(area.value('AB2'), 520);
  assert.equal(area.value('AB3'), 10.5);
  assert.deepEqual(area.snapshot().AB1, 5460);
});
