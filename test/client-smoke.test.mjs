import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'client.js'), 'utf8');

function createReactStub() {
  return {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children };
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}];
    },
    useEffect(effect) {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanup();
    },
  };
}

function loadPlugin() {
  let loadedFactory;
  const window = {
    addEventListener() {},
    removeEventListener() {},
    __ModuleLoader__: {
      load(definition) {
        loadedFactory = definition.factory;
      },
    },
  };
  const React = createReactStub();
  const sandbox = {
    window,
    document: { baseURI: 'http://127.0.0.1:2978/', visibilityState: 'visible' },
    URL,
    setTimeout,
    clearTimeout,
    console,
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          enabled: false,
          browserProviders: { deepseek: { enabled: false, status: 'idle', lastError: null } },
          llmProviders: [{ id: 'deepseek-web', name: 'DeepSeek Web' }],
        };
      },
    }),
  };
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  assert.equal(typeof loadedFactory, 'function');
  return loadedFactory((name) => {
    if (name === 'react') return React;
    throw new Error(`Unexpected module ${name}`);
  });
}

function walk(node, visit) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node !== 'object') return;
  visit(node);
  if (node.children) for (const child of node.children) walk(child, visit);
}

function hostContext() {
  const components = new Map();
  return {
    components,
    ctx: {
      locale: {
        getLocale: () => ({ active: 'ru-RU' }),
        subscribe: () => () => {},
      },
      slots: {
        inject: (_name, callback) => callback(),
        register: (options, component) => {
          components.set(options.id, component);
          return () => {};
        },
      },
    },
  };
}

test('the client registers the chip and opens the DeepSeek panel', () => {
  const plugin = loadPlugin();
  const { components, ctx } = hostContext();
  plugin.apply(ctx);

  const chip = components.get('chat-model');
  const panel = components.get('chat-model-panel');
  assert.equal(typeof chip, 'function');
  assert.equal(typeof panel, 'function');

  const chipTree = chip();
  let chipClick = null;
  walk(chipTree, (node) => {
    if (node.props?.className === 'dcm-chip') chipClick = node.props.onClick;
  });
  assert.equal(typeof chipClick, 'function');

  assert.equal(panel(), null);
  chipClick();
  const panelTree = panel();
  assert.notEqual(panelTree, null);
  const classes = [];
  walk(panelTree, (node) => {
    if (typeof node.props?.className === 'string') classes.push(node.props.className);
  });
  assert.ok(classes.includes('dcm-panel'));
  assert.ok(classes.some((name) => name.startsWith('dcm-btn')));
  assert.ok(classes.includes('dcm-dot'));
});
