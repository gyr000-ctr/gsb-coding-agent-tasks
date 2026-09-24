import { SelectorError } from '../lib/errors.js';

// 建节点：h('div', { id: 'x' }, 子节点...)；t('文本') 建文本节点
export const h = (tag, attrs = {}, ...children) => ({
  tag,
  attrs,
  children: children.flat(),
});

export const t = (text) => ({ text });

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof SelectorError ? err.code : `NOT_SELECTOR:${err.message}`;
  }
};

export const details = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.details;
  }
  return null;
};

export const ids = (nodes) => nodes.map((node) => node.attrs.id ?? null);
export const tags = (nodes) => nodes.map((node) => node.tag);

export const preorder = (root) => {
  const out = [];
  const visit = (node) => {
    for (const child of (Array.isArray(node.children) ? node.children : [])) {
      if (child !== null && typeof child === 'object' && typeof child.tag === 'string') {
        out.push(child);
        visit(child);
      }
    }
  };
  visit(root);
  return out;
};

// 主干：div#root.wrap > (p.lead.first, ul#list.menu[data-kind=nav] > li#a.item.hot, 文本, li#b.item > a[href], li#c.item.hot[hidden], p.tail)
export const tree = () =>
  h('div', { id: 'root', class: 'wrap' },
    h('p', { id: 'lead', class: 'lead first' }, t('hi')),
    h('ul', { id: 'list', class: 'menu', 'data-kind': 'nav' },
      h('li', { id: 'a', class: 'item hot' }),
      t('mid'),
      h('li', { id: 'b', class: 'item' },
        h('a', { id: 'link', href: '/b', 'data-kind': 'x-y' })),
      h('li', { id: 'c', class: 'item hot', hidden: '' }),
    ),
    h('p', { id: 'tail', class: 'tail' }),
  );
