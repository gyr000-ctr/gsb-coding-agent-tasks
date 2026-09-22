import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfig } from '../lib/config.js';

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'ConfigError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('${VAR} 用环境变量补，${VAR:-默认} 缺了或空串时用默认', () => {
  const out = mergeConfig([{ name: 'base', values: { host: '${HOST}', port: '${PORT:-8080}', empty: '${EMPTY:-fallback}' } }], {
    env: { HOST: 'api.example.com', EMPTY: '' },
  });
  assert.deepEqual(out.values, { host: 'api.example.com', port: '8080', empty: 'fallback' });
});

test('缺环境变量又没默认值就抛 ERR_MISSING_ENV', () => {
  const err = expectError(() => mergeConfig([{ name: 'base', values: { token: '${TOKEN}' } }], { env: {} }), 'ERR_MISSING_ENV');
  assert.equal(err.details.name, 'TOKEN');
  assert.equal(mergeConfig([{ name: 'base', values: { token: '${TOKEN:-}' } }], { env: {} }).values.token, '');
});

test('数字和布尔也会被贴成字符串，值本身是数字就不动', () => {
  const out = mergeConfig([{ name: 'base', values: { a: '${NUM}', b: 3, c: true, d: null } }], { env: { NUM: 0 } });
  assert.deepEqual(out.values, { a: '0', b: 3, c: true, d: null });
});

test('数组里的字符串一样会被替换', () => {
  const out = mergeConfig([{ name: 'base', values: { hosts: ['${A}', '${B:-b}'] } }], { env: { A: 'a' } });
  assert.deepEqual(out.values, { hosts: ['a', 'b'] });
});

test('只替换一轮，插进去的内容不会被再扫一遍', () => {
  const out = mergeConfig([{ name: 'base', values: { a: '${A}' } }], { env: { A: '${B}' } });
  assert.deepEqual(out.values, { a: '${B}' });
  assert.deepEqual(mergeConfig([{ name: 'base', values: { a: 'x$NOT_ENV' } }], { env: {} }).values, { a: 'x$NOT_ENV' });
});

test('插值发生在合并之后，来源不受影响', () => {
  const out = mergeConfig(
    [
      { name: 'base', values: { url: 'https://${HOST}/api' } },
      { name: 'over', values: { url: 'https://${HOST}/v2' } },
    ],
    { env: { HOST: 'api.example.com' } },
  );
  assert.equal(out.values.url, 'https://api.example.com/v2');
  assert.deepEqual(out.sources, { url: 'over' });
});
