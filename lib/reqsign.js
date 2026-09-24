// 请求签名：规范请求、派生签名密钥与预签名 URL。
//
// 口径见 README 的《口径》和《API》两节；出错一律抛 lib/errors.js 的 ReqsignError。

import { createHash, createHmac } from 'node:crypto';

import { ReqsignError } from './errors.js';

export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
export const ALGORITHM = 'AWS4-HMAC-SHA256';

export const DEFAULTS = {
  maxExpires: 604800,
  unsigned: ['authorization', 'user-agent'],
};

const sha256hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data, 'utf8').digest();

const fail = (code, message, details) => {
  throw new ReqsignError(code, message, details);
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// 只留 A-Za-z0-9-._~，其余按 UTF-8 编成 %XX（大写）；
// encodeURIComponent 不编码 !'()*，这四个自己补上。
const EXTRA = { '!': '%21', "'": '%27', '(': '%28', ')': '%29', '*': '%2A' };
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (ch) => EXTRA[ch]);

// 首尾空白去掉，中间连续的空白（空格 / 制表 / 换行）压成一个空格。
const normalizeHeaderValue = (value) => value.trim().replace(/[ \t\r\n]+/g, ' ');

// 路径按 / 切开，每段各自编码，空段留着。
const encodePath = (path) => path.split('/').map(encode).join('/');

// 先按编码后的名比字典序，名一样再按编码后的值比；同名同值都留着。
const canonicalQuery = (pairs) => {
  const encoded = pairs.map(([name, value]) => [encode(name), encode(value)]);
  encoded.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });
  return encoded.map(([name, value]) => `${name}=${value}`).join('&');
};

const asValues = (code, field, name, raw) => {
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((value) => {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') {
      fail(code, `${field} 的 ${name} 不是字符串`, { field, name, value });
    }
    return value;
  });
};

// 校验请求形状，并把方法、路径、查询串、头、正文都规范化好。
const prepare = (request) => {
  if (!isObject(request)) {
    fail('ERR_BAD_REQUEST', '请求得是一个对象', { request });
  }
  const { method, query, headers, payload } = request;
  let { path } = request;

  if (typeof method !== 'string' || method === '') {
    fail('ERR_BAD_REQUEST', 'method 得是非空字符串', { method });
  }
  if (path === undefined || path === '') {
    path = '/';
  } else if (typeof path !== 'string' || !path.startsWith('/')) {
    fail('ERR_BAD_REQUEST', 'path 得以 / 开头', { path });
  }

  const queryPairs = [];
  if (query !== undefined) {
    if (!isObject(query)) {
      fail('ERR_BAD_REQUEST', 'query 得是一个对象', { query });
    }
    for (const [name, raw] of Object.entries(query)) {
      for (const value of asValues('ERR_BAD_REQUEST', 'query', name, raw)) {
        queryPairs.push([name, value]);
      }
    }
  }

  if (!isObject(headers)) {
    fail('ERR_BAD_REQUEST', 'headers 得是一个对象', { headers });
  }
  const headerMap = new Map();
  for (const [name, raw] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (DEFAULTS.unsigned.includes(lower)) continue;
    const values = asValues('ERR_BAD_REQUEST', 'headers', name, raw).map(normalizeHeaderValue);
    headerMap.set(lower, [...(headerMap.get(lower) ?? []), ...values]);
  }
  if (!headerMap.has('host')) {
    fail('ERR_BAD_REQUEST', 'headers 里必须有 host', { headers });
  }

  let payloadHash;
  if (payload === undefined) {
    payloadHash = sha256hex('');
  } else if (payload === UNSIGNED_PAYLOAD) {
    payloadHash = UNSIGNED_PAYLOAD;
  } else if (typeof payload === 'string') {
    payloadHash = sha256hex(payload);
  } else {
    fail('ERR_BAD_REQUEST', 'payload 得是字符串或 UNSIGNED-PAYLOAD', { payload });
  }

  const headerNames = [...headerMap.keys()].sort();
  return {
    method: method.toUpperCase(),
    path: encodePath(path),
    queryPairs,
    headerNames,
    headerValues: (name) => headerMap.get(name).join(','),
    signedHeaders: headerNames.join(';'),
    payloadHash,
  };
};

const buildCanonical = (prepared, queryString, payloadHash) => [
  prepared.method,
  prepared.path,
  queryString,
  ...prepared.headerNames.map((name) => `${name}:${prepared.headerValues(name)}`),
  '',
  prepared.signedHeaders,
  payloadHash,
].join('\n');

