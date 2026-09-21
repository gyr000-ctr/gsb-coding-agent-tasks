import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { createUploadServer } from '../lib/server.js';
import { buildBody, contentTypeFor, part, sha256 } from './harness.mjs';

async function withServer(options, run) {
  const server = createUploadServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await run({ port, base: `http://127.0.0.1:${port}` });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function rawExchange(port, request, chunkSize) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const chunks = [];
    socket.on('connect', async () => {
      for (let offset = 0; offset < request.length; offset += chunkSize) {
        socket.write(request.subarray(offset, Math.min(offset + chunkSize, request.length)));
        await new Promise((r) => setImmediate(r));
      }
    });
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    socket.on('error', reject);
  });
}

function requestFor(body, extra = '') {
  const head = `POST /upload HTTP/1.1\r\n`
    + `Host: 127.0.0.1\r\n`
    + `Content-Type: ${contentTypeFor()}\r\n`
    + `Content-Length: ${body.length}\r\n`
    + `Connection: close\r\n${extra}\r\n`;
  return Buffer.concat([Buffer.from(head, 'latin1'), body]);
}

test('GET /healthz 回 200', { timeout: 20000 }, async () => {
  await withServer({}, async ({ base }) => {
    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});

test('浏览器风格的 FormData 上传能拿到字段、文件名、大小和 sha256', { timeout: 20000 }, async () => {
  const bytes = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x0d, 0x0a]);
  await withServer({}, async ({ base }) => {
    const form = new FormData();
    form.append('note', 'note-one 世界');
    form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), 'payload.bin');

    const response = await fetch(`${base}/upload`, { method: 'POST', body: form });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.fields.note, 'note-one 世界');
    assert.equal(payload.files.length, 1);
    assert.equal(payload.files[0].name, 'file');
    assert.equal(payload.files[0].filename, 'payload.bin');
    assert.equal(payload.files[0].size, bytes.length);
    assert.equal(payload.files[0].sha256, sha256(bytes));
  });
});

test('不是 multipart 的请求回 400 MALFORMED_CONTENT_TYPE', { timeout: 20000 }, async () => {
  await withServer({}, async ({ base }) => {
    const response = await fetch(`${base}/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'MALFORMED_CONTENT_TYPE');
  });
});

test('请求被切成单个字节发过来也能收全', { timeout: 30000 }, async () => {
  const content = Buffer.alloc(1024, 0x63);
  const body = buildBody([part({
    name: 'f',
    filename: 'f.bin',
    contentType: 'application/octet-stream',
    content,
  })]);

  await withServer({}, async ({ port }) => {
    const raw = await rawExchange(port, requestFor(body), 1);
    const [head, payload] = raw.split('\r\n\r\n');
    assert.match(head, /^HTTP\/1\.1 200 /);
    const parsed = JSON.parse(payload);
    assert.equal(parsed.files[0].size, content.length);
    assert.equal(parsed.files[0].sha256, sha256(content));
  });
});

test('超过单 part 上限回 413 PART_TOO_LARGE', { timeout: 20000 }, async () => {
  const body = buildBody([part({ name: 'f', filename: 'f.bin', content: Buffer.alloc(4096, 0x64) })]);
  await withServer({ maxPartBytes: 512 }, async ({ port }) => {
    const raw = await rawExchange(port, requestFor(body), 4096);
    const [head, payload] = raw.split('\r\n\r\n');
    assert.match(head, /^HTTP\/1\.1 413 /);
    assert.equal(JSON.parse(payload).error, 'PART_TOO_LARGE');
  });
});

test('客户端发到一半断开，服务端不崩、后面的请求照样能处理', { timeout: 20000 }, async () => {
  const content = Buffer.alloc(64 * 1024, 0x65);
  const body = buildBody([part({ name: 'f', filename: 'f.bin', content })]);

  await withServer({}, async ({ port, base }) => {
    await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(requestFor(body).subarray(0, 2048), () => {
          socket.destroy();
          resolve();
        });
      });
      socket.on('error', () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 200);
  });
});
