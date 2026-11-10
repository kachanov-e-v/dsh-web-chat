/**
 * Same-origin Host API for the DeepSeek browser model.
 *
 * The plugin stores no token and exposes no direct-API tool. The only model is
 * `deepseek-web`, backed by the user's logged-in browser profile.
 */

import { BROWSER_PROVIDERS } from './browser/providers.js';

const MAX_BODY_BYTES = 4096;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sendJson(response, status, payload) {
  if (response.headersSent) return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    request.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        request.resume();
        reject(fail('BODY_TOO_LARGE', 'Request body is too large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(fail('INVALID_JSON', 'Request body is not valid JSON'));
      }
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.on('aborted', () => {
      if (settled) return;
      settled = true;
      reject(fail('ABORTED', 'Request was aborted'));
    });
  });
}

function refusalStatus(ctx, request) {
  let connection;
  try {
    connection = ctx.get('connection');
  } catch {
    connection = undefined;
  }
  const gate = connection && typeof connection.requestRejection === 'function'
    ? connection.requestRejection.bind(connection)
    : undefined;
  if (gate !== undefined) {
    try {
      const status = gate(request);
      if (typeof status === 'number') return status;
    } catch {
      return 403;
    }
  }
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    try {
      if (new URL(origin).host !== host) return 403;
    } catch {
      return 403;
    }
  }
  return undefined;
}

function isJsonRequest(request) {
  return String(request.headers['content-type'] || '').toLowerCase().includes('application/json');
}

function errorStatus(error) {
  const code = error?.code;
  if (code === 'AUTH') return 401;
  if (code === 'NO_INPUT' || code === 'NO_ANSWER' || code === 'EMPTY') return 409;
  if (code === 'TIMEOUT' || code === 'BROWSER_TIMEOUT' || code === 'ABORTED') return 504;
  return 502;
}

function errorPayload(error) {
  return {
    ok: false,
    code: error?.code || 'ERROR',
    error: error instanceof Error ? error.message : 'Request failed',
  };
}

