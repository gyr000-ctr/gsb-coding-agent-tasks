import test from 'node:test';
import assert from 'node:assert/strict';

import { applyOps, diffLists } from '../lib/listdiff.js';
import { code, details, itemsOf, keysOf, lisLength, mulberry32, shuffle } from './util.js';

test('一模一样就没有操作', () => {
  const prev = itemsOf(['a', 'b', 'c']);
  assert.deepEqual(diffLists(prev, prev), []);
  assert.deepEqual(diffLists(prev, itemsOf(['a', 'b', 'c'])), []);
  assert.deepEqual(diffLists([], []), []);
  assert.deepEqual(diffLists(prev, []).map((op) => op.op), ['remove', 'remove', 'remove']);
  assert.deepEqual(diffLists([], prev).map((op) => op.op), ['insert', 'insert', 'insert']);
});

test('删：index 是「前面的操作都做完」之后的位置', () => {
  const ops = diffLists(itemsOf(['a', 'b', 'c', 'd']), itemsOf(['a', 'd']));
  assert.deepEqual(ops, [
    { op: 'remove', key: 'b', index: 1 },
    { op: 'remove', key: 'c', index: 1 },
  ]);
  // 删的顺序按 prev 里的先后
  const tail = diffLists(itemsOf(['a', 'b', 'c']), itemsOf(['a']));
  assert.deepEqual(tail, [
    { op: 'remove', key: 'b', index: 1 },
    { op: 'remove', key: 'c', index: 1 },
  ]);
  const head = diffLists(itemsOf(['a', 'b', 'c']), itemsOf(['c']));
  assert.deepEqual(head, [
    { op: 'remove', key: 'a', index: 0 },
    { op: 'remove', key: 'b', index: 0 },
  ]);
});

test('插：插在 next 里前一条的后面', () => {
  const ops = diffLists(itemsOf(['a', 'c']), itemsOf(['a', 'b', 'c', 'd']));
  assert.deepEqual(ops, [
    { op: 'insert', key: 'b', item: { id: 'b', note: 0 }, index: 1 },
    { op: 'insert', key: 'd', item: { id: 'd', note: 0 }, index: 3 },
  ]);
  // 插到最前面
  assert.deepEqual(diffLists(itemsOf(['b']), itemsOf(['a', 'b'])), [
    { op: 'insert', key: 'a', item: { id: 'a', note: 0 }, index: 0 },
  ]);
  // 空列表上起一条
  assert.deepEqual(diffLists([], itemsOf(['a'])), [
    { op: 'insert', key: 'a', item: { id: 'a', note: 0 }, index: 0 },
  ]);
});

test('改内容：JSON 一样就不出 update', () => {
  const prev = [{ id: 'a', note: 1 }, { id: 'b', note: 1 }];
  const next = [{ id: 'a', note: 2 }, { id: 'b', note: 1 }];
  assert.deepEqual(diffLists(prev, next), [
    { op: 'update', key: 'a', from: { id: 'a', note: 1 }, to: { id: 'a', note: 2 } },
  ]);
  assert.deepEqual(diffLists(prev, [{ id: 'b', note: 1 }, { id: 'a', note: 1, extra: true }]), [
    { op: 'update', key: 'a', from: { id: 'a', note: 1 }, to: { id: 'a', note: 1, extra: true } },
    { op: 'move', key: 'a', from: 0, to: 1 },
  ]);
});

test('挪位置：只挪不在最长递增子序列里的那几个', () => {
  // 目标顺序 B A D C：B 和 D 已经一前一后，A 和 C 得挪
  assert.deepEqual(diffLists(itemsOf(['a', 'b', 'c', 'd']), itemsOf(['b', 'a', 'd', 'c'])), [
    { op: 'move', key: 'a', from: 0, to: 1 },
    { op: 'move', key: 'c', from: 2, to: 3 },
  ]);
  // 整个倒过来：[a,b,c] -> [c,b,a]，c 已经在对的位置上不动，b 和 a 依次挪到后面
  assert.deepEqual(diffLists(itemsOf(['a', 'b', 'c']), itemsOf(['c', 'b', 'a'])), [
    { op: 'move', key: 'b', from: 1, to: 2 },
    { op: 'move', key: 'a', from: 0, to: 2 },
  ]);
  // 顺序本来就对，一条 move 都不该有
  assert.deepEqual(diffLists(itemsOf(['a', 'b', 'c']), itemsOf(['a', 'b', 'c'])), []);
  // 只把最后一条提到最前面：其余几条保持相对顺序，只挪一条
  const ops = diffLists(itemsOf(['a', 'b', 'c', 'd']), itemsOf(['d', 'a', 'b', 'c']));
  assert.deepEqual(ops.map((op) => op.key), ['d']);
  assert.deepEqual(ops[0], { op: 'move', key: 'd', from: 3, to: 0 });
});

