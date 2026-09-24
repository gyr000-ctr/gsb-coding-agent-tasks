import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeMessage, decodeMessage } from '../lib/dnscodec.js';
import { code, details, hex, normalize, find } from './util.js';

const question = (name, type = 1, klass = 1) => ({ name, type, class: klass });
const record = (name, type, data, ttl = 60) => ({ name, type, class: 1, ttl, data });
const a = (address) => ({ address });
const label = (text) => [text.length, ...[...text].map((ch) => ch.charCodeAt(0))];
const wireName = (text) => [...text.split('.').flatMap((part) => label(part)), 0];
const sections = (buffer) => {
  const parsed = decodeMessage(buffer);
  return [parsed.questions.length, parsed.answers.length, parsed.authorities.length,
    parsed.additionals.length, parsed.flags.tc];
};

test('编一条最小问询：头、标志位、名字', () => {
  const one = encodeMessage({ id: 0x1234, flags: { rd: true }, questions: [question('www.example.com')] });
  assert.equal(hex(one), '12340100000100000000000003777777076578616d706c6503636f6d0000010001');
  assert.equal(one.length, 33);
});

test('标志位从左往右摆', () => {
  const bits = (flags) => hex(encodeMessage({ id: 0, flags, questions: [] })).slice(4, 8);
  assert.equal(bits({}), '0000');
  assert.equal(bits({ qr: true, aa: true, tc: true, rd: true, ra: true, rcode: 3 }), '8783');
  assert.equal(bits({ qr: true, opcode: 15, rcode: 15 }), 'f80f');
});

test('名字压缩：能指的就指，偏移超过 0x4000 的不进压缩表', () => {
  // 同一个名字第二次出现就指回第一次
  const echoed = encodeMessage({
    id: 1,
    flags: { qr: true, aa: true },
    questions: [question('a.example.com')],
    answers: [record('a.example.com', 1, a('192.0.2.1'))],
  });
  assert.equal(find(echoed, wireName('a.example.com')), 1);
  assert.equal(find(echoed, [0xc0, 12]), 1);
  // 后缀也给指：第二个问询只写 mail，后面指回第一个问询里的 example.com
  const two = encodeMessage({
    id: 2,
    flags: {},
    questions: [question('www.example.com'), question('mail.example.com')],
  });
  assert.equal(find(two, wireName('example.com')), 1);
  assert.equal(find(two, [0xc0, 16]), 1);
  // 名字落在 0x4000 之后就不再进压缩表了，第二次出现只能老老实实写全
  const big = encodeMessage({
    id: 3,
    flags: { qr: true },
    answers: [
      record('a.com', 99, { raw: new Uint8Array(16400) }, 0),
      record('b.zzz', 1, a('10.0.0.1'), 0),
      record('b.zzz', 1, a('10.0.0.2'), 0),
    ],
  });
  assert.equal(find(big, wireName('b.zzz')), 2);
});

test('maxSize 截断：从 additional 往前丢，tc 置位', () => {
  const message = {
    id: 0x0a0b,
    flags: { qr: true, aa: true, rd: true, ra: true },
    questions: [question('example.com')],
    answers: [record('example.com', 1, a('192.0.2.1')), record('example.com', 1, a('192.0.2.2'))],
    authorities: [record('example.com', 2, { name: 'ns1.example.com' })],
    additionals: [record('ns1.example.com', 1, a('192.0.2.53'))],
  };
  const full = encodeMessage(message);
  assert.equal(full.length, 95);
  assert.deepEqual(sections(full), [1, 2, 1, 1, false]);
  // 刚好放得下就不截
  assert.deepEqual(sections(encodeMessage(message, { maxSize: full.length })), [1, 2, 1, 1, false]);
  // 少一个字节：先丢 additional
  const dropped = encodeMessage(message, { maxSize: full.length - 1 });
  assert.deepEqual(sections(dropped), [1, 2, 1, 0, true]);
  assert.ok(dropped.length <= full.length - 1);
  // 再挤：丢 authority，再丢 answer，再丢 question
  assert.deepEqual(sections(encodeMessage(message, { maxSize: 60 })), [1, 1, 0, 0, true]);
  assert.deepEqual(sections(encodeMessage(message, { maxSize: 40 })), [1, 0, 0, 0, true]);
  assert.deepEqual(sections(encodeMessage(message, { maxSize: 20 })), [0, 0, 0, 0, true]);
  assert.deepEqual(sections(encodeMessage(message, { maxSize: 12 })), [0, 0, 0, 0, true]);
  assert.equal(encodeMessage(message, { maxSize: 12 }).length, 12);
});

