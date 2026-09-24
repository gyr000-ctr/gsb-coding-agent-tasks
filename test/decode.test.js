import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeMessage } from '../lib/dnscodec.js';
import { code, details } from './util.js';

const u16 = (value) => [(value >> 8) & 0xff, value & 0xff];
const u32 = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const label = (text) => [text.length, ...[...text].map((ch) => ch.charCodeAt(0))];
const name = (text) => (text === '' ? [0] : [...text.split('.').flatMap((part) => label(part)), 0]);
const header = (id, bits, counts) => [...u16(id), ...u16(bits), ...counts.flatMap((item) => u16(item))];
const wire = (...parts) => {
  const out = [];
  const push = (value) => {
    if (value instanceof Uint8Array) {
      for (const byte of value) out.push(byte);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) push(item);
      return;
    }
    out.push(value);
  };
  for (const part of parts) push(part);
  return Uint8Array.from(out);
};

test('解一条最小的报文', () => {
  const one = wire(header(0x1234, 0x0100, [1, 0, 0, 0]), name('www.example.com'), u16(1), u16(1));
  assert.deepEqual(decodeMessage(one), {
    id: 0x1234,
    flags: { qr: false, opcode: 0, aa: false, tc: false, rd: true, ra: false, rcode: 0 },
    questions: [{ name: 'www.example.com', type: 1, class: 1 }],
    answers: [],
    authorities: [],
    additionals: [],
  });
  // 标志位从左往右拆：0x8583 = qr + aa + rd + ra + rcode 3
  const flags = decodeMessage(wire(header(0xffff, 0x8583, [0, 0, 0, 0]))).flags;
  assert.deepEqual(flags, { qr: true, opcode: 0, aa: true, tc: false, rd: true, ra: true, rcode: 3 });
  // 0xf80f = qr + opcode 15 + rcode 15
  assert.deepEqual(decodeMessage(wire(header(1, 0xf80f, [0, 0, 0, 0]))).flags,
    { qr: true, opcode: 15, aa: false, tc: false, rd: false, ra: false, rcode: 15 });
});

test('名字压缩指针：指过去、套两层、指到 rdata 里都行', () => {
  // 问询写全 a.example.com（12..26），回答里的名字用指针指回 12
  const one = wire(header(1, 0x8180, [1, 1, 0, 0]), name('a.example.com'), u16(1), u16(1),
    [0xc0, 12], u16(1), u16(1), u32(60), u16(4), [192, 0, 2, 1]);
  const message = decodeMessage(one);
  assert.equal(message.questions[0].name, 'a.example.com');
  assert.equal(message.answers[0].name, 'a.example.com');
  assert.deepEqual(message.answers[0].data, { address: '192.0.2.1' });
  // 两层指针：12 处指到 14，14 处写全
  const nested = wire(header(1, 0x8180, [1, 0, 0, 0]), [0xc0, 14], name('a.example.com'), u16(1), u16(1));
  assert.equal(decodeMessage(nested).questions[0].name, 'a.example.com');
  // rdata 里的名字（ns1.a.example.com 的 ns1 标签落在偏移 43）也能被后面的记录指过去
  const shared = wire(
    header(1, 0x8180, [1, 2, 0, 0]), name('a.example.com'), u16(1), u16(1),
    [0xc0, 12], u16(2), u16(1), u32(300), u16(6), label('ns1'), [0xc0, 12],
    [0xc0, 43], u16(1), u16(1), u32(300), u16(4), [10, 0, 0, 9]);
  const answered = decodeMessage(shared);
  assert.deepEqual(answered.answers.map((record) => record.name), ['a.example.com', 'ns1.a.example.com']);
});

test('解 rdata：NS / CNAME / PTR / MX / TXT / SOA / 不认识的类型', () => {
  const body = wire(
    header(3, 0x8180, [1, 6, 0, 0]), name('y.com'), u16(1), u16(1),
    [0xc0, 12], u16(5), u16(1), u32(300), u16(7), label('edge'), [0xc0, 12],                    // CNAME -> edge.y.com
    [0xc0, 12], u16(12), u16(1), u32(300), u16(2), [0xc0, 12],                                  // PTR -> y.com
    [0xc0, 12], u16(15), u16(1), u32(300), u16(9), u16(10), label('mail'), [0xc0, 12],          // MX 10 mail.y.com
    [0xc0, 12], u16(16), u16(1), u32(300), u16(4), [3, 0x68, 0x69, 0xe9],                       // TXT
    [0xc0, 12], u16(6), u16(1), u32(300), u16(26), name('m'), name('n'), u32(1), u32(2), u32(3), u32(4), u32(5),
    [0xc0, 12], u16(99), u16(1), u32(300), u16(2), [0xde, 0xad],
  );
  const message = decodeMessage(body);
  assert.deepEqual(message.answers[0].data, { name: 'edge.y.com' });
  assert.deepEqual(message.answers[1].data, { name: 'y.com' });
  assert.deepEqual(message.answers[2].data, { preference: 10, exchange: 'mail.y.com' });
  assert.deepEqual(message.answers[3].data, { strings: ['hi' + String.fromCharCode(0xe9)] });
  assert.deepEqual(message.answers[4].data,
    { mname: 'm', rname: 'n', serial: 1, refresh: 2, retry: 3, expire: 4, minimum: 5 });
  assert.deepEqual(message.answers[5].data, { raw: Uint8Array.from([0xde, 0xad]) });
  // 根名字就是空串
  const root = wire(header(1, 0x8180, [1, 0, 0, 0]), name(''), u16(2), u16(1));
  assert.equal(decodeMessage(root).questions[0].name, '');
});

