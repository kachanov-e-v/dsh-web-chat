/**
 * Generic in-page automation for the browser bridge.
 *
 * Every page function is stringified and evaluated inside the logged-in
 * provider page. The helper prelude is injected with each expression because
 * only the function body crosses the CDP boundary; outer Node helpers are not
 * visible in the page.
 */

const PAGE_HELPERS = `
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
`;

async function focusInPage(config) {
  const input = findEditable(config.inputSelectors);
  if (input === null) {
    return {
      ok: false,
      code: 'NO_INPUT',
      error: 'Composer input not found. Open the browser, log in, and keep the chat page active.',
    };
  }
  input.focus();
  if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
    input.select();
  } else {
    const range = document.createRange();
    range.selectNodeContents(input);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  const answers = findAnswers(config.answerSelectors);
  const last = answers.length > 0 ? answers[answers.length - 1].innerText.trim() : '';
  return {
    ok: true,
    beforeText: last.slice(-20000),
    beforeCount: answers.length,
  };
}

async function clickInPage(config) {
  for (const selector of config.sendSelectors) {
    let buttons;
    try {
      buttons = [...document.querySelectorAll(selector)].filter(isVisible);
    } catch {
      buttons = [];
    }
    const button = buttons[buttons.length - 1];
    if (button === undefined) continue;
    if (button.disabled === true || button.getAttribute('aria-disabled') === 'true') continue;
    button.click();
    return { ok: true, clicked: true };
  }
  return { ok: true, clicked: false };
}

async function waitInPage(config) {
  const startedAt = Date.now();
  let last = '';
  let lastChange = 0;
  while (Date.now() - startedAt < config.timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const bodyText = document.body ? document.body.innerText : '';
    if (/Length limit reached|Please start a new chat|Достигнут лимит длины/i.test(bodyText)) {
      return {
        ok: false,
        code: 'CONTEXT_LIMIT',
        error: 'The DeepSeek web chat reached its length limit',
        text: last,
        beforeText: '',
      };
    }
    const answers = findAnswers(config.answerSelectors);
    const candidate = answers.length > 0
      ? answers[answers.length - 1].innerText.trim()
      : '';
    const isNew = answers.length > config.beforeCount
      || (candidate !== '' && candidate !== config.beforeText);
    if (isNew && candidate !== '') {
      if (candidate !== last) {
        last = candidate;
        lastChange = Date.now();
      }
      if (Date.now() - lastChange > config.stableMs) {
        return {
          ok: true,
          text: last,
          beforeText: answers.length > config.beforeCount ? '' : config.beforeText,
          elapsedMs: Date.now() - startedAt,
        };
      }
    }
  }
  return {
    ok: false,
    code: 'NO_ANSWER',
    error: 'The provider did not produce a stable answer in time',
    text: last,
    beforeText: config.beforeText,
  };
}

function checkInPage() {
  const editable = findEditable([
    'textarea',
    'div[contenteditable="true"]',
    '[role="textbox"]',
    'input[type="text"]',
  ]);
  const text = document.body ? document.body.innerText : '';
  const login = /(sign in|log in|войти|登录|se connecter|iniciar sesión)/i.test(text);
  return {
    href: location.href,
    title: document.title,
    hasComposer: editable !== null,
    login,
    ready: editable !== null && !login,
  };
}

function wrap(expression) {
  return `(() => { ${PAGE_HELPERS}; return ${expression}; })()`;
}

export function buildFocusExpression(config) {
  return wrap(`(${focusInPage.toString()})(${JSON.stringify(config)})`);
}

export function buildClickExpression(config) {
  return wrap(`(${clickInPage.toString()})(${JSON.stringify(config)})`);
}

export function buildWaitExpression(config) {
  return wrap(`(${waitInPage.toString()})(${JSON.stringify(config)})`);
}

export function buildCheckExpression() {
  return wrap(`(${checkInPage.toString()})()`);
}

async function newChatInPage(config) {
  const selectors = Array.isArray(config?.selectors) ? config.selectors : [];
  for (const selector of selectors) {
    let elements;
    try {
      elements = [...document.querySelectorAll(selector)].filter(isVisible);
    } catch {
      elements = [];
    }
    const element = elements[elements.length - 1];
    if (element !== undefined) {
      element.click();
      return { ok: true, selector };
    }
  }
  return { ok: false };
}

export function buildNewChatExpression(config) {
  return wrap(`(${newChatInPage.toString()})(${JSON.stringify(config)})`);
}

/** Normalize the DOM answer: drop the previous turn and the prompt echo. */
export function cleanAnswer(text, beforeText, prompt) {
  let value = String(text ?? '').trim();
  // DeepSeek's native DSML tool call and our fenced <tool_call> are real
  // answers even when they repeat the previous turn almost verbatim; never
  // strip them as duplicated text.
  if (/DSML|<tool_call>/i.test(value)) return value;
  const previous = String(beforeText ?? '').trim();
  if (previous !== '' && value.startsWith(previous)) {
    value = value.slice(previous.length).trim();
  }
  const echo = String(prompt ?? '').trim();
  if (echo !== '' && value.startsWith(echo)) {
    value = value.slice(echo.length).trim();
  }
  value = value.replace(/^Thought for [^\n]*\n+/i, '');
  value = value.replace(/\n+\d{1,2}:\d{2}\s*(?:am|pm)?\s*$/i, '');
  return value.trim();
}
