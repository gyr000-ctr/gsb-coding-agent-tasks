// 小模板引擎：把模板切成 text / tag 两种 token，解析成树再渲染。
import { TplError } from './errors.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text) => text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

const NAME_PATTERN = /^(\.|[A-Za-z0-9_$\-]+(\.[A-Za-z0-9_$\-]+)*)$/;

function isTruthy(value) {
  return !(value === undefined || value === null || value === false
    || value === '' || value === 0 || Number.isNaN(value));
}

function checkName(name, source) {
  if (!NAME_PATTERN.test(name)) {
    throw new TplError('ERR_BAD_TEMPLATE', `${source} 里的名字不合法`);
  }
  return name;
}

function makeTag(inner, source) {
  const trimmed = inner.trim();
  if (trimmed === '') throw new TplError('ERR_BAD_TEMPLATE', `${source} 里没有名字`);
  const head = trimmed[0];
  if (head === '#') {
    return { kind: 'tag', sigil: 'section', name: checkName(trimmed.slice(1).trim(), source), source };
  }
  if (head === '/') {
    return { kind: 'tag', sigil: 'close', name: checkName(trimmed.slice(1).trim(), source), source };
  }
  if (head === '!') return { kind: 'tag', sigil: 'comment', source };
  return { kind: 'tag', sigil: 'value', name: checkName(trimmed, source), source };
}

function tokenize(template) {
  const tokens = [];
  let index = 0;
  while (index < template.length) {
    const open = template.indexOf('{{', index);
    if (open === -1) {
      tokens.push({ kind: 'text', text: template.slice(index) });
      break;
    }
    if (open > index) tokens.push({ kind: 'text', text: template.slice(index, open) });
    const end = template.indexOf('}}', open + 2);
    if (end === -1) throw new TplError('ERR_BAD_TEMPLATE', '{{ 没有闭合');
    tokens.push(makeTag(template.slice(open + 2, end), template.slice(open, end + 2)));
    index = end + 2;
  }
  return tokens;
}

function parse(tokens) {
  const root = { kind: 'root', items: [] };
  const stack = [root];
  for (const token of tokens) {
    const parent = stack[stack.length - 1];
    if (token.kind === 'text') {
      parent.items.push({ kind: 'text', text: token.text });
      continue;
    }
    if (token.sigil === 'comment') continue;
    if (token.sigil === 'section') {
      const node = { kind: 'section', name: token.name, items: [], source: token.source };
      parent.items.push(node);
      stack.push(node);
      continue;
    }
    if (token.sigil === 'close') {
      if (stack.length === 1) throw new TplError('ERR_BAD_TEMPLATE', `${token.source} 多了一个结束标签`);
      const open = stack[stack.length - 1];
      if (open.name !== token.name) {
        throw new TplError('ERR_BAD_TEMPLATE', `${token.source} 跟最近的 {{#${open.name}}} 对不上`);
      }
      stack.pop();
      continue;
    }
    parent.items.push({ kind: 'value', name: token.name });
  }
  if (stack.length > 1) {
    throw new TplError('ERR_BAD_TEMPLATE', `{{#${stack[stack.length - 1].name}}} 没有闭合`);
  }
  return root;
}

function property(context, key) {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(context, key)) return undefined;
  return { value: context[key] };
}

// 现在名字里的点不拆开，整个名字当成一个键去找。
function resolve(name, stack) {
  if (name === '.') return stack[stack.length - 1];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const found = property(stack[i], name);
    if (found !== undefined) return found.value;
  }
  return undefined;
}

function renderItems(items, stack) {
  let out = '';
  for (const item of items) {
    if (item.kind === 'text') {
      out += item.text;
      continue;
    }
    if (item.kind === 'value') {
      const value = resolve(item.name, stack);
      out += value === undefined || value === null ? '' : escapeHtml(String(value));
      continue;
    }
    const value = resolve(item.name, stack);
    if (Array.isArray(value)) {
      for (const entry of value) out += renderItems(item.items, [...stack, entry]);
    } else if (isTruthy(value)) {
      out += renderItems(item.items, [...stack, value]);
    }
  }
  return out;
}

export function render(template, data) {
  if (typeof template !== 'string') {
    throw new TplError('ERR_BAD_ARGUMENT', '模板必须是字符串');
  }
  if (data === null || typeof data !== 'object') {
    throw new TplError('ERR_BAD_ARGUMENT', '数据得是个对象（数组也算）');
  }
  return renderItems(parse(tokenize(template)).items, [data]);
}