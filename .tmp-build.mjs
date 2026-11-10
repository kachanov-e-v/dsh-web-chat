import fs from 'node:fs';
import { buildSnapshotExpression } from './lib/browser/dom.js';

const full = buildSnapshotExpression({
  answerSelectors: ['div.ds-markdown'],
  beforeCount: 0,
  beforeText: '',
});
const marker = '; return (';
const at = full.indexOf(marker);
if (at < 0) throw new Error('prelude marker not found');
const prelude = full.slice(0, at);
const expression = `${prelude}

return (() => {
  const nodes = [...document.querySelectorAll('div.ds-markdown')];
  const node = nodes[0];
  const before = node.innerHTML;
  const text = readText(node);
  const after = node.innerHTML;
  return { text, restored: before === after, nodeCount: nodes.length };
})();
})()`;
fs.writeFileSync('.tmp-expr3.js', expression, 'utf8');
console.log('bytes', expression.length);
