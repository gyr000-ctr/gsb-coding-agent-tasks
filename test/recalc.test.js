import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../lib/engine.js';

const book = (sheets) => createEngine({ sheets });

test('只重算受影响的那几格', () => {
  const engine = book({ Sheet1: { A1: 1, B1: '=A1+1', C1: '=B1*2', D1: 100, E1: '=D1+1' } });
  assert.deepEqual(engine.values(), {
    'Sheet1!A1': 1,
    'Sheet1!B1': 2,
    'Sheet1!C1': 4,
    'Sheet1!D1': 100,
    'Sheet1!E1': 101,
  });
  const out = engine.set('Sheet1!A1', 5);
  assert.deepEqual(out.changed, ['Sheet1!A1', 'Sheet1!B1', 'Sheet1!C1']);
  assert.deepEqual(out.values, { 'Sheet1!A1': 5, 'Sheet1!B1': 6, 'Sheet1!C1': 12 });
  assert.equal(out.evaluated, 3);
  assert.equal(engine.stats().lastEvaluated, 3);
  assert.equal(engine.stats().cells, 5);
  assert.equal(engine.get('Sheet1!E1'), 101);
  const again = engine.set('Sheet1!A1', 5);
  assert.deepEqual(again.changed, []);
  assert.equal(again.evaluated, 3);
});

test('范围依赖也算数，范围外的改动不算', () => {
  const engine = book({ Sheet1: { A1: 1, A2: 2, A3: 3, F1: '=SUM(A1:A3)', G1: '=A4+1' } });
  assert.equal(engine.get('Sheet1!F1'), 6);
  const inside = engine.set('Sheet1!A2', 5);
  assert.deepEqual(inside.changed, ['Sheet1!A2', 'Sheet1!F1']);
  assert.equal(engine.get('Sheet1!F1'), 9);
  const outside = engine.set('Sheet1!A4', 10);
  assert.deepEqual(outside.changed, ['Sheet1!A4', 'Sheet1!G1']);
  assert.equal(engine.get('Sheet1!G1'), 11);
  assert.equal(engine.get('Sheet1!F1'), 9);
});

test('把公式改成常量、再改回公式，下游都跟着走', () => {
  const engine = book({ Sheet1: { A1: 1, B1: '=A1+1', C1: '=B1&"!"' } });
  assert.equal(engine.get('Sheet1!C1'), '2!');
  assert.deepEqual(engine.set('Sheet1!B1', 'ok').changed, ['Sheet1!B1', 'Sheet1!C1']);
  assert.equal(engine.get('Sheet1!C1'), 'ok!');
  assert.deepEqual(engine.set('Sheet1!B1', '=A1*10').changed, ['Sheet1!B1', 'Sheet1!C1']);
  assert.equal(engine.get('Sheet1!C1'), '10!');
  const renamed = engine.set('Sheet1!C1', '=SUM(A1:B1)');
  assert.deepEqual(renamed.changed, ['Sheet1!C1']);
  assert.equal(engine.get('Sheet1!C1'), 11);
});

test('建好就带环的表整条链都是 #CYCLE!，改掉之后恢复', () => {
  const engine = book({ Sheet1: { A1: '=B1+1', B1: '=A1+1', C1: '=A1*2', D1: 1 } });
  assert.equal(engine.get('Sheet1!A1'), '#CYCLE!');
  assert.equal(engine.get('Sheet1!B1'), '#CYCLE!');
  assert.equal(engine.get('Sheet1!C1'), '#CYCLE!');
  assert.equal(engine.get('Sheet1!D1'), 1);
  const out = engine.set('Sheet1!A1', 7);
  assert.deepEqual(out.changed, ['Sheet1!A1', 'Sheet1!B1', 'Sheet1!C1']);
  assert.equal(engine.get('Sheet1!B1'), 8);
  assert.equal(engine.get('Sheet1!C1'), 14);
});

test('改着改着也能改出环来', () => {
  const engine = book({ Sheet1: { A1: 1, B1: '=A1+1' } });
  assert.equal(engine.get('Sheet1!B1'), 2);
  const out = engine.set('Sheet1!A1', '=B1');
  assert.deepEqual(out.changed, ['Sheet1!A1', 'Sheet1!B1']);
  assert.equal(engine.get('Sheet1!A1'), '#CYCLE!');
  assert.equal(engine.get('Sheet1!B1'), '#CYCLE!');
  const fixed = engine.set('Sheet1!A1', 3);
  assert.deepEqual(fixed.changed, ['Sheet1!A1', 'Sheet1!B1']);
  assert.equal(engine.get('Sheet1!A1'), 3);
  assert.equal(engine.get('Sheet1!B1'), 4);
});

test('错误值也算变化，evaluate 全量重算时没变就是空', () => {
  const engine = book({ Sheet1: { A1: 1, B1: '=A1+1' } });
  const out = engine.set('Sheet1!B1', '=SUM(1,');
  assert.deepEqual(out.changed, ['Sheet1!B1']);
  assert.equal(engine.get('Sheet1!B1'), '#ERROR!');
  const full = engine.evaluate();
  assert.deepEqual(full.changed, []);
  assert.equal(full.evaluated, 2);
  assert.equal(engine.stats().lastEvaluated, 2);
});

test('范围把自己也算进去就是绕回自己', () => {
  const engine = book({ Sheet1: { G1: 1, H1: '=SUM(G1:H1)' } });
  assert.equal(engine.get('Sheet1!H1'), '#CYCLE!');
  const out = engine.set('Sheet1!H1', '=SUM(G1:G1)');
  assert.deepEqual(out.changed, ['Sheet1!H1']);
  assert.equal(engine.get('Sheet1!H1'), 1);
});
