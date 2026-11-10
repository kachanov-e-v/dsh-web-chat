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

  const snapshot = buildSnapshotExpression({
    answerSelectors: provider.answerSelectors,
    beforeCount: 1,
    beforeText: 'previous answer',
  });
  assert.match(snapshot, /isNew/);
  assert.match(snapshot, /CONTEXT_LIMIT/);

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
