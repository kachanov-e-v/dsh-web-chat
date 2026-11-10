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
const mathSource = (formula) => {
  const annotation = formula.querySelector('annotation[encoding="application/x-tex"]');
  if (annotation === null) return undefined;
  const source = String(annotation.textContent || '').trim();
  if (source === '') return undefined;
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
    saved.push([formula, [...formula.childNodes]]);
    formula.replaceChildren(document.createTextNode(source));
  }
  try {
    return element.innerText;
  } finally {
    for (const [formula, children] of saved) formula.replaceChildren(...children);
  }
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
  const last = answers.length > 0 ? readText(answers[answers.length - 1]).trim() : '';
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
    if (/Messages too frequent|Try again later/i.test(bodyText)) {
      return {
        ok: false,
        code: 'RATE_LIMIT',
        error: 'DeepSeek rate limit: wait a minute and retry',
        text: last,
        beforeText: '',
      };
    }
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
      ? readText(answers[answers.length - 1]).trim()
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

async function snapshotInPage(config) {
  const bodyText = document.body ? document.body.innerText : '';
  if (/Messages too frequent|Try again later/i.test(bodyText)) {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      error: 'DeepSeek rate limit: wait a minute and retry',
    };
  }
  if (/Length limit reached|Please start a new chat|Достигнут лимит длины/i.test(bodyText)) {
    return {
      ok: false,
      code: 'CONTEXT_LIMIT',
      error: 'The DeepSeek web chat reached its length limit',
    };
  }
  const answers = findAnswers(config.answerSelectors);
  const candidate = answers.length > 0
    ? readText(answers[answers.length - 1]).trim()
    : '';
  const isNew = answers.length > config.beforeCount
    || (candidate !== '' && candidate !== config.beforeText);
  return {
    ok: true,
    count: answers.length,
    isNew,
    text: isNew ? candidate : '',
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

export function buildSnapshotExpression(config) {
  return wrap(`(${snapshotInPage.toString()})(${JSON.stringify(config)})`);
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

async function dismissDialogsInPage() {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
  for (const dialog of dialogs) {
    const buttons = [...dialog.querySelectorAll('[role="button"], .ds-button')];
    const cancel = buttons.find((button) => /^(cancel|отмена)$/i.test((button.innerText || '').trim()));
    if (cancel !== undefined) {
      cancel.click();
      return { ok: true, action: 'cancel' };
    }
  }
  if (dialogs.length > 0) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { ok: true, action: 'escape' };
  }
  const menus = [...document.querySelectorAll('[role="menu"]')].filter(isVisible);
  if (menus.length > 0) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { ok: true, action: 'menu' };
  }
  return { ok: true, action: 'none' };
}

async function ensureChatSidebarInPage() {
  const rows = [...document.querySelectorAll('a[href*="/a/chat/s/"]')].filter(isVisible);
  if (rows.length > 0) return { ok: true, already: true };
  const buttons = [...document.querySelectorAll('.ds-button')].filter(isVisible);
  if (buttons.length === 0) return { ok: false };
  buttons[0].click();
  return { ok: true, clicked: true };
}

async function chatCountInPage() {
  return {
    ok: true,
    count: [...document.querySelectorAll('a[href*="/a/chat/s/"]')].filter(isVisible).length,
  };
}

async function openFirstChatMenuInPage() {
  const rows = [...document.querySelectorAll('a[href*="/a/chat/s/"]')].filter(isVisible);
  const row = rows[0];
  const button = row?.querySelector('[role="button"]');
  if (button === undefined || button === null) return { ok: false };
  button.click();
  return { ok: true };
}

async function clickDeleteMenuInPage() {
  const menus = [...document.querySelectorAll('[role="menu"]')].filter(isVisible);
  const menu = menus[menus.length - 1];
  if (menu === undefined) return { ok: false };
  const option = [...menu.querySelectorAll('.ds-dropdown-menu-option')]
    .find((element) => /^(delete|удалить)$/i.test((element.innerText || '').trim()));
  if (option === undefined) return { ok: false };
  option.click();
  return { ok: true };
}

async function confirmDeleteInPage() {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
  const dialog = dialogs[dialogs.length - 1];
  if (dialog === undefined) return { ok: false };
  const button = [...dialog.querySelectorAll('[role="button"], .ds-button')]
    .find((element) => /^(delete chat|delete|удалить( чат)?)$/i.test((element.innerText || '').trim()));
  if (button === undefined) return { ok: false };
  button.click();
  return { ok: true };
}

export function buildDismissDialogsExpression() {
  return wrap(`(${dismissDialogsInPage.toString()})()`);
}

export function buildEnsureChatSidebarExpression() {
  return wrap(`(${ensureChatSidebarInPage.toString()})()`);
}

export function buildChatCountExpression() {
  return wrap(`(${chatCountInPage.toString()})()`);
}

export function buildOpenFirstChatMenuExpression() {
  return wrap(`(${openFirstChatMenuInPage.toString()})()`);
}

export function buildClickDeleteMenuExpression() {
  return wrap(`(${clickDeleteMenuInPage.toString()})()`);
}

export function buildConfirmDeleteExpression() {
  return wrap(`(${confirmDeleteInPage.toString()})()`);
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
