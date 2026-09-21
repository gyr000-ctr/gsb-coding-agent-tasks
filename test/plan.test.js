import test from 'node:test';
import assert from 'node:assert/strict';
import { createRing } from '../lib/ring.js';

const three = [{ name: 'shard-a' }, { name: 'shard-b' }, { name: 'shard-c' }];
const four = [...three, { name: 'shard-d' }];
const keys = (count) => Array.from({ length: count }, (_, index) => `user-${index}`);

test('moved 按 key 排好，stayed 数对得上', () => {
  const ring = createRing({ nodes: three });
  const out = ring.plan(keys(400), four);
  assert.equal(out.moved.length + out.stayed, 400);
  const sorted = [...out.moved].sort((left, right) => (left.key < right.key ? -1 : 1));
  assert.deepEqual(out.moved, sorted);
  assert.equal(out.load.old['shard-d'], undefined);
});

test('load 里新旧两边各自加总都等于 key 总数', () => {
  const ring = createRing({ nodes: three });
  const out = ring.plan(keys(400), four);
  const sum = (bag) => Object.values(bag).reduce((total, one) => total + one, 0);
  assert.equal(sum(out.load.old), 400);
  assert.equal(sum(out.load.new), 400);
  assert.deepEqual(Object.keys(out.load.old).sort(), ['shard-a', 'shard-b', 'shard-c']);
  assert.deepEqual(Object.keys(out.load.new).sort(), ['shard-a', 'shard-b', 'shard-c', 'shard-d']);
  assert.equal(out.load.new['shard-d'], out.moved.length);
});

test('plan 里的 to 跟另建一个环查出来的一样', () => {
  const ring = createRing({ nodes: three });
  const next = createRing({ nodes: four });
  const out = ring.plan(keys(200), four);
  for (const one of out.moved) assert.equal(one.to, next.lookup(one.key));
  assert.deepEqual(out.load.new, next.distribution(keys(200)));
});

test('同一个 nextNodes 算两遍，结果一样', () => {
  const ring = createRing({ nodes: three });
  const list = keys(300);
  assert.deepEqual(ring.plan(list, four), ring.plan(list, four));
});

test('keys 里重复的只算一条', () => {
  const ring = createRing({ nodes: three });
  const out = ring.plan(['user-1', 'user-1', 'user-2', 'user-2', 'user-2'], four);
  assert.equal(out.moved.length + out.stayed, 2);
});

test('distribution 每个节点都给一行，加总等于 key 数', () => {
  const ring = createRing({ nodes: three });
  const counts = ring.distribution(keys(300));
  assert.deepEqual(Object.keys(counts), ['shard-a', 'shard-b', 'shard-c']);
  assert.equal(
    Object.values(counts).reduce((total, one) => total + one, 0),
    300,
  );
});
