// 请求签名：规范请求、派生签名密钥与预签名 URL。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/canonical.test.js、test/sign.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》
// 两节写好了。那些约定不要改，把这里补出来。

import { createHash, createHmac } from 'node:crypto';

import { ReqsignError } from './errors.js';

export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
export const ALGORITHM = 'AWS4-HMAC-SHA256';

export const DEFAULTS = {
  maxExpires: 604800,
  unsigned: ['authorization', 'user-agent'],
};

const fail = (code, message) => {
  throw new ReqsignError(code, message);
};

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

// 只留 A-Za-z0-9-._~，其余按 UTF-8 编成大写 %XX；
// encodeURIComponent 漏编的 !'()* 自己补上。
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (ch) =>
  `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

const sha256Hex = (data) =>
  createHash('sha256').update(data, 'utf8').digest('hex');

const hmacBytes = (key, data) =>
  createHmac('sha256', key).update(data, 'utf8').digest();

const encodePath = (path) =>
  path.split('/').map(encode).join('/');

const EMPTY_BODY_HASH = sha256Hex('');

// 把 { 名: 值 | [值, ...] } 摊成 [名, 原始值] 的数组，null/undefined/'' 都算空串。
function collectQueryPairs(query) {
  if (query === undefined) return [];
  if (!isPlainObject(query)) fail('ERR_BAD_REQUEST', 'query 必须是对象');
  const pairs = [];
  for (const [name, rawValue] of Object.entries(query)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === null || value === undefined) {
        pairs.push([name, '']);
      } else if (typeof value === 'string') {
        pairs.push([name, value]);
      } else {
        fail('ERR_BAD_REQUEST', `查询参数 ${name} 的值必须是字符串`);
      }
    }
  }
  return pairs;
}

// 编码后先按名、再按值比字典序（UTF-16 码元顺序），同名同值不去重。
function buildQueryString(pairs) {
  return pairs
    .map(([name, value]) => [encode(name), encode(value)])
    .sort((left, right) => {
      if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
      if (left[1] !== right[1]) return left[1] < right[1] ? -1 : 1;
      return 0;
    })
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

const collapseWhitespace = (value) => value.trim().replace(/\s+/g, ' ');

// 头名一律小写，同名按出现顺序用逗号接，authorization/user-agent 不签。
function buildHeaders(headers) {
  if (!isPlainObject(headers)) fail('ERR_BAD_REQUEST', 'headers 必须是对象');
  const merged = new Map();
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (DEFAULTS.unsigned.includes(name)) continue;
    const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue];
    const parts = rawValues.map((value) => {
      if (value === null) return '';
      if (typeof value !== 'string') {
        fail('ERR_BAD_REQUEST', `请求头 ${rawName} 的值必须是字符串`);
      }
      return collapseWhitespace(value);
    });
    const joined = parts.join(',');
    merged.set(name, merged.has(name) ? `${merged.get(name)},${joined}` : joined);
  }
  if (!merged.has('host')) fail('ERR_BAD_REQUEST', 'headers 里必须有 host');
  const names = [...merged.keys()].sort();
  return {
    lines: names.map((name) => `${name}:${merged.get(name)}`),
    signedHeaders: names.join(';'),
  };
}

function payloadHashOf(payload) {
  if (payload === undefined) return EMPTY_BODY_HASH;
  if (payload === UNSIGNED_PAYLOAD) return UNSIGNED_PAYLOAD;
  if (typeof payload !== 'string') {
    fail('ERR_BAD_REQUEST', 'payload 必须是字符串或者 UNSIGNED_PAYLOAD');
  }
  return sha256Hex(payload);
}

// 校验请求形状并拼出规范请求的各组成部分。
function buildCanonical(request, { extraQuery = [], payloadHash = null } = {}) {
  if (!isPlainObject(request)) fail('ERR_BAD_REQUEST', 'request 必须是对象');
  if (!isNonEmptyString(request.method)) {
    fail('ERR_BAD_REQUEST', 'method 必须是非空字符串');
  }
  const method = request.method.toUpperCase();

  let path = request.path;
  if (path === undefined || path === null || path === '') {
    path = '/';
  } else if (typeof path !== 'string' || !path.startsWith('/')) {
    fail('ERR_BAD_REQUEST', 'path 必须是以 / 开头的字符串');
  }
  const encodedPath = encodePath(path);

  const queryString = buildQueryString([
    ...collectQueryPairs(request.query),
    ...extraQuery,
  ]);
  const { lines: headerLines, signedHeaders } = buildHeaders(request.headers);
  const hash = payloadHash ?? payloadHashOf(request.payload);
  const canonicalRequestString = [
    method,
    encodedPath,
    queryString,
    ...headerLines,
    '',
    signedHeaders,
    hash,
  ].join('\n');

  return {
    method,
    path: encodedPath,
    query: queryString,
    headerLines,
    signedHeaders,
    payloadHash: hash,
    canonicalRequest: canonicalRequestString,
  };
}

function parseCredentials(credentials) {
  if (!isPlainObject(credentials)) {
    fail('ERR_BAD_CREDENTIALS', 'credentials 必须是对象');
  }
  for (const field of ['accessKeyId', 'secretAccessKey', 'region', 'service']) {
    if (!isNonEmptyString(credentials[field])) {
      fail('ERR_BAD_CREDENTIALS', `credentials.${field} 必须是非空字符串`);
    }
  }
  return credentials;
}

// 收 Date、epoch 毫秒数字或可解析的字符串，统一转 UTC。
function parseTimestamp(timestamp) {
  let date;
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    date = new Date(timestamp);
  } else if (typeof timestamp === 'string' && timestamp.trim() !== '') {
    date = new Date(timestamp);
  } else {
    fail('ERR_BAD_TIMESTAMP', 'timestamp 没给或者解析不出合法时间');
  }
  if (Number.isNaN(date.getTime())) {
    fail('ERR_BAD_TIMESTAMP', 'timestamp 解析不出合法时间');
  }
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  const amzDate =
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}`
    + `${pad(date.getUTCDate())}T${pad(date.getUTCHours())}`
    + `${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return { amzDate, date: amzDate.slice(0, 8) };
}

// AWS4<secret> → date → region → service → aws4_request，每步喂上一步的字节。
function deriveSigningKey(credentials, date) {
  const key = hmacBytes(`AWS4${credentials.secretAccessKey}`, date);
  const regionKey = hmacBytes(key, credentials.region);
  const serviceKey = hmacBytes(regionKey, credentials.service);
  return hmacBytes(serviceKey, 'aws4_request');
}

function signingMaterials(request) {
  const credentials = parseCredentials(request.credentials);
  const { amzDate, date } = parseTimestamp(request.timestamp);
  const scope =
    `${date}/${credentials.region}/${credentials.service}/aws4_request`;
  return { credentials, amzDate, date, scope };
}

function buildStringToSign(canonicalRequestString, amzDate, scope) {
  return [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequestString),
  ].join('\n');
}

export function canonicalRequest(request) {
  return buildCanonical(request).canonicalRequest;
}

export function sign(request) {
  const built = buildCanonical(request);
  const { credentials, amzDate, scope } = signingMaterials(request);
  const stringToSign =
    buildStringToSign(built.canonicalRequest, amzDate, scope);
  const signingKey = deriveSigningKey(credentials, amzDate.slice(0, 8));
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign, 'utf8')
    .digest('hex');
  const authorization =
    `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, `
    + `SignedHeaders=${built.signedHeaders}, Signature=${signature}`;
  return {
    method: built.method,
    path: built.path,
    query: built.query,
    payloadHash: built.payloadHash,
    signedHeaders: built.signedHeaders,
    scope,
    canonicalRequest: built.canonicalRequest,
    stringToSign,
    signature,
    authorization,
  };
}

export function presign(request) {
  const expires = request.expires === undefined
    ? DEFAULTS.maxExpires
    : request.expires;
  if (!Number.isInteger(expires) || expires <= 0 || expires > DEFAULTS.maxExpires) {
    fail('ERR_BAD_ARGS',
      `expires 必须是不超过 ${DEFAULTS.maxExpires} 的正整数`);
  }
  const { credentials, amzDate, scope } = signingMaterials(request);
  const { signedHeaders } = buildHeaders(
    isPlainObject(request.headers) ? request.headers : {});
  const extraQuery = [
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ];
  const built = buildCanonical(request, {
    extraQuery,
    payloadHash: UNSIGNED_PAYLOAD,
  });
  const stringToSign =
    buildStringToSign(built.canonicalRequest, amzDate, scope);
  const signingKey = deriveSigningKey(credentials, amzDate.slice(0, 8));
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign, 'utf8')
    .digest('hex');
  const query = `${built.query}&X-Amz-Signature=${signature}`;
  return {
    url: `${built.path}?${query}`,
    query,
    path: built.path,
    signedHeaders: built.signedHeaders,
    payloadHash: UNSIGNED_PAYLOAD,
    scope,
    canonicalRequest: built.canonicalRequest,
    stringToSign,
    signature,
    expires,
  };
}
