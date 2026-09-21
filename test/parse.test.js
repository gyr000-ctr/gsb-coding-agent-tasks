import assert from 'node:assert/strict';
import test from 'node:test';
import { MultipartError } from '../lib/errors.js';
import { MultipartParser, parseContentType } from '../lib/multipart.js';
import {
  BOUNDARY,
  attach,
  buildBody,
  contentOf,
  contentTypeFor,
  describe,
  feedAll,
  newParser,
  normalize,
  part,
  sha256,
} from './harness.mjs';

test('parseContentType 认得引号、大小写和多余参数', () => {
  const parsed = parseContentType('Multipart/Form-Data; charset=UTF-8; boundary="abc 123"');
  assert.equal(parsed.type, 'multipart');
  assert.equal(parsed.subtype, 'form-data');
  assert.equal(parsed.params.boundary, 'abc 123');
  assert.equal(parsed.params.charset, 'UTF-8');

  assert.equal(parseContentType(''), null);
  assert.equal(parseContentType(undefined), null);
  assert.equal(parseContentType('nonsense'), null);
  assert.equal(parseContentType('application/json').subtype, 'json');
  assert.equal(parseContentType('multipart/form-data').params.boundary, undefined);
});

test('缺 boundary 的 content-type 在构造时就抛 MALFORMED_CONTENT_TYPE', () => {
  for (const header of ['application/json', 'multipart/form-data', 'multipart/form-data; charset=utf-8']) {
    assert.throws(() => new MultipartParser(header), (error) => {
      assert.ok(error instanceof MultipartError);
      assert.equal(error.code, 'MALFORMED_CONTENT_TYPE');
      assert.equal(error.status, 400);
      return true;
    });
  }
});

test('两个 part：事件顺序、metadata 和内容都对得上', () => {
  const note = Buffer.from('第一段笔记\r\n第二行', 'utf8');
  const payload = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x0d, 0x0a, 0x7f]);
  const body = buildBody([
    part({ name: 'note', content: note }),
    part({ name: 'blob', filename: 'blob.bin', contentType: 'application/octet-stream', content: payload }),
  ]);

  const parser = newParser();
  const events = attach(parser);
  feedAll(parser, body);
  parser.end();

  assert.deepEqual(describe(events), [
    'part#0 name=note filename=null type=',
    `data#0 ${note.length}b ${sha256(note).slice(0, 12)}`,
    'partEnd#0 size=' + note.length,
    'part#1 name=blob filename=blob.bin type=application/octet-stream',
    `data#1 ${payload.length}b ${sha256(payload).slice(0, 12)}`,
    'partEnd#1 size=' + payload.length,
    'end',
  ]);
  assert.deepEqual(contentOf(events, 0), note);
  assert.deepEqual(contentOf(events, 1), payload);
});

test('preamble 和 epilogue 被忽略，空的 part 也算一个 part', () => {
  const body = buildBody(
    [
      part({ name: 'empty', content: Buffer.alloc(0) }),
      part({ name: 'x', filename: 'y.txt', contentType: 'text/plain', content: 'ok' }),
    ],
    { preamble: 'this preamble is not part of the form\r\n', epilogue: '\r\n--trailing junk' },
  );

  const parser = newParser();
  const events = attach(parser);
  feedAll(parser, body);
  parser.end();

  assert.deepEqual(describe(events), [
    'part#0 name=empty filename=null type=',
    'partEnd#0 size=0',
    'part#1 name=x filename=y.txt type=text/plain',
    'data#1 2b ' + sha256(Buffer.from('ok')).slice(0, 12),
    'partEnd#1 size=2',
    'end',
  ]);
});

test('内容里像分隔符但又不是的字节不会截断内容', () => {
  const tricky = [
    Buffer.from(`head\r\n--not-the-boundary\r\ntail`, 'latin1'),
    Buffer.from(`head\r\n--${BOUNDARY}tail`, 'latin1'),
    Buffer.from(`left\r\n--${BOUNDARY.slice(0, -1)}\r\nright`, 'latin1'),
    Buffer.concat([
      Buffer.from('partial delimiter at the very end\r\n--', 'latin1'),
      Buffer.from(BOUNDARY.slice(0, 5), 'latin1'),
    ]),
  ];

  for (const content of tricky) {
    const body = buildBody([part({ name: 'f', filename: 'f.bin', content })]);
    const parser = newParser();
    const events = attach(parser);
    feedAll(parser, body);
    parser.end();
    assert.equal(describe(events).at(-1), 'end', describe(events).join(' | '));
    assert.deepEqual(contentOf(events, 0), content);
  }
});

