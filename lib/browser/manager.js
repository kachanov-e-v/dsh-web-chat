/**
 * One logged-in browser page per provider.
 *
 * The browser is launched with its own persistent profile and a DevTools port;
 * the user signs in manually once. The plugin never reads or exports cookies:
 * it focuses the composer, types through CDP, sends, and reads the last answer
 * from the DOM.
 */

import os from 'node:os';
import path from 'node:path';

import {
  browserProfileDir,
  connectToPage,
  ensurePage,
  findBrowserExecutable,
  launchBrowser,
  sleep,
} from './cdp.js';
import {
  buildCheckExpression,
  buildClickExpression,
  buildFocusExpression,
  buildNewChatExpression,
  buildWaitExpression,
  cleanAnswer,
} from './dom.js';

const MAX_PROMPT_CHARS = 220000;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function defaultBaseDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'dsh-chat-model');
}

function withTimeout(promise, ms, signal, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(fail('BROWSER_TIMEOUT', `${label} timed out`));
    }, ms);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(fail('ABORTED', 'Browser request was cancelled'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        reject(error);
      },
    );
  });
}

export class BrowserBridge {
  constructor(options) {
    this.provider = options.provider;
    this.baseDir = options.baseDir ?? defaultBaseDir();
    this.executable = options.executable ?? findBrowserExecutable();
    this.profileDir = browserProfileDir(this.baseDir, this.provider.id);
    this.client = undefined;
    this.child = undefined;
    this.port = undefined;
    this.askQueue = Promise.resolve();
    this.generation = 0;
  }

  get host() {
    return this.provider.host;
  }

