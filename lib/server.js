// 上传服务：POST /upload 收 multipart/form-data，落成 { fields, files }，
// GET /healthz 给探活用。这里只是把 lib/multipart.js 包一层，
// 真正的解析、上限判定、错误分类都在解析器里，别在这个文件里补。

import crypto from 'node:crypto';
import http from 'node:http';
import { MultipartError } from './errors.js';
import { DEFAULTS, MultipartParser } from './multipart.js';

function sendJson(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
  if (!res.writableEnded) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.length),
    });
    res.end(body);
  }
}

// 早早就把请求回掉的时候（404 / 400 / 413），body 可能还在路上：
// 先把剩下的字节读到黑洞里再回，不然 Node 会在响应写完的时候把连接 reset 掉，
// 客户端那边只会看到 ECONNRESET，看不到我们给的状态码和错误码。
function respondAfterDrain(req, res, send) {
  req.on('error', () => {});
  if (req.complete || req.readableEnded) {
    send();
    return;
  }
  req.resume();
  req.on('end', send);
}

function statusOf(error) {
  return error instanceof MultipartError ? error.status : 500;
}

function codeOf(error) {
  return error instanceof MultipartError ? error.code : 'INTERNAL';
}

export function createUploadServer(options = {}) {
  const limits = {
    maxPartBytes: options.maxPartBytes ?? DEFAULTS.maxPartBytes,
    maxTotalBytes: options.maxTotalBytes ?? DEFAULTS.maxTotalBytes,
    maxHeaderBytes: options.maxHeaderBytes ?? DEFAULTS.maxHeaderBytes,
  };

  return http.createServer((req, res) => {
    try {
      handle(req, res, limits);
    } catch (error) {
      sendJson(res, 500, { error: 'INTERNAL', message: String(error?.message ?? error) });
    }
  });
}

function handle(req, res, limits) {
  const url = new URL(req.url, 'http://placeholder');

  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method !== 'POST' || url.pathname !== '/upload') {
    respondAfterDrain(req, res, () => sendJson(res, 404, { error: 'NOT_FOUND' }));
    return;
  }

  let parser;
  try {
    parser = new MultipartParser(req.headers['content-type'], limits);
  } catch (error) {
    respondAfterDrain(req, res, () => {
      sendJson(res, statusOf(error), { error: codeOf(error), message: error.message });
    });
    return;
  }

  const fields = {};
  const files = [];
  const entries = new Map();
  let stopped = false;   // 不再往解析器里喂了（被拒 / 客户端断了）
  let done = false;      // 响应已经发出去（或者没机会发）

  const finish = (status, payload) => {
    if (done) return;
    done = true;
    sendJson(res, status, payload);
  };

  parser.on('part', (info) => {
    entries.set(info.index, {
      index: info.index,
      name: info.name,
      filename: info.filename,
      size: 0,
      hash: crypto.createHash('sha256'),
      chunks: info.filename === null ? [] : null,
    });
  });

  parser.on('data', (chunk, info) => {
    const entry = entries.get(info.index);
    if (!entry) return;
    entry.size += chunk.length;
    if (entry.chunks) entry.chunks.push(chunk);
    else entry.hash.update(chunk);
  });

  parser.on('partEnd', (info) => {
    const entry = entries.get(info.index);
    if (!entry) return;
    if (entry.chunks) {
      fields[entry.name] = Buffer.concat(entry.chunks).toString('utf8');
      return;
    }
    files.push({
      name: entry.name,
      filename: entry.filename,
      size: entry.size,
      sha256: entry.hash.digest('hex'),
    });
  });

  parser.on('end', () => {
    finish(200, { fields, files, totalBytes: parser.totalBytes });
  });

  parser.on('reject', (error) => {
    stopped = true;
    respondAfterDrain(req, res, () => {
      finish(error.status, { error: error.code, message: error.message });
    });
  });

  req.on('error', () => {});
  req.on('aborted', () => {
    stopped = true;
    done = true;
  });
  req.on('close', () => {
    if (!done && !res.writableEnded) {
      stopped = true;
      done = true;
    }
  });
  req.on('data', (chunk) => {
    if (stopped || done) return;
    parser.write(chunk);
  });
  req.on('end', () => {
    if (stopped || done) return;
    parser.end();
  });
}