export function createHandlers(options) {
  const { ctx, state, bridges = new Map(), persist } = options;
  const provider = BROWSER_PROVIDERS[0];
  const bridge = bridges.get(provider.id);

  async function listProviders() {
    try {
      const llm = ctx.get('llm');
      if (llm !== undefined && typeof llm.listProviders === 'function') {
        return await llm.listProviders();
      }
    } catch {
      /* The model list is best-effort. */
    }
    return [];
  }

  function service(name) {
    try {
      return ctx.get(name);
    } catch {
      return undefined;
    }
  }

  async function selectDefaultModel() {
    const service = (() => {
      try {
        return ctx.get('agentDefaultModel');
      } catch {
        return undefined;
      }
    })();
    if (service === undefined || typeof service.saveSelection !== 'function') return false;
    try {
      await service.saveSelection({ provider: 'deepseek-web', model: 'deepseek-web' });
      return true;
    } catch {
      return false;
    }
  }

  async function selectSessionModel(sessionId, enabled) {
    const controller = service('sessionController');
    if (enabled) {
      if (controller !== undefined && typeof controller.selectModel === 'function') {
        try {
          await controller.selectModel({ sessionId, provider: 'deepseek-web', model: 'deepseek-web' });
          return true;
        } catch {
          return false;
        }
      }
      return selectDefaultModel();
    }
    const fallback = service('agentDefaultModel');
    const selection = typeof fallback?.currentSelection === 'function'
      ? fallback.currentSelection()
      : undefined;
    if (
      controller !== undefined
      && typeof controller.selectModel === 'function'
      && selection !== undefined
      && typeof selection.provider === 'string'
      && typeof selection.model === 'string'
    ) {
      try {
        await controller.selectModel({ ...selection, sessionId });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async function getState(request, response) {
    const refused = refusalStatus(ctx, request);
    if (refused !== undefined) {
      sendJson(response, refused, { ok: false, code: 'REFUSED', error: 'Request refused' });
      return;
    }
    const sessionId = new URL(request.url ?? '/', 'http://dsh.local').searchParams.get('sessionId') ?? '';
    const sessions = state.sessions instanceof Map ? Object.fromEntries(state.sessions) : {};
    const controller = service('sessionController');
    sendJson(response, 200, {
      ok: true,
      enabled: sessionId !== '' && sessions[sessionId] === true,
      sessions,
      canSelectModel: controller !== undefined && typeof controller.selectModel === 'function',
      browserProviders: state.browserProviders,
      llmProviders: await listProviders(),
    });
  }

  async function postToggle(request, response) {
    const refused = refusalStatus(ctx, request);
    if (refused !== undefined) {
      sendJson(response, refused, { ok: false, code: 'REFUSED', error: 'Request refused' });
      return;
    }
    if (!isJsonRequest(request)) {
      sendJson(response, 415, { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Expected application/json' });
      return;
    }
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendJson(response, error?.code === 'BODY_TOO_LARGE' ? 413 : 400, errorPayload(error));
      return;
    }
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    if (sessionId === '') {
      sendJson(response, 400, { ok: false, code: 'NO_SESSION', error: 'sessionId is required' });
      return;
    }
    const enabled = body?.enabled === true;
    if (!(state.sessions instanceof Map)) state.sessions = new Map();
    if (enabled) state.sessions.set(sessionId, true);
    else state.sessions.delete(sessionId);
    for (const entry of Object.values(state.browserProviders)) {
      entry.enabled = state.sessions.size > 0;
    }
    if (typeof persist === 'function') {
      try {
        await persist(state.sessions);
      } catch {
        /* Persistence is best-effort. */
      }
    }
    const selected = await selectSessionModel(sessionId, enabled);
    sendJson(response, 200, { ok: true, enabled, selected, sessionId });
  }

  async function withBridge(request, response, action) {
    const refused = refusalStatus(ctx, request);
    if (refused !== undefined) {
      sendJson(response, refused, { ok: false, code: 'REFUSED', error: 'Request refused' });
      return;
    }
    if (bridge === undefined) {
      sendJson(response, 404, { ok: false, code: 'UNKNOWN_PROVIDER', error: 'DeepSeek bridge is not configured' });
      return;
    }
    const entry = state.browserProviders?.[provider.id];
    try {
      const payload = await action(bridge);
      if (entry !== undefined) {
        entry.status = payload?.status
          || (payload?.ready === true ? 'ready' : (payload?.login === true ? 'login' : 'ready'));
        entry.lastError = null;
      }
      sendJson(response, 200, { ok: true, ...(payload ?? {}) });
    } catch (error) {
      if (entry !== undefined) {
        entry.status = 'error';
        entry.lastError = error instanceof Error ? error.message : 'Browser request failed';
      }
      sendJson(response, errorStatus(error), errorPayload(error));
    }
  }

  const browser = {
    [provider.id]: {
      open: (request, response) => withBridge(request, response, (b) => b.open()),
      check: (request, response) => withBridge(request, response, (b) => b.check()),
      test: (request, response) => withBridge(request, response, (b) => b.ask('Reply with exactly: OK')),
      'new-chat': (request, response) => withBridge(request, response, (b) => b.startNewChat()),
      'delete-all': (request, response) => withBridge(request, response, (b) => b.deleteAllChats()),
      close: (request, response) => withBridge(request, response, async (b) => {
        await b.close();
        return { ready: false, status: 'idle' };
      }),
    },
  };

  return { getState, postToggle, browser };
}

/** Register every route on the Host web server. */
export function registerRoutes(ctx, options) {
  const handlers = createHandlers({ ...options, ctx });
  const routes = [
    { method: 'GET', path: '/dsh-web-chat/state', handler: handlers.getState },
    { method: 'POST', path: '/dsh-web-chat/toggle', handler: handlers.postToggle },
  ];
  for (const [id, browserHandlers] of Object.entries(handlers.browser ?? {})) {
    for (const action of ['open', 'check', 'test', 'new-chat', 'delete-all', 'close']) {
      routes.push({
        method: 'POST',
        path: `/dsh-web-chat/browser/${id}/${action}`,
        handler: browserHandlers[action],
      });
    }
  }
  for (const route of routes) {
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: route.path,
        handler: (request, response) => {
          if (request.method !== route.method) {
            response.writeHead(405, { allow: route.method });
            response.end();
            return undefined;
          }
          return route.handler(request, response);
        },
      }),
      `dsh-web-chat: ${route.path}`,
    );
  }
}
