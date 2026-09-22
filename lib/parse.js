// 头部取值和日期解析这些零碎活儿，跟缓存决策本身无关，先写好。
import { CacheError } from './errors.js';

// 头名大小写不敏感；同名头重复出现按出现顺序用 ", " 连起来；没有就是 undefined。
export function headerValue(headers, name) {
  if (headers === undefined || headers === null) return undefined;
  if (!isPlainObject(headers)) {
    throw new CacheError('ERR_BAD_REQUEST', 'headers 要写成对象', { field: 'headers' });
  }
  const wanted = String(name).toLowerCase();
  const found = [];
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).trim().toLowerCase() !== wanted) continue;
    found.push(Array.isArray(value) ? value.map((one) => String(one)).join(', ') : String(value));
  }
  if (found.length === 0) return undefined;
  return normalizeSpace(found.join(', '));
}

export function hasHeader(headers, name) {
  return headerValue(headers, name) !== undefined;
}

export function normalizeSpace(text) {
  return String(text).trim().replace(/\s+/g, ' ');
}

// 逗号分隔的列表头（Vary、Connection 这类），去空白去空项。
export function splitList(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseHttpDate(value) {
  if (value === undefined || value === null) return Number.NaN;
  const text = String(value).trim();
  if (!text) return Number.NaN;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? Number.NaN : ms;
}

export function formatHttpDate(ms) {
  return new Date(ms).toUTCString();
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
