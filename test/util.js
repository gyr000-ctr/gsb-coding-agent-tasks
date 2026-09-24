import { tokenize } from '../lib/htmlex.js';
import { HtmlError } from '../lib/errors.js';

export const shape = (token) => {
  switch (token.type) {
    case 'text':
      return `#text[${token.data}]`;
    case 'comment':
      return `comment[${token.data}]`;
    case 'cdata':
      return `cdata[${token.data}]`;
    case 'endTag':
      return `endTag(${token.name})`;
    case 'startTag': {
      const attributes = token.attributes
        .map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`)
        .join(' ');
      const self = token.selfClosing ? ' /' : '';
      return `startTag(${token.name}${self})${attributes === '' ? '' : `[${attributes}]`}`;
    }
    case 'doctype': {
      const ids = `${token.publicId === null ? '-' : token.publicId} ${token.systemId === null ? '-' : token.systemId}`;
      return `doctype(${token.name}${token.quirks ? ' quirks' : ''})[${ids}]`;
    }
    default:
      return token.type;
  }
};

export const shapes = (html) => tokenize(html).tokens.map(shape);

export const codes = (html) => tokenize(html).errors.map((item) => item.code);

export const located = (html) => tokenize(html).errors;

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof HtmlError ? err.code : `NOT_HTML:${err.message}`;
  }
};
