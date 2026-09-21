// 手工过一遍解析器：流式喂一块、撞一次上限、再起个服务真收一次上传。
// 输出是固定的，README 里贴的就是它，改输出记得同步 README。

import crypto from 'node:crypto';
import { createUploadServer } from '../lib/server.js';
import { DEFAULTS, MultipartParser } from '../lib/multipart.js';

const BOUNDARY = '----formweaveDemoBoundary';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function partBytes({ name, filename = null, contentType = null, content = Buffer.alloc(0) }) {
  const disposition = filename === null
    ? `form-data; name="${name}"`
    : `form-data; name="${name}"; filename="${filename}"`;
  const lines = [`Content-Disposition: ${disposition}`];
  if (contentType !== null) lines.push(`Content-Type: ${contentType}`);
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\n${lines.join('\r\n')}\r\n\r\n`, 'latin1'),
    content,
    Buffer.from('\r\n', 'latin1'),
  ]);
}

function trace(body, options = {}) {
  const parser = new MultipartParser(`multipart/form-data; boundary=${BOUNDARY}`, options);
  const collected = [];
  const lines = [];
  parser.on('part', (info) => {
    collected[info.index] = { info, chunks: [] };
  });
  parser.on('data', (chunk, info) => {
    collected[info.index].chunks.push(Buffer.from(chunk));
  });
  parser.on('partEnd', (info) => {
    const chunks = collected[info.index].chunks;
    const content = Buffer.concat(chunks);
    lines.push(
      `part #${info.index} name=${info.name} filename=${info.filename ?? '-'} `
      + `type=${info.contentType || '-'} size=${info.size} sha256=${sha256(content).slice(0, 12)}`,
    );
  });
  parser.on('end', () => lines.push(`end: ${collected.length} parts`));
  parser.on('reject', (error) => lines.push(`reject ${error.code} (${error.status}): ${error.message}`));

  for (let offset = 0; offset < body.length; offset += 3) {
    parser.write(body.subarray(offset, Math.min(offset + 3, body.length)));
  }
  parser.end();
  return lines;
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function main() {
  const note = Buffer.from('hello from demo', 'utf8');
  const avatar = Buffer.from('PNG-ish bytes 0123456789', 'latin1');
  const body = Buffer.concat([
    partBytes({ name: 'note', contentType: 'text/plain', content: note }),
    partBytes({ name: 'avatar', filename: 'avatar.png', contentType: 'image/png', content: avatar }),
    partBytes({ name: 'empty' }),
    Buffer.from(`--${BOUNDARY}--`, 'latin1'),
  ]);

  console.log('formweave demo');
  console.log('[1] 三字节一块喂进来的三段表单');
  for (const line of trace(body)) console.log(`    ${line}`);

  console.log('[2] 单 part 上限 32 字节，喂一份 64 字节的内容');
  for (const line of trace(
    Buffer.concat([
      partBytes({ name: 'big', filename: 'big.bin', content: Buffer.alloc(64, 0x78) }),
      Buffer.from(`--${BOUNDARY}--`, 'latin1'),
    ]),
    { maxPartBytes: 32 },
  )) {
    console.log(`    ${line}`);
  }

  console.log('[3] 起一个服务，真收一次上传');
  const server = createUploadServer({ maxPartBytes: DEFAULTS.maxPartBytes });
  const port = await listen(server);
  try {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    console.log(`    GET /healthz -> ${health.status} ${JSON.stringify(await health.json())}`);

    const upload = Buffer.from('upload payload 0123456789', 'latin1');
    const form = new FormData();
    form.append('note', 'hello');
    form.append('file', new Blob([upload], { type: 'application/octet-stream' }), 'upload.bin');
    const response = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: form });
    const payload = await response.json();
    console.log(`    POST /upload -> ${response.status} fields=${JSON.stringify(payload.fields)}`);
    console.log(`    files=${JSON.stringify(payload.files)} totalBytes=${payload.totalBytes}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

await main();