test('逐字节喂和一次喂，归一化后的事件序列完全一致', () => {
  const bodies = [
    buildBody([part({ name: 'a', content: 'hello' })]),
    buildBody([
      part({ name: 'a', content: 'hello' }),
      part({ name: 'b', filename: 'b.bin', contentType: 'application/octet-stream', content: Buffer.from([1, 2, 3, 0, 255]) }),
      part({ name: 'c', content: '' }),
    ]),
    buildBody([part({ name: 'x', filename: 'x.txt', content: `head\r\n--${BOUNDARY}tail` })], { preamble: 'p\r\n' }),
    buildBody([part({ name: 'x', filename: 'x.txt', content: Buffer.alloc(5000, 0x41) })]),
  ];

  for (const body of bodies) {
    const whole = newParser();
    const wholeEvents = attach(whole);
    feedAll(whole, body);
    whole.end();

    const drip = newParser();
    const dripEvents = attach(drip);
    feedAll(drip, body, 1);
    drip.end();

    assert.deepEqual(describe(dripEvents), describe(wholeEvents));
    assert.deepEqual(normalize(dripEvents), normalize(wholeEvents));
  }
});

test('半路 quit 掉的 body 分别报 MALFORMED_BODY 和 UNEXPECTED_EOF', () => {
  const noDelimiter = newParser();
  const noDelimiterEvents = attach(noDelimiter);
  noDelimiter.write(Buffer.from('this body never had a delimiter', 'latin1'));
  noDelimiter.end();
  assert.deepEqual(describe(noDelimiterEvents), ['reject MALFORMED_BODY']);

  const partial = newParser();
  const partialEvents = attach(partial);
  const body = buildBody([part({ name: 'a', content: 'hello' })]);
  partial.write(body.subarray(0, body.length - 6));
  partial.end();
  assert.deepEqual(describe(partialEvents).at(-1), 'reject UNEXPECTED_EOF');
});

test('分隔符后面既不是 CRLF 也不是 -- 属于坏 body', () => {
  const body = Buffer.concat([
    Buffer.from(`--${BOUNDARY}ZZ\r\nContent-Disposition: form-data; name="a"\r\n\r\nx\r\n`, 'latin1'),
    Buffer.from(`--${BOUNDARY}--`, 'latin1'),
  ]);
  const parser = newParser();
  const events = attach(parser);
  feedAll(parser, body);
  parser.end();
  assert.deepEqual(describe(events).at(-1), 'reject MALFORMED_BODY');
});

test('header 段坏掉时报 MALFORMED_HEADERS', () => {
  const cases = [
    `--${BOUNDARY}\r\nContent-Disposition : form-data; name="a"\r\n\r\nx\r\n--${BOUNDARY}--`,
    `--${BOUNDARY}\r\nContent-Disposition: form-data;\r\n name="a"\r\n\r\nx\r\n--${BOUNDARY}--`,
    `--${BOUNDARY}\r\nno-colon-here\r\n\r\nx\r\n--${BOUNDARY}--`,
  ];
  for (const text of cases) {
    const parser = newParser();
    const events = attach(parser);
    feedAll(parser, Buffer.from(text, 'latin1'));
    parser.end();
    const last = describe(events).at(-1);
    assert.equal(last, 'reject MALFORMED_HEADERS', `${JSON.stringify(text)} -> ${describe(events).join(' | ')}`);
  }
});

test('reject 之后不再产生任何事件', () => {
  const parser = newParser(contentTypeFor(), { maxPartBytes: 8 });
  const events = attach(parser);
  const body = buildBody([part({ name: 'a', content: '0123456789' })]);
  feedAll(parser, body);
  assert.equal(describe(events).at(-1), 'reject PART_TOO_LARGE');
  assert.equal(contentOf(events, 0).length, 8);
  const before = events.length;
  parser.write(Buffer.from('more', 'latin1'));
  parser.end();
  assert.equal(events.length, before);
});
