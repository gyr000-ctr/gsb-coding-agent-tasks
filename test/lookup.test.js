import test from 'node:test';
import assert from 'node:assert/strict';
import { createRing } from '../lib/ring.js';
import { hash32 } from '../lib/hash.js';

const nodes = [
  { name: 'shard-a', weight: 1 },
  { name: 'shard-b', weight: 2 },
  { name: 'shard-c', weight: 0.5 },
];

const keys = (count, prefix = 'user') =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'RingError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('每个节点按权重铺虚拟节点', () => {
  const ring = createRing({ nodes });
  assert.deepEqual(ring.stats(), {
    nodes: 3,
    vnodes: 224,
    minVnodes: 32,
    maxVnodes: 128,
    replicas: 64,
  });
  assert.equal(ring.points().length, 224);
  assert.equal(ring.points()[0].vnode.startsWith('shard-'), true);
});

test('replicas 调小，点数跟着变', () => {
  const ring = createRing({ replicas: 4, nodes });
  assert.deepEqual(ring.stats(), {
    nodes: 3,
    vnodes: 14,
    minVnodes: 2,
    maxVnodes: 8,
    replicas: 4,
  });
});

test('同一个 key 换一个实例查还是同一个节点', () => {
  const left = createRing({ nodes });
  const right = createRing({ nodes });
  for (const key of keys(200)) assert.equal(left.lookup(key), right.lookup(key));
});

test('lookup 落在环上第一个不小于自身哈希的点', () => {
  const ring = createRing({ nodes });
  const list = ring.points();
  for (const key of keys(500, 'order')) {
    const target = hash32(key);
    const wanted = (list.find((point) => point.point >= target) ?? list[0]).node;
    assert.equal(ring.lookup(key), wanted, key);
  }
});

test('哈希比环上所有点都大时会绕回第一个点', () => {
  const ring = createRing({ nodes });
  const list = ring.points();
  const highest = list[list.length - 1].point;
  const wrapping = keys(5000, 'wrap').filter((key) => hash32(key) > highest);
  assert.ok(wrapping.length > 0, '这一组 key 里应该有几个绕回去的');
  for (const key of wrapping) assert.equal(ring.lookup(key), list[0].node);
});

test('lookupReplicas 沿着环往后走，同一个节点不重复给', () => {
  const ring = createRing({ nodes });
  const list = ring.points();
  for (const key of keys(50, 'copy')) {
    const target = hash32(key);
    let index = list.findIndex((point) => point.point >= target);
    if (index < 0) index = 0;
    const wanted = [];
    for (let step = 0; step < list.length && wanted.length < 2; step++) {
      const node = list[(index + step) % list.length].node;
      if (!wanted.includes(node)) wanted.push(node);
    }
    assert.deepEqual(ring.lookupReplicas(key, 2), wanted, key);
  }
});

test('节点不够就有几个给几个，count 给 0 是空数组', () => {
  const ring = createRing({ nodes });
  assert.equal(ring.lookupReplicas('user-7', 5).length, 3);
  assert.deepEqual(ring.lookupReplicas('user-7', 0), []);
  expectError(() => ring.lookupReplicas('user-7', -1), 'ERR_BAD_COUNT');
  expectError(() => ring.lookupReplicas('user-7', 1.5), 'ERR_BAD_COUNT');
});

test('空环查不了，直接报 ERR_NO_NODES', () => {
  const empty = createRing({ nodes: [] });
  assert.deepEqual(empty.names(), []);
  assert.equal(empty.size(), 0);
  expectError(() => empty.lookup('user-1'), 'ERR_NO_NODES');
  expectError(() => empty.lookupReplicas('user-1', 1), 'ERR_NO_NODES');
});

test('节点名按字典序给出来', () => {
  const ring = createRing({ nodes: [{ name: 'b' }, { name: 'a' }, { name: 'c' }] });
  assert.deepEqual(ring.names(), ['a', 'b', 'c']);
});
