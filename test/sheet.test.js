import test from 'node:test';
import assert from 'node:assert/strict';

import { createSheet } from '../lib/gridfit.js';
import { values } from './util.js';

test('字面量怎么定型', () => {
  const sheet = createSheet({
    A1: '12', A2: '  12  ', A3: '1.5', A4: '.5', A5: '-3', A6: '1e3',
    B1: 'TRUE', B2: 'true', B3: 'False', B4: 'hello', B5: ' 3x ', B6: '   ',
  });
  assert.equal(sheet.value('A1'), 12);
  assert.equal(sheet.value('A2'), 12);
  assert.equal(sheet.value('A3'), 1.5);
  assert.equal(sheet.value('A4'), 0.5);
  assert.equal(sheet.value('A5'), -3);
  assert.equal(sheet.value('A6'), 1000);
  assert.equal(sheet.value('B1'), true);
  assert.equal(sheet.value('B2'), true);
  assert.equal(sheet.value('B3'), false);
  assert.equal(sheet.value('B4'), 'hello');
  assert.equal(sheet.value('B5'), '3x');
  assert.equal(sheet.value('B6'), null);
  assert.equal(sheet.value('Z9'), null);
  assert.equal(sheet.get('B5'), ' 3x ');
  assert.equal(sheet.get('Z9'), '');
  assert.deepEqual(sheet.addresses(), [
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
  ]);
});

test('算术、优先级与引用', () => {
  const sheet = createSheet({
    A1: '2', A2: '3',
    B1: '=A1+A2*2', B2: '=(A1+A2)*2', B3: '=-A1', B4: '=A1/A2', B5: '=10/4',
    B6: '=Z9+1', B7: '="1"+1', B8: '=TRUE+1', B9: '=FALSE+1', B10: '=1/0',
    B11: '=1-2-3', B12: '=8/4/2', B13: '=+A1',
  });
  assert.equal(sheet.value('B1'), 8);
  assert.equal(sheet.value('B2'), 10);
  assert.equal(sheet.value('B3'), -2);
  assert.equal(sheet.value('B4'), 2 / 3);
  assert.equal(sheet.value('B5'), 2.5);
  assert.equal(sheet.value('B6'), 1);
  assert.equal(sheet.value('B7'), '#VALUE!');
  assert.equal(sheet.value('B8'), 2);
  assert.equal(sheet.value('B9'), 1);
  assert.equal(sheet.value('B10'), '#DIV/0!');
  assert.equal(sheet.value('B11'), -4);
  assert.equal(sheet.value('B12'), 1);
  assert.equal(sheet.value('B13'), 2);
});

test('区间与聚合：引用里跳过的，直接写就要报', () => {
  const sheet = createSheet({
    A1: '1', A2: '2', A3: 'x', A4: 'TRUE', A5: '   ',
    B1: '=SUM(A1:A5)', B2: '=COUNT(A1:A5)', B3: '=AVERAGE(A1:A5)',
    B4: '=MIN(A1:A5)', B5: '=MAX(A1:A5)', B6: '=SUM(A3:A5)',
    B7: '=AVERAGE(A3:A5)', B8: '=MIN(A3:A5)', B9: '=SUM(A1:A5,10)',
    B10: '=SUM("x")', B11: '=SUM(TRUE)', B12: '=COUNT(1,2,"3")',
    B13: '=1/0', B14: '=SUM(B13:B13)', B15: '=SUM(A1:A2,A3)',
  });
  assert.deepEqual(values(sheet, ['B1', 'B2', 'B3', 'B4', 'B5']), [3, 2, 1.5, 1, 2]);
  assert.equal(sheet.value('B6'), 0);
  assert.equal(sheet.value('B7'), '#DIV/0!');
  assert.equal(sheet.value('B8'), 0);
  assert.equal(sheet.value('B9'), 13);
  assert.equal(sheet.value('B10'), '#VALUE!');
  assert.equal(sheet.value('B11'), 1);
  assert.equal(sheet.value('B12'), '#VALUE!');
  assert.equal(sheet.value('B14'), '#DIV/0!');
  assert.equal(sheet.value('B15'), 3);
});

