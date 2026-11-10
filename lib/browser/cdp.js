/**
 * Minimal Chrome DevTools Protocol driver.
 *
 * The bridge deliberately uses a dedicated, user-visible browser profile
 * instead of exporting account cookies: the browser owns the login, the WAF
 * fingerprint, and the network stack. Node only drives the page and reads the
 * answer back.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEBUG_PORT_FILE = 'DevToolsActivePort';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function findBrowserExecutable() {
  const candidates = [
    process.env.DSH_CHAT_MODEL_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '' && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function browserProfileDir(baseDir, providerId) {
  return path.join(baseDir, 'browser', providerId);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`DevTools endpoint returned ${response.status}`);
  return response.json();
}

async function fetchJsonRetry(url, init, attempts = 20) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchJson(url, init);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('DevTools endpoint is unavailable');
}

async function devToolsAlive(port) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || 'CDP command failed'));
      } else {
        pending.resolve(message.result);
      }
    });
    socket.addEventListener('close', () => {
      this.closed = true;
      for (const pending of this.pending.values()) {
        pending.reject(new Error('Browser connection closed'));
      }
      this.pending.clear();
    });
    socket.addEventListener('error', () => {
      this.closed = true;
    });
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('Browser connection closed'));
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || 'Page evaluation failed';
      throw new Error(description);
    }
    return result.result?.value;
  }

  async navigate(url, timeoutMs = 20000) {
    await this.send('Page.enable');
    await this.send('Page.navigate', { url });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const ready = await this.evaluate('document.readyState');
        if (ready === 'complete') return;
      } catch {
        /* Navigation may briefly detach the context. */
      }
      await sleep(250);
    }
    throw new Error('The provider page did not finish loading');
  }

  async close() {
    try {
      await this.send('Browser.close');
    } catch {
      /* The socket may already be gone. */
    }
    try {
      this.socket.close();
    } catch {
      /* Already closed. */
    }
    this.closed = true;
  }
}

export async function launchBrowser(options) {
  const {
    executable,
    profileDir,
    startUrl,
  } = options;
  if (typeof executable !== 'string' || executable === '') {
    throw new Error('Chrome or Edge was not found on this machine');
  }
  fs.mkdirSync(profileDir, { recursive: true });
  const portFile = path.join(profileDir, DEBUG_PORT_FILE);
  // A leftover file from a closed browser points at a dead port. Remove it so
  // the new process writes the live one instead of connecting to a corpse.
  if (fs.existsSync(portFile)) {
    let stalePort = 0;
    try {
      stalePort = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
    } catch {
      stalePort = 0;
    }
    if (!(stalePort > 0) || !(await devToolsAlive(stalePort))) {
      try {
        fs.rmSync(portFile, { force: true });
      } catch {
        /* The browser may be rewriting it right now. */
      }
    }
  }
  const args = [
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,900',
    startUrl,
  ];
  const child = spawn(executable, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const lines = fs.readFileSync(portFile, 'utf8').split(/\r?\n/);
      const port = Number(lines[0]);
      if (Number.isInteger(port) && port > 0 && (await devToolsAlive(port))) {
        return { child, port, profileDir };
      }
    }
    await sleep(200);
  }
  try {
    child.kill();
  } catch {
    /* The process may have exited on its own. */
  }
  throw new Error('The browser did not expose a live DevTools port');
}

export async function connectToPage(port, host, fallbackUrl) {
  const base = `http://127.0.0.1:${port}`;
  const targets = await fetchJsonRetry(`${base}/json/list`);
  const preferred = targets
    .filter((entry) => entry.type === 'page' && entry.url.startsWith(fallbackUrl))
    .sort((left, right) => right.url.length - left.url.length);
  let target = preferred[0]
    ?? targets.find((entry) => entry.type === 'page' && entry.url.includes(host))
    ?? targets.find((entry) => entry.type === 'page');
  if (target === undefined) {
    const created = await fetchJsonRetry(
      `${base}/json/new?${encodeURIComponent(fallbackUrl)}`,
      { method: 'PUT' },
    );
    target = created;
  }
  if (target === undefined || typeof target.webSocketDebuggerUrl !== 'string') {
    throw new Error('The browser did not expose a page target');
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out connecting to the browser page')), 10000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Could not connect to the browser page'));
    }, { once: true });
  });
  const client = new CdpClient(socket);
  await client.send('Runtime.enable').catch(() => undefined);
  return client;
}

export async function ensurePage(client, host, url) {
  let href = '';
  try {
    href = String(await client.evaluate('location.href'));
  } catch {
    href = '';
  }
  if (!href.includes(host)) {
    await client.navigate(url);
  }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const ready = await client.evaluate('document.readyState');
      if (ready === 'complete') return;
    } catch {
      /* Navigation may briefly detach the context. */
    }
    await sleep(250);
  }
}

export { DEBUG_PORT_FILE };