const checkCredentials = (credentials) => {
  if (!isObject(credentials)) {
    fail('ERR_BAD_CREDENTIALS', 'credentials 得是一个对象', { credentials });
  }
  for (const key of ['accessKeyId', 'secretAccessKey', 'region', 'service']) {
    if (typeof credentials[key] !== 'string' || credentials[key] === '') {
      fail('ERR_BAD_CREDENTIALS', `credentials.${key} 得是非空字符串`, { key });
    }
  }
};

const parseTimestamp = (timestamp) => {
  if (timestamp === undefined || timestamp === null) {
    fail('ERR_BAD_TIMESTAMP', 'timestamp 没给', { timestamp });
  }
  let date;
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    fail('ERR_BAD_TIMESTAMP', 'timestamp 得是 Date、epoch 毫秒或时间串', { timestamp });
  }
  if (Number.isNaN(date.getTime())) {
    fail('ERR_BAD_TIMESTAMP', 'timestamp 解析不出合法时间', { timestamp });
  }
  return date;
};

const pad = (value) => String(value).padStart(2, '0');

const formatTimestamp = (date) => {
  const day = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return { date: day, amzDate: `${day}T${time}Z` };
};

// AWS4<secret> → date → region → service → aws4_request，每步喂上一步的字节。
const signingKey = (credentials, date) => {
  let key = hmac(`AWS4${credentials.secretAccessKey}`, date);
  key = hmac(key, credentials.region);
  key = hmac(key, credentials.service);
  key = hmac(key, 'aws4_request');
  return key;
};

// 校验 + 规范化 + 时间/凭证，把 sign 和 presign 共用的部分一次算好。
const prepareSigning = (request) => {
  const prepared = prepare(request);
  checkCredentials(request.credentials);
  const { date, amzDate } = formatTimestamp(parseTimestamp(request.timestamp));
  const { credentials } = request;
  const scope = `${date}/${credentials.region}/${credentials.service}/aws4_request`;
  return { prepared, credentials, date, amzDate, scope };
};

const finish = (credentials, amzDate, scope, canonical) => {
  const stringToSign = [ALGORITHM, amzDate, scope, sha256hex(canonical)].join('\n');
  const signature = hmac(signingKey(credentials, amzDate.slice(0, 8)), stringToSign)
    .toString('hex');
  return { stringToSign, signature };
};

export function canonicalRequest(request) {
  const prepared = prepare(request);
  return buildCanonical(prepared, canonicalQuery(prepared.queryPairs), prepared.payloadHash);
}

export function sign(request) {
  const { prepared, credentials, amzDate, scope } = prepareSigning(request);
  const query = canonicalQuery(prepared.queryPairs);
  const canonical = buildCanonical(prepared, query, prepared.payloadHash);
  const { stringToSign, signature } = finish(credentials, amzDate, scope, canonical);
  return {
    method: prepared.method,
    path: prepared.path,
    query,
    payloadHash: prepared.payloadHash,
    signedHeaders: prepared.signedHeaders,
    scope,
    canonicalRequest: canonical,
    stringToSign,
    signature,
    authorization: `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, `
      + `SignedHeaders=${prepared.signedHeaders}, Signature=${signature}`,
  };
}

export function presign(request) {
  const expires = request?.expires === undefined ? DEFAULTS.maxExpires : request.expires;
  if (!Number.isInteger(expires) || expires <= 0 || expires > DEFAULTS.maxExpires) {
    fail('ERR_BAD_ARGS', `expires 得是不超过 ${DEFAULTS.maxExpires} 的正整数`, { expires });
  }
  const { prepared, credentials, amzDate, scope } = prepareSigning(request);
  const queryPairs = [
    ...prepared.queryPairs,
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', prepared.signedHeaders],
  ];
  const canonicalQueryString = canonicalQuery(queryPairs);
  const canonical = buildCanonical(prepared, canonicalQueryString, UNSIGNED_PAYLOAD);
  const { stringToSign, signature } = finish(credentials, amzDate, scope, canonical);
  const query = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return {
    url: `${prepared.path}?${query}`,
    query,
    path: prepared.path,
    signedHeaders: prepared.signedHeaders,
    payloadHash: UNSIGNED_PAYLOAD,
    scope,
    canonicalRequest: canonical,
    stringToSign,
    signature,
    expires,
  };
}