test('增删改挪混在一起：回放出来正好是 next', () => {
  const prev = [{ id: 'a', note: 1 }, { id: 'b', note: 0 }, { id: 'c', note: 0 }, { id: 'd', note: 0 }];
  const next = [{ id: 'c', note: 0 }, { id: 'e', note: 0 }, { id: 'a', note: 2 }, { id: 'd', note: 5 }];
  const ops = diffLists(prev, next);
  assert.deepEqual(ops, [
    { op: 'remove', key: 'b', index: 1 },
    { op: 'insert', key: 'e', item: { id: 'e', note: 0 }, index: 2 },
    { op: 'update', key: 'a', from: { id: 'a', note: 1 }, to: { id: 'a', note: 2 } },
    { op: 'update', key: 'd', from: { id: 'd', note: 0 }, to: { id: 'd', note: 5 } },
    { op: 'move', key: 'a', from: 0, to: 2 },
  ]);
  assert.deepEqual(applyOps(prev, ops), next);
});

test('随机对拍：回放等于 next、挪的条数正好最少、没有白挪的', () => {
  for (let round = 0; round < 200; round += 1) {
    const random = mulberry32(round * 7919 + 31);
    const pool = [];
    for (let at = 0; at < 9; at += 1) pool.push(`k${at}`);
    const prev = shuffle(pool.filter(() => random() < 0.6), random)
      .map((id) => ({ id, note: Math.floor(random() * 3) }));
    const next = shuffle(pool.filter(() => random() < 0.6), random)
      .map((id) => ({ id, note: Math.floor(random() * 3) }));
    const ops = diffLists(prev, next);
    assert.deepEqual(applyOps(prev, ops), next, `第 ${round} 轮回放对不上`);
    const moves = ops.filter((op) => op.op === 'move');
    for (const move of moves) assert.notEqual(move.from, move.to, `第 ${round} 轮有白挪的`);
    // 先做增删（它们不会动顺序），剩下的列表长度减它的 LIS 就是理论最少的挪动数
    const parked = applyOps(prev, ops.filter((op) => op.op !== 'move'));
    const targets = parked.map((item) => next.findIndex((other) => other.id === item.id));
    assert.equal(moves.length, targets.length - lisLength(targets), `第 ${round} 轮挪多了`);
    // key 也不许丢
    assert.deepEqual(keysOf(applyOps(prev, ops)).sort(), keysOf(next).sort());
  }
});

test('key 可以是别的字段，也可以是函数', () => {
  const prev = [{ uid: 'x' }, { uid: 'y' }];
  const next = [{ uid: 'y' }, { uid: 'x' }];
  assert.deepEqual(diffLists(prev, next, { key: 'uid' }).map((op) => op.key), ['x']);
  assert.deepEqual(diffLists(prev, next, { key: (item) => item.uid }), [
    { op: 'move', key: 'x', from: 0, to: 1 },
  ]);
  // 不写 key 默认按 id
  assert.deepEqual(diffLists([{ id: 'a' }], [{ id: 'a' }], {}), []);
});

test('入参：不是数组、key 取不到、key 重复', () => {
  assert.equal(code(() => diffLists(null, [])), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => diffLists([], 'x')), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => diffLists([], [], { key: 7 })), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => diffLists([], [], { key: '' })), 'ERR_BAD_ARGUMENT');
  for (const bad of [undefined, null, '', {}, [], NaN, Infinity]) {
    assert.equal(code(() => diffLists([{ id: bad }], [])), 'ERR_BAD_ARGUMENT', `${String(bad)} 应该被拦下`);
    assert.deepEqual(details(() => diffLists([{ id: bad }], [])), { index: 0, side: 'prev' });
    assert.deepEqual(details(() => diffLists([], [{ id: bad }])), { index: 0, side: 'next' });
  }
  assert.deepEqual(details(() => diffLists([{ id: 'a' }, { id: 'b' }, { id: 'a' }], [])),
    { key: 'a', side: 'prev' });
  assert.equal(code(() => diffLists([], [{ id: 'a' }, { id: 'a' }])), 'ERR_DUPLICATE_KEY');
  assert.deepEqual(details(() => diffLists([], [{ id: 'a' }, { id: 'a' }])), { key: 'a', side: 'next' });
  // 数字 key 也算合法
  assert.deepEqual(diffLists([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }]).map((op) => op.key), [1]);
});
