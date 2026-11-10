(() => {
  const nodes = [...document.querySelectorAll('div.ds-markdown, [class*="ds-markdown"], div[class*="markdown"]')];
  const node = nodes[0];
  if (!node) return { ok: false };
  const all = [...node.querySelectorAll('*')];
  const interesting = all.filter((element) => {
    const cls = String(element.className || '');
    return element.tagName.toLowerCase() === 'math'
      || /math|katex|tex|formula/i.test(cls);
  });
  return {
    ok: true,
    total: all.length,
    count: interesting.length,
    samples: interesting.slice(0, 6).map((element) => ({
      tag: element.tagName,
      cls: String(element.className).slice(0, 120),
      html: element.outerHTML.slice(0, 900),
    })),
  };
})()
