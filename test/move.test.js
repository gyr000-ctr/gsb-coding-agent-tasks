import test from 'node:test';
import assert from 'node:assert/strict';
import { createRing } from '../lib/ring.js';
import { hash32 } from '../lib/hash.js';

const three = [{ name: 'shard-a' }, { name: 'shard-b' }, { name: 'shard-c' }];
const keys = (count) => Array.from({ length: count }, (_, index) => `user-${index}`);

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

test('去掉一个节点，只有原来归它的 key 换地方', () => {
  const ring = createRing({ nodes: three });
  const list = keys(500);
  const out = ring.plan(list, [{ name: 'shard-a' }, { name: 'shard-b' }]);
  assert.ok(out.moved.length > 0);
  for (const one of out.moved) {
    assert.equal(one.from, 'shard-c');
    assert.notEqual(one.to, 'shard-c');
  }
  assert.equal(out.moved.length + out.stayed, 500);
  assert.equal(out.load.new['shard-c'], undefined);
});

test('加一个节点，挪过去的 key 都归新节点，比例也不离谱', () => {
  const ring = createRing({ nodes: three });
  const out = ring.plan(keys(800), [...three, { name: 'shard-d' }]);
  for (const one of out.moved) assert.equal(one.to, 'shard-d');
  assert.ok(out.moved.length > 800 * 0.1, `挪得太少：${out.moved.length}`);
  assert.ok(out.moved.length < 800 * 0.35, `挪得太多：${out.moved.length}`);
});

test('加完节点，key 的归属还是环上第一个不小于它的点', () => {
  const ring = createRing({ nodes: three });
  ring.addNode({ name: 'shard-d', weight: 1.5 });
  const list = ring.points();
  for (const key of keys(300)) {
    const target = hash32(key);
    const wanted = (list.find((point) => point.point >= target) ?? list[0]).node;
    assert.equal(ring.lookup(key), wanted, key);
  }
  assert.equal(ring.stats().vnodes, 64 * 3 + 96);
});

test('权重高的节点分到的 key 更多', () => {
  const ring = createRing({ nodes: [{ name: 'small', weight: 1 }, { name: 'big', weight: 3 }] });
  const counts = ring.distribution(keys(2000));
  assert.ok(counts.big > counts.small * 2, `big=${counts.big} small=${counts.small}`);
  assert.equal(counts.big + counts.small, 2000);
});

test('去掉再放回来，环跟原来一模一样', () => {
  const ring = createRing({ nodes: three });
  const before = ring.points();
  ring.removeNode('shard-b');
  assert.equal(ring.lookup('user-1') === 'shard-b', false);
  ring.addNode({ name: 'shard-b', weight: 1 });
  assert.deepEqual(ring.points(), before);
});

test('节点写错就报出来', () => {
  expectError(() => createRing({ nodes: [{ name: 'a' }, { name: 'a' }] }), 'ERR_BAD_NODE');
  expectError(() => createRing({ nodes: [{ name: '' }] }), 'ERR_BAD_NODE');
  expectError(() => createRing({ nodes: [{ name: 'a', weight: 0 }] }), 'ERR_BAD_WEIGHT');
  expectError(() => createRing({ nodes: [{ name: 'a', weight: 'two' }] }), 'ERR_BAD_WEIGHT');
  expectError(() => createRing({ nodes: 'a' }), 'ERR_BAD_CONFIG');
  expectError(() => createRing({ replicas: 0, nodes: three }), 'ERR_BAD_CONFIG');
  const ring = createRing({ nodes: three });
  expectError(() => ring.addNode({ name: 'shard-a' }), 'ERR_BAD_NODE');
  expectError(() => ring.removeNode('shard-z'), 'ERR_BAD_NODE');
});
