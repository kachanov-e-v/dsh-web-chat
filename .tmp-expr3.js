(() => { 
const isVisible = (element) => {
  if (!(element instanceof Element)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
};
const findAnswers = (selectors) => {
  for (const selector of selectors) {
    let elements;
    try {
      elements = [...document.querySelectorAll(selector)].filter(isVisible);
    } catch {
      elements = [];
    }
    if (elements.length > 0) return elements;
  }
  return [];
};
const findEditable = (selectors) => {
  for (const selector of selectors) {
    let elements;
    try {
      elements = [...document.querySelectorAll(selector)].filter(isVisible);
    } catch {
      elements = [];
    }
    if (elements.length > 0) return elements[elements.length - 1];
  }
  return null;
};
const mathSource = (formula) => {
  const annotation = formula.querySelector('annotation[encoding="application/x-tex"]');
  if (annotation === null) return undefined;
  // Keep the TeX source verbatim: a trailing newline inside the formula is
  // usually the line break that separated two PowerShell statements.
  const source = String(annotation.textContent || '');
  if (source.trim() === '') return undefined;
  const display = formula.closest('.katex-display, [display="block"]') !== null;
  return display ? '$$' + source + '$$' : '$' + source + '$';
};
/*
 * DeepSeek renders $...$ as KaTeX. innerText then returns math glyphs
 * ("c = Get-Content" appears as italic math letters, minus sign, prime), which
 * corrupts tool arguments such as PowerShell commands. Swap every formula for
 * its TeX source, read the text, then put the original nodes back.
 */
const readText = (element) => {
  let formulas;
  try {
    formulas = [...element.querySelectorAll('.katex, mjx-container')];
  } catch {
    return element.innerText;
  }
  if (formulas.length === 0) return element.innerText;
  const saved = [];
  for (const formula of formulas) {
    const source = mathSource(formula);
    if (source === undefined) continue;
    const style = formula.getAttribute('style');
    saved.push([formula, [...formula.childNodes], style]);
    // innerText collapses newlines inside a formula unless the node preserves
    // them; the TeX source usually holds the line breaks of a code sample.
    formula.style.whiteSpace = 'pre-wrap';
    formula.replaceChildren(document.createTextNode(source));
  }
  try {
    return element.innerText;
  } finally {
    for (const [formula, children, style] of saved) {
      formula.replaceChildren(...children);
      if (style === null) formula.removeAttribute('style');
      else formula.setAttribute('style', style);
    }
  }
};


return (() => {
  const nodes = [...document.querySelectorAll('div.ds-markdown')];
  const node = nodes[0];
  const before = node.innerHTML;
  const text = readText(node);
  const after = node.innerHTML;
  return { text, restored: before === after, nodeCount: nodes.length };
})();
})()