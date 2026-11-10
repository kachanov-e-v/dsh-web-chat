import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCheckExpression,
  buildClickExpression,
  buildFocusExpression,
  buildNewChatExpression,
  buildSnapshotExpression,
  buildWaitExpression,
  cleanAnswer,
} from '../lib/browser/dom.js';
import { BROWSER_PROVIDERS, browserProviderById } from '../lib/browser/providers.js';
import { browserProfileDir } from '../lib/browser/cdp.js';
import { BrowserBridge } from '../lib/browser/manager.js';

test('the streaming bridge reports growing DOM snapshots', async () => {
  const snapshots = [
    { ok: true, text: 'Hel' },
    { ok: true, text: 'Hello' },
    { ok: true, text: 'Hello' },
    { ok: true, text: 'Hello' },
  ];
  const bridge = new BrowserBridge({
    provider: {
      id: 'deepseek',
      host: 'chat.deepseek.com',
      startUrl: 'https://chat.deepseek.com/',
      answerSelectors: [],
      timeoutMs: 5000,
      stableMs: 15,
    },
    baseDir: 'C:/tmp/dsh-web-chat-test',
    executable: 'none',
  });
  bridge.client = {
    evaluate: async () => snapshots.shift() ?? { ok: true, text: 'Hello' },
  };
  const deltas = [];
  const result = await bridge.waitForAnswerStreaming(
    { beforeText: '', beforeCount: 0, prompt: '' },
    undefined,
    (text) => deltas.push(text),
  );
  assert.equal(result.ok, true);
  assert.equal(result.text, 'Hello');
  assert.deepEqual(deltas, ['Hel', 'Hello']);
});

test('a degenerate DSML repetition is rejected', async () => {
  const bridge = new BrowserBridge({
    provider: {
      id: 'deepseek',
      host: 'chat.deepseek.com',
      startUrl: 'https://chat.deepseek.com/',
      answerSelectors: [],
      timeoutMs: 5000,
      stableMs: 15,
    },
    baseDir: 'C:/tmp/dsh-web-chat-test',
    executable: 'none',
  });
  bridge.client = {
    evaluate: async () => ({
      ok: true,
      text: 'DSML parameter name="limit" string="false">1 '.repeat(300),
    }),
  };
  await assert.rejects(
    bridge.waitForAnswerStreaming(
      { beforeText: '', beforeCount: 0, prompt: '' },
      undefined,
      () => {},
    ),
    (error) => {
      assert.equal(error.code, 'DEGENERATED');
      return true;
    },
  );
});

test('the DeepSeek browser provider has selectors and a new-chat action', () => {
  assert.deepEqual(BROWSER_PROVIDERS.map((provider) => provider.id), ['deepseek']);
  const provider = browserProviderById('deepseek');
  assert.equal(provider.host, 'chat.deepseek.com');
  assert.ok(provider.startUrl.startsWith('https://'));
  assert.ok(provider.inputSelectors.length > 0);
  assert.ok(provider.answerSelectors.length > 0);
  assert.ok(provider.newChatSelectors.length > 0);
  assert.equal(provider.experimental, true);
});

test('the page expressions embed the DeepSeek selector profile safely', () => {
  const provider = browserProviderById('deepseek');
  const focus = buildFocusExpression({
    inputSelectors: provider.inputSelectors,
    answerSelectors: provider.answerSelectors,
  });
  assert.match(focus, /textarea#chat-input/);
  assert.match(focus, /ds-markdown/);

  const wait = buildWaitExpression({
    answerSelectors: provider.answerSelectors,
    beforeText: 'previous answer',
    beforeCount: 1,
    timeoutMs: 1000,
    stableMs: 10,
  });
  assert.match(wait, /previous answer/);
  assert.match(wait, /beforeCount/);
  assert.match(wait, /CONTEXT_LIMIT/);
  assert.match(wait, /RATE_LIMIT/);

  const snapshot = buildSnapshotExpression({
    answerSelectors: provider.answerSelectors,
    beforeCount: 1,
    beforeText: 'previous answer',
  });
  assert.match(snapshot, /isNew/);
  assert.match(snapshot, /CONTEXT_LIMIT/);
  assert.match(snapshot, /RATE_LIMIT/);

  assert.match(buildCheckExpression(), /hasComposer/);
  assert.match(buildClickExpression({ sendSelectors: ['button[type="submit"]'] }), /button\[type=/);
});

test('cleanAnswer removes the previous turn, the prompt echo, and labels', () => {
  assert.equal(cleanAnswer('oldoldNEW', 'oldold', 'prompt'), 'NEW');
  assert.equal(cleanAnswer('promptNEW', '', 'prompt'), 'NEW');
  assert.equal(cleanAnswer('  spaced  ', '', ''), 'spaced');
  const dsml = '<｜｜DSML｜｜ calls><｜｜DSML｜｜ invoke name="pwsh"><｜｜DSML｜｜ parameter name="command" string="true">ls</｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke></｜｜DSML｜｜ calls>';
  assert.equal(cleanAnswer(dsml, dsml, ''), dsml);
  const fenced = '```tool\n<tool_call>{"name":"pwsh","arguments":{"command":"ls"}}</tool_call>\n```';
  assert.equal(cleanAnswer(fenced, fenced, ''), fenced);
});

test('the new-chat expression clicks the provider new-chat selector', () => {
  const expression = buildNewChatExpression({ selectors: ['.new-chat'] });
  assert.match(expression, /new-chat/);
  assert.match(expression, /querySelectorAll/);
});

test('the browser profile lives below the DSH home directory', () => {
  const dir = browserProfileDir('C:/dsh-home', 'deepseek');
  assert.ok(dir.endsWith('browser\\deepseek') || dir.endsWith('browser/deepseek'));
});
