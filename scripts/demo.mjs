import { tokenize } from '../lib/htmlex.js';
import { shape } from '../test/util.js';

const line = (label, value) => console.log(`  ${label} ${value}`);

const show = (label, html) => {
  const { tokens, errors } = tokenize(html);
  line(label, tokens.map(shape).join(' '));
  if (errors.length > 0) {
    line(`${label}.errors`, errors.map((item) => `${item.code}@${item.index}`).join(' '));
  }
};

console.log('htmlex demo');
show('basic', '<p class=hi>a &amp; b</p>');
show('attrs', '<a x="1" y/>');
show('refs', '&copy;&#65;&#x41; &#0; &nope;');
show('raw', '<script>if (a < b) x = "</div>";</script>');
show('rcdata', '<title>&amp;<b></title>');
show('cdata', '<![CDATA[raw <b>]]>');
show('doctype', '<!DOCTYPE html SYSTEM "about:legacy-compat">');
show('comment', 'a<!--x-->b<!-->');
show('broken', '<a b="1" b="2" c=>');