  async ensure() {
    if (this.client !== undefined && this.client.closed !== true) {
      try {
        await this.client.evaluate('1');
        await ensurePage(this.client, this.provider.host, this.provider.startUrl);
        return;
      } catch {
        await this.close();
      }
    }
    const launched = await launchBrowser({
      executable: this.executable,
      profileDir: this.profileDir,
      startUrl: this.provider.startUrl,
    });
    this.child = launched.child;
    this.port = launched.port;
    try {
      this.client = await connectToPage(
        launched.port,
        this.provider.host,
        this.provider.startUrl,
      );
      await ensurePage(this.client, this.provider.host, this.provider.startUrl);
    } catch (error) {
      await this.close();
      throw fail(
        'BROWSER_START_FAILED',
        `Could not connect to the ${this.provider.label} browser page: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async evaluate(expression, timeoutMs, signal, label) {
    await this.ensure();
    return withTimeout(
      this.client.evaluate(expression),
      timeoutMs,
      signal,
      label,
    );
  }

  async open() {
    await this.ensure();
    await ensurePage(this.client, this.provider.host, this.provider.startUrl);
    await this.waitForComposer(20000).catch(() => undefined);
    return this.check();
  }

  async waitForComposer(timeoutMs = 30000, signal) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw fail('ABORTED', 'Browser request was cancelled');
      try {
        const result = await this.client.evaluate(buildCheckExpression());
        if (result?.hasComposer === true) return result;
      } catch {
        /* The page may still be warming up. */
      }
      await sleep(500);
    }
    throw fail(
      'NO_INPUT',
      'The chat composer did not appear. Open the browser, sign in, and keep the chat page active.',
    );
  }

  async check() {
    const result = await this.evaluate(
      buildCheckExpression(),
      20000,
      undefined,
      'Browser login check',
    );
    return {
      ready: result?.ready === true,
      hasComposer: result?.hasComposer === true,
      login: result?.login === true,
      href: result?.href,
      title: result?.title,
    };
  }

  async startNewChat() {
    const run = this.askQueue.then(
      () => this.startNewChatInternal(),
      () => this.startNewChatInternal(),
    );
    this.askQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async startNewChatInternal() {
    await this.ensure();
    let clicked = { ok: false };
    try {
      clicked = await this.client.evaluate(buildNewChatExpression({
        selectors: this.provider.newChatSelectors ?? [],
      }));
    } catch {
      clicked = { ok: false };
    }
    if (clicked?.ok !== true) {
      await this.client.send('Page.navigate', { url: this.provider.startUrl });
      await sleep(1500);
    }
    await this.waitForComposer(30000);
    const result = await this.check();
    if (result.ready === true) this.generation += 1;
    return result;
  }

  async currentChatKey() {
    await this.ensure();
    try {
      const href = await this.client.evaluate('location.href');
      return `${href}#${this.generation}`;
    } catch {
      return undefined;
    }
  }

  async typePrompt(prompt) {
    await this.client.send('Input.insertText', { text: prompt });
    const sample = prompt.slice(0, 40);
    let inserted = false;
    try {
      inserted = await this.client.evaluate(
        `(() => {
          const el = document.activeElement;
          if (!el) return false;
          const value = typeof el.value === 'string' ? el.value : (el.innerText || '');
          return value.includes(${JSON.stringify(sample)});
        })()`,
      );
    } catch {
      inserted = false;
    }
    if (inserted !== true) {
      await this.client.evaluate(
        `document.execCommand('insertText', false, ${JSON.stringify(prompt)})`,
      );
    }
  }

  async pressEnter() {
    const key = {
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    };
    await this.client.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await this.client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  }

  async ask(prompt, options = {}) {
    const run = this.askQueue.then(
      () => this.askInternal(prompt, options),
      () => this.askInternal(prompt, options),
    );
    this.askQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async askInternal(prompt, options = {}) {
    const value = String(prompt ?? '').trim();
    if (value === '') throw fail('EMPTY_PROMPT', 'prompt is required');
    if (value.length > MAX_PROMPT_CHARS) {
      throw fail('PROMPT_TOO_LONG', `The request is ${value.length} characters; the limit is ${MAX_PROMPT_CHARS}`);
    }

    const config = {
      prompt: value,
      inputSelectors: this.provider.inputSelectors,
      sendSelectors: this.provider.sendSelectors,
      answerSelectors: this.provider.answerSelectors,
      timeoutMs: this.provider.timeoutMs,
      stableMs: this.provider.stableMs,
    };

    await this.ensure();
    await this.waitForComposer(30000, options.signal);

    const gate = await this.check();
    if (gate.ready !== true) {
      throw fail(
        'AUTH',
        `Sign in to ${this.provider.host} in the opened browser window and keep the chat page active.`,
      );
    }



    const focus = await this.evaluate(
      buildFocusExpression(config),
      Math.min(30000, this.provider.timeoutMs),
      options.signal,
      'Browser composer lookup',
    );
    if (focus?.ok !== true) {
      throw fail(focus?.code || 'NO_INPUT', focus?.error || 'The composer input was not found');
    }

    await this.typePrompt(value);

    const clicked = await this.evaluate(
      buildClickExpression(config),
      10000,
      options.signal,
      'Browser send button',
    );
    if (clicked?.clicked !== true) {
      await this.pressEnter();
    }

    const result = await this.evaluate(
      buildWaitExpression({
        ...config,
        beforeText: focus.beforeText,
        beforeCount: focus.beforeCount,
      }),
      this.provider.timeoutMs + 15000,
      options.signal,
      'Browser answer',
    );
    if (result?.ok !== true) {
      throw fail(result?.code || 'NO_ANSWER', result?.error || 'The provider did not answer');
    }
    const answer = cleanAnswer(result.text, focus.beforeText, value);
    if (answer === '') throw fail('EMPTY', 'The provider returned an empty answer');
    return {
      answer,
      provider: this.provider.id,
      elapsedMs: result.elapsedMs,
    };
  }

  async close() {
    if (this.client !== undefined) {
      try {
        await this.client.close();
      } catch {
        /* Already closed. */
      }
      this.client = undefined;
    }
    if (this.child !== undefined && typeof this.child.kill === 'function') {
      try {
        this.child.kill();
      } catch {
        /* The process may already be gone. */
      }
      this.child = undefined;
    }
    this.port = undefined;
  }
}

export { MAX_PROMPT_CHARS };
