// 测试用的 body 拼装与事件归一化。test/ 下每个 .test.js 都用它，
// 它不是用例文件本身（package.json 里显式列了三个用例文件）。

import crypto from 'node:crypto';
import { MultipartParser } from '../lib/multipart.js';

export const BOUNDARY = '----formweaveBoundary7a13';

export function part({
  name,
  filename = null,
  contentType = null,
  extraHeaders = {},
  content = Buffer.alloc(0),
}) {
  const disposition = filename === null
    ? `form-data; name="${name}"`
    : `form-data; name="${name}"; filename="${filename}"`;
  const lines = [`Content-Disposition: ${disposition}`];
  if (contentType !== null) lines.push(`Content-Type: ${contentType}`);
  for (const [key, value] of Object.entries(extraHeaders)) lines.push(`${key}: ${value}`);
  const head = Buffer.from(`${lines.join('\r\n')}\r\n\r\n`, 'latin1');
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\n`, 'latin1'),
    head,
    body,
    Buffer.from('\r\n', 'latin1'),
  ]);
}

export function buildBody(parts, { preamble = '', epilogue = '', close = true } = {}) {
  const chunks = [Buffer.from(preamble, 'latin1'), ...parts];
  if (close) chunks.push(Buffer.from(`--${BOUNDARY}--`, 'latin1'));
  chunks.push(Buffer.from(epilogue, 'latin1'));
  return Buffer.concat(chunks);
}

export function contentTypeFor(boundary = BOUNDARY) {
  return `multipart/form-data; boundary=${boundary}`;
}

export function attach(parser) {
  const events = [];
  parser.on('part', (info) => {
    events.push(['part', {
      index: info.index,
      name: info.name,
      filename: info.filename,
      contentType: info.contentType,
    }]);
  });
  parser.on('data', (chunk, info) => {
    events.push(['data', info.index, Buffer.from(chunk)]);
  });
  parser.on('partEnd', (info) => {
    events.push(['partEnd', {
      index: info.index,
      name: info.name,
      filename: info.filename,
      size: info.size,
    }]);
  });
  parser.on('end', () => events.push(['end']));
  parser.on('reject', (error) => {
    events.push(['reject', { code: error.code, status: error.status, message: error.message }]);
  });
  return events;
}

export function newParser(contentType = contentTypeFor(), options = {}) {
  return new MultipartParser(contentType, options);
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function normalize(events) {
  const merged = [];
  for (const event of events) {
    const last = merged[merged.length - 1];
    if (event[0] === 'data' && last && last[0] === 'data' && last[1] === event[1]) {
      last[2] = Buffer.concat([last[2], event[2]]);
      continue;
    }
    if (event[0] === 'data') merged.push(['data', event[1], Buffer.from(event[2])]);
    else merged.push(event);
  }
  return merged;
}

export function describe(events) {
  return normalize(events).map((event) => {
    if (event[0] === 'data') return `data#${event[1]} ${event[2].length}b ${sha256(event[2]).slice(0, 12)}`;
    if (event[0] === 'part') return `part#${event[1].index} name=${event[1].name} filename=${event[1].filename} type=${event[1].contentType}`;
    if (event[0] === 'partEnd') return `partEnd#${event[1].index} size=${event[1].size}`;
    if (event[0] === 'reject') return `reject ${event[1].code}`;
    return event[0];
  });
}

export function contentOf(events, index) {
  const chunks = events.filter((e) => e[0] === 'data' && e[1] === index).map((e) => e[2]);
  return Buffer.concat(chunks);
}

export function feedAll(parser, buffer, chunkSize = 0) {
  if (!chunkSize) {
    parser.write(buffer);
    return;
  }
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    parser.write(buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length)));
  }
}