test('报错：指针绕圈、标签不对、rdata 跟类型对不上、截断', () => {
  const ask = [...name('a.example.com'), ...u16(1), ...u16(1)];
  const message = (...records) => wire(header(1, 0x8180, [1, records.length, 0, 0]), ask, records);
  // 自己指自己、两个指针互相指
  assert.equal(code(() => decodeMessage(wire(header(1, 0x8180, [1, 1, 0, 0]), [0xc0, 12]))), 'ERR_BAD_NAME');
  assert.deepEqual(details(() => decodeMessage(wire(header(1, 0x8180, [1, 1, 0, 0]), [0xc0, 12]))), { offset: 12 });
  assert.equal(code(() => decodeMessage(wire(header(1, 0x8180, [1, 1, 0, 0]), [0xc0, 14], [0xc0, 12]))), 'ERR_BAD_NAME');
  // 指到标签中间：偏移 19 落在 example 这串字节里
  assert.equal(code(() => decodeMessage(message([0xc0, 19]))), 'ERR_BAD_NAME');
  // 0x40 那种开头
  assert.equal(code(() => decodeMessage(wire(header(1, 0x8180, [1, 1, 0, 0]), [0x40]))), 'ERR_BAD_NAME');
  // 名字超过 255 字节
  const tooLong = name('a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(63));
  assert.equal(code(() => decodeMessage(wire(header(1, 0x8180, [1, 1, 0, 0]), tooLong, u16(1), u16(1)))), 'ERR_BAD_NAME');
  // A 记录长度不是 4
  const answer = (type, rdata) => [0xc0, 12, ...u16(type), ...u16(1), ...u32(60), ...u16(rdata.length), rdata];
  assert.equal(code(() => decodeMessage(message(answer(1, [192, 0, 2])))), 'ERR_BAD_RECORD');
  assert.deepEqual(details(() => decodeMessage(message(answer(1, [192, 0, 2])))).type, 1);
  // NS 的 rdata 没正好用掉
  assert.equal(code(() => decodeMessage(message(answer(2, [...name('ns1'), 0])))), 'ERR_BAD_RECORD');
  // MX 太短
  assert.equal(code(() => decodeMessage(message(answer(15, [0, 10])))), 'ERR_BAD_RECORD');
  // TXT 段超出 rdata
  assert.equal(code(() => decodeMessage(message(answer(16, [0xff, 0x61, 0x62])))), 'ERR_BAD_RECORD');
  // SOA 后面字节数对不上
  assert.equal(code(() => decodeMessage(message(answer(6, [...name('m'), ...name('n'), 0, 0, 0, 1])))), 'ERR_BAD_RECORD');
  // rdata 声明得比报文长
  assert.equal(code(() => decodeMessage(message([0xc0, 12, ...u16(1), ...u16(1), ...u32(60), 0x00, 0xff, 192, 0, 2, 1]))), 'ERR_TRUNCATED');
  // 头不够、名字写一半、声明的记录数比实际多
  assert.equal(code(() => decodeMessage(wire([0x12, 0x34]))), 'ERR_TRUNCATED');
  assert.deepEqual(details(() => decodeMessage(wire([0x12, 0x34]))), { offset: 2 });
  assert.equal(code(() => decodeMessage(wire(header(1, 0x8180, [1, 1, 0, 0]), [3, 0x77, 0x77, 0x77]))), 'ERR_TRUNCATED');
  assert.equal(code(() => decodeMessage(wire(header(1, 0x8180, [0, 3, 0, 0])))), 'ERR_TRUNCATED');
  // 入参
  for (const value of [null, 'x', [1, 2], 7, undefined]) {
    assert.equal(code(() => decodeMessage(value)), 'ERR_BAD_ARGUMENT', String(value));
  }
});
