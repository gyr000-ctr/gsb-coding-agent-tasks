import assert from 'node:assert/strict';
import test from 'node:test';
import { BOUNDARY, attach, buildBody, contentOf, describe, feedAll, newParser, part } from './harness.mjs';

test('单个 part 超过上限：把允许的部分发完就立刻拒绝，状态码 413', () => {
  const parser = newParser(undefined, { maxPartBytes: 16 });
  const events = attach(parser);
  feedAll(parser, buildBody([part({ name: 'a', filename: 'a.bin', content: Buffer.alloc(40, 0x61) })]));

  const last = describe(events).at(-1);
  assert.equal(last, 'reject PART_TOO_LARGE');
  assert.equal(contentOf(events, 0).length, 16);
  const reject = events.find((event) => event[0] === 'reject');
  assert.equal(reject[1].status, 413);
  assert.equal(events.some((event) => event[0] === 'end'), false);
  assert.equal(events.some((event) => event[0] === 'partEnd'), false);
});

test('总量超过上限时报 TOTAL_TOO_LARGE（单个 part 还没到上限）', () => {
  const parser = newParser(undefined, { maxPartBytes: 1024, maxTotalBytes: 16 });
  const events = attach(parser);
  feedAll(parser, buildBody([
    part({ name: 'a', content: 'aaaaaaaaaaaa' }),
    part({ name: 'b', content: 'bbbbbbbbbbbb' }),
  ]));

  assert.equal(describe(events).at(-1), 'reject TOTAL_TOO_LARGE');
  assert.equal(contentOf(events, 0).length, 12);
  assert.equal(contentOf(events, 1).length, 4);
  assert.equal(events.find((event) => event[0] === 'reject')[1].status, 413);
});

test('两个上限同时到线时报 PART_TOO_LARGE', () => {
  const parser = newParser(undefined, { maxPartBytes: 4, maxTotalBytes: 4 });
  const events = attach(parser);
  feedAll(parser, buildBody([part({ name: 'a', content: '0123456789' })]));
  assert.equal(describe(events).at(-1), 'reject PART_TOO_LARGE');
});

test('大 part 是边收边发的，留下的未决字节不会超过分隔符的量级', () => {
  const content = Buffer.alloc(200_000, 0x62);
  const body = buildBody([part({
    name: 'big',
    filename: 'big.bin',
    contentType: 'application/octet-stream',
    content,
  })]);
  const overhead = body.length - content.length;
  const bound = overhead + BOUNDARY.length + 8;

  const parser = newParser();
  const events = attach(parser);
  let fed = 0;
  const chunkSize = 8192;
  for (let offset = 0; offset < body.length; offset += chunkSize) {
    const chunk = body.subarray(offset, Math.min(offset + chunkSize, body.length));
    fed += chunk.length;
    parser.write(chunk);
    const emitted = contentOf(events, 0).length;
    assert.ok(
      fed - emitted <= bound,
      `喂了 ${fed} 字节、只发出 ${emitted} 字节，未决 ${fed - emitted} 字节超过上限 ${bound}`,
    );
  }
  parser.end();

  const dataEvents = events.filter((event) => event[0] === 'data');
  assert.ok(dataEvents.length >= 10, `data 事件只有 ${dataEvents.length} 次，看起来是攒完才发的`);
  assert.deepEqual(contentOf(events, 0), content);
  assert.equal(describe(events).at(-1), 'end');
});

test('header 段超过 maxHeaderBytes 时报 MALFORMED_HEADERS', () => {
  const padding = 'x'.repeat(200);
  const body = buildBody([part({ name: 'a', content: 'ok', extraHeaders: { 'X-Padding': padding } })]);
  const parser = newParser(undefined, { maxHeaderBytes: 64 });
  const events = attach(parser);
  feedAll(parser, body);
  parser.end();
  assert.equal(describe(events).at(-1), 'reject MALFORMED_HEADERS');
});