test('编了再解：各类 rdata 都回来', () => {
  const original = {
    id: 0x2222,
    flags: { qr: true, opcode: 0, aa: true, tc: false, rd: true, ra: true, rcode: 0 },
    questions: [question('example.com'), question('www.example.com', 28, 1)],
    answers: [
      record('example.com', 1, a('192.0.2.1')),
      record('example.com', 5, { name: 'edge.example.com' }),
      record('example.com', 2, { name: 'ns1.example.com' }),
      record('2.0.192.in-addr.arpa', 12, { name: 'example.com' }),
      record('example.com', 15, { preference: 10, exchange: 'mail.example.com' }),
      record('example.com', 16, { strings: ['v=spf1 -all', 'hi' + String.fromCharCode(0xe9)] }),
      record('example.com', 6, {
        mname: 'ns1.example.com', rname: 'hostmaster.example.com',
        serial: 7, refresh: 8, retry: 9, expire: 10, minimum: 11,
      }),
      record('example.com', 99, { raw: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]) }),
    ],
    authorities: [record('example.com', 2, { name: 'ns2.example.com' })],
    additionals: [record('ns2.example.com', 1, a('192.0.2.54'))],
  };
  assert.deepEqual(normalize(decodeMessage(encodeMessage(original))), normalize(original));
});

test('入参不合法就报 ERR_BAD_ARGUMENT', () => {
  const bad = (message, options) => code(() => encodeMessage(message, options));
  assert.equal(bad(null), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([]), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ flags: {}, questions: [] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 70000, flags: {}, questions: [] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: { rd: 1 }, questions: [] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: { opcode: 16 }, questions: [] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, questions: 'x' }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, questions: [{ name: 'a.com', type: 1 }] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, questions: [{ name: 'a.com', type: 1, class: 1 }, 'x'] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, questions: [question('a..com')] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, questions: [question('a'.repeat(64) + '.com')] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, questions: [question('b.\u4e2d')] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, questions: [question('a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(63))] }), 'ERR_BAD_ARGUMENT');
  // 记录本身
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 70000, a('1.2.3.4'))] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 1, a('1.2.3.4'), -1)] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, answers: [{ name: 'a.com', type: 1, class: 1, ttl: 0, data: null }] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 99, a('1.2.3.4'))] }), 'ERR_BAD_ARGUMENT');
  // A 地址
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 1, a('192.0.2'))] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 1, a('999.0.0.1'))] }), 'ERR_BAD_ARGUMENT');
  // MX / TXT / SOA
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 15, { preference: 70000, exchange: 'm.a.com' })] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 16, { strings: 'x' })] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 16, { strings: ['x'.repeat(256)] })] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 16, { strings: ['\u4e2d'] })] }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 6, { mname: 'm', rname: 'n', serial: 1, refresh: 2, retry: 3, expire: 4 })] }), 'ERR_BAD_ARGUMENT');
  // maxSize
  assert.equal(bad({ id: 1, flags: {} }, { maxSize: 11 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad({ id: 1, flags: {} }, { maxSize: 12.5 }), 'ERR_BAD_ARGUMENT');
  assert.deepEqual(details(() => encodeMessage({ id: 1, flags: {} }, { maxSize: 11 })), { maxSize: 11 });
  // 报文本身超过 65535
  assert.equal(bad({ id: 1, flags: {}, answers: [record('a.com', 99, { raw: new Uint8Array(70000) }, 0)] }), 'ERR_BAD_ARGUMENT');
});
