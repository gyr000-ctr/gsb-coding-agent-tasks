import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../lib/engine.js';

const book = (sheets) => createEngine({ sheets });

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'SheetError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('字面量、优先级、一元负号和除零', () => {
  const engine = book({
    Sheet1: {
      A1: 2,
      A2: 3,
      B1: '=A1+A2*2',
      B2: '=2^3^2',
      B3: '=-2^2',
      B4: '=(2+3)*4',
      B5: '=10/4',
      B6: '=1/0',
      B7: '=1+2*3-4/2',
    },
  });
  assert.equal(engine.get('B1'), 8);
  assert.equal(engine.get('B2'), 512);
  assert.equal(engine.get('B3'), -4);
  assert.equal(engine.get('B4'), 20);
  assert.equal(engine.get('B5'), 2.5);
  assert.equal(engine.get('B6'), '#DIV/0!');
  assert.equal(engine.get('B7'), 5);
});

test('字符串、布尔和连接符', () => {
  const engine = book({
    Sheet1: { A1: '=1=1', A2: '=1<2', A3: '=1<>2', A4: '="a"<TRUE', A5: '=1<"a"', A6: '="b"<"a"', A7: '="a"&1&TRUE' },
  });
  assert.equal(engine.get('A1'), true);
  assert.equal(engine.get('A2'), true);
  assert.equal(engine.get('A3'), true);
  assert.equal(engine.get('A4'), true);
  assert.equal(engine.get('A5'), true);
  assert.equal(engine.get('A6'), false);
  assert.equal(engine.get('A7'), 'a1TRUE');
});

test('引用、范围、空单元格和强制转换', () => {
  const engine = book({
    Sheet1: {
      A1: 1,
      A2: 'x',
      A3: 5,
      B1: '=SUM(A1:A5)',
      B2: '=MIN(A1:A5)',
      B3: '=MAX(A1:A5)',
      B4: '=COUNT(A1:A5)',
      B5: '=SUM(A1,A3)',
      B6: '=TRUE+1',
      B7: '="5"+1',
      B8: '=Z9+1',
      B9: '=Z9&"x"',
      B10: '=SUM(A1,"x")',
    },
  });
  assert.equal(engine.get('B1'), 6);
  assert.equal(engine.get('B2'), 1);
  assert.equal(engine.get('B3'), 5);
  assert.equal(engine.get('B4'), 2);
  assert.equal(engine.get('B5'), 6);
  assert.equal(engine.get('B6'), 2);
  assert.equal(engine.get('B7'), 6);
  assert.equal(engine.get('B8'), 1);
  assert.equal(engine.get('B9'), 'x');
  assert.equal(engine.get('B10'), '#VALUE!');
});

test('IF 只算走到的那个分支', () => {
  const engine = book({
    Sheet1: {
      A1: 5,
      B1: '=IF(FALSE,1/0,5)',
      B2: '=IF(TRUE,1,1/0)',
      B3: '=IF(0,"y","n")',
      B4: '=IF(1/0,1,2)',
      B5: '=IF(A1>1,1/0,7)',
      B6: '=IF("",1,2)',
    },
  });
  assert.equal(engine.get('B1'), 5);
  assert.equal(engine.get('B2'), 1);
  assert.equal(engine.get('B3'), 'n');
  assert.equal(engine.get('B4'), '#DIV/0!');
  assert.equal(engine.get('B5'), '#DIV/0!');
  assert.equal(engine.get('B6'), 2);
});

test('其余函数', () => {
  const engine = book({
    Sheet1: {
      A1: '=ROUND(2.5,0)',
      A2: '=ROUND(1234.567,-2)',
      A3: '=ROUND(1.5,0.5)',
      A4: '=ABS(-3)',
      A5: '=AND(TRUE,1)',
      A6: '=AND(TRUE,0)',
      A7: '=OR(FALSE,0,"")',
      A8: '=OR(0,"x")',
      A9: '=NOT(0)',
      A10: '=LEN("abc")',
      A11: '=LEN(123)',
    },
  });
  assert.equal(engine.get('A1'), 3);
  assert.equal(engine.get('A2'), 1200);
  assert.equal(engine.get('A3'), '#VALUE!');
  assert.equal(engine.get('A4'), 3);
  assert.equal(engine.get('A5'), true);
  assert.equal(engine.get('A6'), false);
  assert.equal(engine.get('A7'), false);
  assert.equal(engine.get('A8'), true);
  assert.equal(engine.get('A9'), true);
  assert.equal(engine.get('A10'), 3);
  assert.equal(engine.get('A11'), 3);
});

test('错误值一路往外传', () => {
  const engine = book({
    Sheet1: {
      A1: '=1/0',
      A2: 5,
      B1: '=SUM(A1:A2)',
      B2: '=A1+1',
      B3: '="a"-1',
      B4: '=SUM(B3,1)',
      B5: '=NOPE(1)',
      B6: '=SUM(1,2',
      B7: '=Missing!A1',
      B8: '=A1:A2',
    },
  });
  assert.equal(engine.get('B1'), '#DIV/0!');
  assert.equal(engine.get('B2'), '#DIV/0!');
  assert.equal(engine.get('B3'), '#VALUE!');
  assert.equal(engine.get('B4'), '#VALUE!');
  assert.equal(engine.get('B5'), '#NAME?');
  assert.equal(engine.get('B6'), '#ERROR!');
  assert.equal(engine.get('B7'), '#REF!');
  assert.equal(engine.get('B8'), '#VALUE!');
});

test('跨表引用和表格接口', () => {
  const engine = book({ Sheet1: { A1: '=Sheet2!A1*2', B1: '=Nope!A1' }, Sheet2: { A1: 21, 'B$2': 7 } });
  assert.equal(engine.get('Sheet1!A1'), 42);
  assert.equal(engine.get('Sheet1!B1'), '#REF!');
  assert.equal(engine.get('Sheet2!B2'), 7);
  assert.equal(engine.get('A1'), 42);
  assert.deepEqual(engine.sheets(), ['Sheet1', 'Sheet2']);
  assert.equal(engine.get('Sheet1!Z9'), null);
  assert.equal(engine.values()['Sheet2!A1'], 21);
  expectError(() => engine.get('Nope!A1'), 'ERR_UNKNOWN_SHEET');
  expectError(() => engine.get('not-a-ref'), 'ERR_BAD_REF');
  expectError(() => createEngine([]), 'ERR_BAD_CONFIG');
  expectError(() => createEngine({ sheets: { Sheet1: 5 } }), 'ERR_BAD_CONFIG');
});
