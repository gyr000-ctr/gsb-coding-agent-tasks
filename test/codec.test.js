import test from 'node:test';
import assert from 'node:assert/strict';

import { decode, encode } from '../lib/rscodec.js';
import { code, combinations, details, mulberry32, plain, randomShard } from './util.js';

const shardsOf = (rows) => rows.map((row) => Uint8Array.from(row));
const bytesOf = (item) => (item instanceof Uint8Array ? [...item] : item);

test('编码：形状、拷贝、系数矩阵', () => {
  const data = shardsOf([[1, 2, 3, 200], [9, 8, 7, 6], [0, 255, 128, 4]]);
  const out = encode(data, { parity: 3 });
  assert.equal(out.length, 6);
  assert.deepEqual(out.slice(0, 3).map(bytesOf), [[1, 2, 3, 200], [9, 8, 7, 6], [0, 255, 128, 4]]);
  // 前 k 个是拷贝，不是原来那几个对象
  for (let at = 0; at < 3; at += 1) {
    assert.notEqual(out[at], data[at]);
    assert.ok(out[at] instanceof Uint8Array);
  }
  out[0][0] = 99;
  assert.equal(data[0][0], 1);
  // 校验块定死在这个约定上
  assert.deepEqual(out.slice(3).map(bytesOf), [[19, 201, 55, 212], [37, 105, 247, 144], [73, 115, 188, 229]]);
  // k = 1 的时候校验块就是原样复制
  assert.deepEqual(encode(shardsOf([[7, 8]]), { parity: 2 }).map(bytesOf), [[7, 8], [7, 8], [7, 8]]);
  // 长度 0 的块也跑得起来
  assert.deepEqual(encode([new Uint8Array(0)], { parity: 1 }).map(bytesOf), [[], []]);
});

test('擦除：一个位置随便丢哪个都能补', () => {
  const data = shardsOf([[1, 2, 3, 200], [9, 8, 7, 6], [0, 255, 128, 4]]);
  const full = encode(data, { parity: 2 });
  for (let at = 0; at < full.length; at += 1) {
    const partial = full.map((shard, index) => (index === at ? null : shard));
    assert.deepEqual(decode(partial, { data: 3, parity: 2 }).map(bytesOf), plain(data), `丢第 ${at} 块没补回来`);
  }
});

test('擦除：两个、三个的组合，以及数据块全丢', () => {
  const data = shardsOf([[3, 1], [4, 1], [5, 9]]);
  const full = encode(data, { parity: 3 });
  for (const missing of combinations(6, 2)) {
    const partial = full.map((shard, at) => (missing.includes(at) ? null : shard));
    assert.deepEqual(decode(partial, { data: 3, parity: 3 }).map(bytesOf), plain(data), `丢 ${missing} 没补回来`);
  }
  for (const missing of combinations(6, 3)) {
    const partial = full.map((shard, at) => (missing.includes(at) ? null : shard));
    assert.deepEqual(decode(partial, { data: 3, parity: 3 }).map(bytesOf), plain(data), `丢 ${missing} 没补回来`);
  }
});

test('随机对拍：只丢不掉值，不超上限都补得回来', () => {
  for (let round = 0; round < 200; round += 1) {
    const random = mulberry32(round * 7919 + 101);
    const dataCount = 1 + Math.floor(random() * 6);
    const parity = 1 + Math.floor(random() * 3);
    const size = Math.floor(random() * 9);
    const data = [];
    for (let at = 0; at < dataCount; at += 1) data.push(randomShard(size, random));
    const full = encode(data, { parity });
    const want = Math.floor(random() * (parity + 1));
    const missing = new Set();
    while (missing.size < want) missing.add(Math.floor(random() * (dataCount + parity)));
    const partial = full.map((shard, at) => (missing.has(at) ? null : shard));
    assert.deepEqual(decode(partial, { data: dataCount, parity }).map(bytesOf), plain(data),
      `第 ${round} 轮 ${dataCount}+${parity} 丢 ${[...missing]} 没补回来`);
  }
});

test('数据块都在的时候，校验块对不对不归它管', () => {
  const data = shardsOf([[1, 2], [3, 4]]);
  const full = encode(data, { parity: 2 });
  full[3][0] ^= 0xff; // 把第二个校验块改坏
  const back = decode(full, { data: 2, parity: 2 });
  assert.deepEqual(back.map(bytesOf), plain(data));
  for (let at = 0; at < data.length; at += 1) assert.notEqual(back[at], data[at]);
});

test('入参：缺太多、位置数不对、块不合法', () => {
  const data = shardsOf([[1], [2]]);
  const full = encode(data, { parity: 2 });
  const threeMissing = [null, null, full[2], null];
  assert.equal(code(() => decode(threeMissing, { data: 2, parity: 2 })), 'ERR_TOO_MANY_ERASURES');
  assert.deepEqual(details(() => decode(threeMissing, { data: 2, parity: 2 })), { missing: 3, parity: 2 });
  assert.equal(code(() => decode([null, null], { data: 2, parity: 0 })), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => decode(full.slice(0, 3), { data: 2, parity: 2 })), 'ERR_BAD_ARGUMENT');
  assert.deepEqual(details(() => decode(full.slice(0, 3), { data: 2, parity: 2 })), { expected: 4, actual: 3 });
  assert.equal(code(() => decode([undefined, full[1], full[2], full[3]], { data: 2, parity: 2 })), 'ERR_BAD_ARGUMENT');
  assert.deepEqual(details(() => decode([undefined, full[1], full[2], full[3]], { data: 2, parity: 2 })), { index: 0 });
  assert.equal(code(() => decode([new Uint8Array(2), full[1], full[2], full[3]], { data: 2, parity: 2 })), 'ERR_BAD_ARGUMENT');
  assert.deepEqual(details(() => decode([new Uint8Array(2), full[1], full[2], full[3]], { data: 2, parity: 2 })),
    { index: 1, expected: 2, actual: 1 });
  assert.equal(code(() => decode('nope', { data: 2, parity: 2 })), 'ERR_BAD_ARGUMENT');
  for (const options of [{}, { data: 0, parity: 1 }, { data: 2 }, { data: 2, parity: 1.5 }, { data: '2', parity: 2 },
    { data: 2, parity: 0 }, { data: -1, parity: 1 }, { data: 2, parity: NaN }]) {
    assert.equal(code(() => decode(full, options)), 'ERR_BAD_ARGUMENT', JSON.stringify(options));
  }
  // 编码那边的入参
  assert.equal(code(() => encode([], { parity: 1 })), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => encode('nope', { parity: 1 })), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => encode([[1, 2]], { parity: 1 })), 'ERR_BAD_ARGUMENT');
  assert.deepEqual(details(() => encode([[1, 2]], { parity: 1 })), { index: 0 });
  assert.equal(code(() => encode([new Uint8Array(1), new Uint8Array(2)], { parity: 1 })), 'ERR_BAD_ARGUMENT');
  assert.deepEqual(details(() => encode([new Uint8Array(1), new Uint8Array(2)], { parity: 1 })),
    { index: 1, expected: 1, actual: 2 });
  for (const parity of [0, -1, 1.5, '2', NaN, null, undefined]) {
    assert.equal(code(() => encode([new Uint8Array(1)], { parity })), 'ERR_BAD_ARGUMENT', `parity=${String(parity)}`);
  }
});
