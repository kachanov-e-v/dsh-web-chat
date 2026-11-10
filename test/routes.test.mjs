import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createHandlers } from '../lib/routes.js';
import { createState } from '../lib/state.js';
import { BROWSER_PROVIDERS } from '../lib/browser/providers.js';

const HOST = '127.0.0.1:2978';

function makeRequest(options = {}) {
  const request = new EventEmitter();
  request.method = options.method ?? 'POST';
  request.url = options.url ?? '/';
  request.headers = {
    host: HOST,
    origin: `http://${HOST}`,
    'content-type': 'application/json',
    ...(options.headers ?? {}),
  };
  const body = options.body ?? '';
  process.nextTick(() => {
    if (body !== '') request.emit('data', Buffer.from(body));
    request.emit('end');
  });
  return request;
}

function makeResponse() {
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers ?? {};
      this.headersSent = true;
    },
    end(body = '') {
      this.body += body;
      this.headersSent = true;
    },
  };
  return response;
}

function parse(response) {
  return JSON.parse(response.body);
}

function createCtx(options = {}) {
  return {
    get(name) {
      if (name === 'sessionController') return options.sessionController;
      if (name === 'agentDefaultModel') return options.agentDefaultModel;
      return undefined;
    },
  };
}

test('the state starts disabled and the toggle selects the model for one chat', async () => {
  const state = createState();
  for (const provider of BROWSER_PROVIDERS) {
    state.browserProviders[provider.id] = { enabled: false, status: 'idle', lastError: null };
  }
  const selected = [];
  const handlers = createHandlers({
    ctx: createCtx({
      sessionController: {
        async selectModel(selection) {
          selected.push(selection);
        },
      },
    }),
    state,
    bridges: new Map(),
  });

  const initial = makeResponse();
  await handlers.getState(makeRequest({ method: 'GET' }), initial);
  assert.equal(parse(initial).enabled, false);
  assert.deepEqual(parse(initial).sessions, {});

  const toggled = makeResponse();
  await handlers.postToggle(
    makeRequest({ body: JSON.stringify({ enabled: true, sessionId: 'session-1' }) }),
    toggled,
  );
  const body = parse(toggled);
  assert.equal(body.ok, true);
  assert.equal(body.enabled, true);
  assert.equal(body.selected, true);
  assert.deepEqual(selected, [{
    sessionId: 'session-1',
    provider: 'deepseek-web',
    model: 'deepseek-web',
  }]);
  assert.equal(state.sessions.get('session-1'), true);
});

test('a cross-origin toggle is refused', async () => {
  const state = createState();
  state.browserProviders.deepseek = { enabled: false, status: 'idle', lastError: null };
  const handlers = createHandlers({ ctx: createCtx(), state, bridges: new Map() });
  const response = makeResponse();
  await handlers.postToggle(
    makeRequest({ headers: { origin: 'http://evil.test' }, body: '{}' }),
    response,
  );
  assert.equal(response.statusCode, 403);
});
