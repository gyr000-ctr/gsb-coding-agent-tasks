import { mergeConfig } from '../lib/config.js';

const merged = mergeConfig(
  [
    {
      name: 'defaults',
      values: {
        service: 'orders',
        port: 8080,
        db: { host: 'localhost', pool: { size: 4, timeoutMs: 1000 } },
        hosts: ['a.internal'],
        debug: false,
      },
    },
    { name: 'env', values: { port: '${PORT:-9000}', db: { host: '${DB_HOST:-db.local}' }, hosts: ['db-1', 'db-2'] } },
    { name: 'user', values: { service: null, db: { pool: { size: 16 } }, debug: true, extra: 'x', hosts: undefined } },
  ],
  { env: {} },
);

console.log('configmerge demo');

console.log('[1] 三层合出来的配置');
console.log(`    ${JSON.stringify(merged.values)}`);

console.log('[2] 每个值是谁给的');
for (const [path, layer] of Object.entries(merged.sources).sort(([left], [right]) => (left < right ? -1 : 1))) {
  console.log(`    ${path} <- ${layer}`);
}

console.log('[3] 环境变量能兜住缺省值');
const live = mergeConfig(
  [{ name: 'env', values: { url: 'https://${HOST}/v1', token: '${TOKEN:-none}', pool: '${POOL_SIZE:-8}' } }],
  { env: { HOST: 'api.example.com', POOL_SIZE: 12 } },
);
console.log(`    url=${live.values.url} token=${live.values.token} pool=${live.values.pool}`);

console.log('[4] 忘了给环境变量');
try {
  mergeConfig([{ name: 'env', values: { url: 'https://${MISSING_HOST}/v1' } }], { env: {} });
} catch (err) {
  console.log(`    ${err.code} name=${err.details.name}`);
}

console.log('[5] null 是清空，undefined 是没这回事');
console.log(`    service=${merged.values.service} debug=${merged.values.debug} hosts=${JSON.stringify(merged.values.hosts)}`);
