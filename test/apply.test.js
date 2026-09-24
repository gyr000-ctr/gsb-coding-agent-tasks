import test from 'node:test';
import assert from 'node:assert/strict';

import { applyOps, diffLists } from '../lib/listdiff.js';
import { code, details, itemsOf } from './util.js';

test('applyOps 给的是新数组，原数组不动', () => {
  const list = itemsOf(['a', 'b']);
  const snapshot = JSON.parse(JSON.stringify(list));
  const out = applyOps(list, diffLists(list, itemsOf(['b', 'a'])));
  assert.notEqual(out, list);
  assert.deepEqual(list, snapshot);
  assert.deepEqual(out, itemsOf(['b', 'a']));
  const same = applyOps(list, []);
  assert.notEqual(same, list);
  assert.deepEqual(same, list);
});

test('手写一串操作，回放出来正好是想要的样子', () => {
  const list = itemsOf(['a', 'b']);
  const ops = [
    { op: 'insert', key: 'c', item: { id: 'c', note: 0 }, index: 0 },
    { op: 'move', key: 'b', from: 2, to: 0 },
    { op: 'update', key: 'a', to: { id: 'a', note: 9 } },
  ];
  assert.deepEqual(applyOps(list, ops), [
    { id: 'b', note: 0 },
    { id: 'c', note: 0 },
    { id: 'a', note: 9 },
  ]);
  // insert 只认 op.index，不看 key 在不在
  assert.deepEqual(applyOps([], [{ op: 'insert', key: 'z', item: { id: 'z' }, index: 0 }]), [{ id: 'z' }]);
});

test('index 对不上就报 ERR_BAD_OPERATION', () => {
  const list = itemsOf(['a', 'b', 'c']);
  const cases = [
    [{ op: 'remove', key: 'b', index: 2 }],
    [{ op: 'remove', key: 'zz', index: 0 }],
    [{ op: 'move', key: 'b', from: 0, to: 0 }],
    [{ op: 'move', key: 'c', from: 1, to: 0 }],
    [{ op: 'move', key: 'a', from: 0, to: 9 }],
    [{ op: 'move', key: 'a', from: 0, to: -1 }],
    [{ op: 'insert', key: 'd', item: { id: 'd' }, index: 4 }],
    [{ op: 'insert', key: 'd', item: { id: 'd' }, index: -1 }],
    [{ op: 'insert', key: 'd', item: { id: 'd' }, index: 1.5 }],
    [{ op: 'update', key: 'zz', to: { id: 'zz' } }],
    [{ op: 'rename', key: 'a' }],
    [null],
    ['remove'],
  ];
  for (const ops of cases) {
    assert.equal(code(() => applyOps(list, ops)), 'ERR_BAD_OPERATION', JSON.stringify(ops));
  }
  // details 里带上那条 key
  assert.deepEqual(details(() => applyOps(list, [{ op: 'remove', key: 'b', index: 0 }])), { key: 'b' });
  assert.deepEqual(details(() => applyOps(list, [{ op: 'rename', key: 'a' }])), { op: 'rename' });
  // list / ops 不是数组是另一种错
  assert.equal(code(() => applyOps(null, [])), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => applyOps([], null)), 'ERR_BAD_ARGUMENT');
  // 合法的整条链子不该报
  assert.equal(code(() => applyOps(list, [
    { op: 'remove', key: 'a', index: 0 },
    { op: 'insert', key: 'd', item: { id: 'd' }, index: 2 },
    { op: 'move', key: 'd', from: 2, to: 0 },
  ])), null);
});

test('自定义 key 的回放', () => {
  const list = [{ uid: 'x', note: 1 }, { uid: 'y', note: 1 }];
  const next = [{ uid: 'y', note: 1 }, { uid: 'x', note: 2 }];
  const ops = diffLists(list, next, { key: 'uid' });
  assert.deepEqual(applyOps(list, ops, { key: 'uid' }), next);
  // 用函数取 key 也一样
  assert.deepEqual(applyOps(list, diffLists(list, next, { key: (item) => item.uid }), { key: (item) => item.uid }), next);
  // 拿默认的 id 去回放就找不到 key 了
  assert.equal(code(() => applyOps(list, ops, { key: 'id' })), 'ERR_BAD_OPERATION');
});