test('拼接、文本化与比较顺序', () => {
  const sheet = createSheet({
    A1: '', A2: '=1/0',
    B1: '="a"&"b"', B2: '="n="&42', B3: '="x"&TRUE', B4: '="x"&A2',
    B5: '="x"&A1', B6: '="a""b"', B7: '=1<2', B8: '=2<=2', B9: '="a"<"b"',
    B10: '=A1=0', B11: '=A1=""', B12: '=TRUE>1', B13: '=FALSE<"a"',
    B14: '="a"<1', B15: '=1<>2', B16: '=A1<1', B17: '="3">3',
  });
  assert.equal(sheet.value('B1'), 'ab');
  assert.equal(sheet.value('B2'), 'n=42');
  assert.equal(sheet.value('B3'), 'xTRUE');
  assert.equal(sheet.value('B4'), '#DIV/0!');
  assert.equal(sheet.value('B5'), 'x');
  assert.equal(sheet.value('B6'), 'a"b');
  assert.equal(sheet.value('B7'), true);
  assert.equal(sheet.value('B8'), true);
  assert.equal(sheet.value('B9'), true);
  assert.equal(sheet.value('B10'), false);
  assert.equal(sheet.value('B11'), false);
  assert.equal(sheet.value('B12'), true);
  assert.equal(sheet.value('B13'), false);
  assert.equal(sheet.value('B14'), false);
  assert.equal(sheet.value('B15'), true);
  assert.equal(sheet.value('B16'), true);
  assert.equal(sheet.value('B17'), true);
});

test('IF 与那几个函数', () => {
  const sheet = createSheet({
    A1: '', A2: ' 7 ', A3: 'x',
    B1: '=IF(1>0,"y","n")', B2: '=IF(FALSE,1/0,5)', B3: '=IF(0,"a","b")',
    B4: '=IF("","a","b")', B5: '=IF("x","a","b")', B6: '=IF(A1,"a","b")',
    B7: '=IF(1/0,1,2)', B8: '=IF(A2>3,"big","small")', B9: '=IF(TRUE,1)',
    B10: '=ROUND(2.5,0)', B11: '=ROUND(-2.5,0)', B12: '=ROUND(1.25,1)',
    B13: '=ROUND(1234,-2)', B14: '=ROUND(1.5)', B15: '=ROUND(1.5,0.5)',
    B16: '=ABS(-3)', B17: '=ABS(A1)', B18: '=ABS("x")',
    B19: '=LEN("abc")', B20: '=LEN(123)', B21: '=LEN(TRUE)', B22: '=LEN()',
  });
  assert.equal(sheet.value('B1'), 'y');
  assert.equal(sheet.value('B2'), 5);
  assert.equal(sheet.value('B3'), 'b');
  assert.equal(sheet.value('B4'), 'b');
  assert.equal(sheet.value('B5'), 'a');
  assert.equal(sheet.value('B6'), 'b');
  assert.equal(sheet.value('B7'), '#DIV/0!');
  assert.equal(sheet.value('B8'), 'big');
  assert.equal(sheet.value('B9'), '#VALUE!');
  assert.equal(sheet.value('B10'), 3);
  assert.equal(sheet.value('B11'), -3);
  assert.equal(sheet.value('B12'), 1.3);
  assert.equal(sheet.value('B13'), 1200);
  assert.equal(sheet.value('B14'), '#VALUE!');
  assert.equal(sheet.value('B15'), '#VALUE!');
  assert.equal(sheet.value('B16'), 3);
  assert.equal(sheet.value('B17'), 0);
  assert.equal(sheet.value('B18'), '#VALUE!');
  assert.equal(sheet.value('B19'), 3);
  assert.equal(sheet.value('B20'), 3);
  assert.equal(sheet.value('B21'), 4);
  assert.equal(sheet.value('B22'), '#VALUE!');
});

test('依赖重算，跟 set 的顺序无关', () => {
  const sheet = createSheet({ D1: '=C1*2', C1: '=B1+1', B1: '=A1+1', A1: '1' });
  assert.equal(sheet.value('D1'), 6);
  sheet.set('A1', '10');
  assert.equal(sheet.value('D1'), 24);
  sheet.set('A1', '0');
  assert.equal(sheet.value('D1'), 4);
  sheet.clear('A1');
  assert.equal(sheet.value('A1'), null);
  assert.equal(sheet.value('B1'), 1);
  assert.equal(sheet.value('D1'), 4);

  const forward = createSheet({ A1: '1', B1: '=A1+1', C1: '=B1+1', D1: '=C1*2' });
  const backward = createSheet({ D1: '=C1*2', C1: '=B1+1', B1: '=A1+1', A1: '1' });
  assert.deepEqual(forward.snapshot(), backward.snapshot());
  const edited = createSheet({ A1: '1', B1: '=A1+1' });
  edited.set('C1', '=B1+1');
  edited.set('D1', '=C1*2');
  assert.deepEqual(edited.snapshot(), forward.snapshot());

  const area = createSheet({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)' });
  assert.equal(area.value('B1'), 6);
  area.set('A2', '20');
  assert.equal(area.value('B1'), 24);
});
