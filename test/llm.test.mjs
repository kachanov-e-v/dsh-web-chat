import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBrowserAgentPrompt,
  MAX_PROMPT_CHARS,
  parseBrowserToolCall,
  parseDeepSeekToolCall,
  parseJsonToolCall,
  stripToolTags,
} from '../lib/llm/prompt.js';
import { createDeepSeekWebAdapter } from '../lib/llm/deepseek-web.js';

const TOOLS = [{
  name: 'bash',
  description: 'Run a shell command',
  parameters: { type: 'object', properties: { command: { type: 'string' } } },
}];

const PWSH_TOOLS = [{
  name: 'pwsh',
  description: 'Run a PowerShell command',
  parameters: { type: 'object', properties: { command: { type: 'string' } } },
}];

const READ_TOOLS = [{
  name: 'read',
  description: 'Read a file',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      offset: { type: 'integer' },
    },
  },
}];

const ASK_TOOLS = [
  ...TOOLS,
  {
    name: 'ask_user_question',
    description: 'Ask the user a structured question',
    parameters: { type: 'object', properties: {} },
  },
];

test('the adapter prompt carries the system prompt, tools, transcript, and protocol', () => {
  const prompt = buildBrowserAgentPrompt({
    system: 'SYS-MARKER',
    tools: TOOLS,
    memory: 'MEMORY-MARKER',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'build an app' }] }],
  });
  assert.match(prompt, /SYS-MARKER/);
  assert.match(prompt, /Run a shell command/);
  assert.match(prompt, /MEMORY-MARKER/);
  assert.match(prompt, /build an app/);
  assert.match(prompt, /<tool_call>/);
  assert.match(prompt, /ask_user_question/);
  assert.match(prompt, /ambiguous/i);
  assert.match(prompt, /pwsh/);
  assert.doesNotMatch(prompt, /use bash/i);
  assert.match(prompt, /scan first/i);
  assert.match(prompt, /Never repeat a tool call/i);
  assert.match(prompt, /Russian/i);
});

test('a very large request stays inside the hard prompt limit', () => {
  const prompt = buildBrowserAgentPrompt({
    system: 'S'.repeat(200000),
    tools: TOOLS,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'T'.repeat(200000) }] }],
  });
  assert.ok(prompt.length <= MAX_PROMPT_CHARS);
  assert.match(prompt, /Compacted earlier context/);
  assert.match(prompt, /--- Tool call protocol ---/);
  assert.match(prompt, /<tool_call>/);
});

test('large tool results are clipped with a reread hint', () => {
  const prompt = buildBrowserAgentPrompt({
    system: '',
    tools: TOOLS,
    messages: [{
      role: 'tool',
      toolCallId: 'tool-1',
      content: [{ type: 'text', text: 'X'.repeat(50000) }],
    }],
  });
  assert.match(prompt, /\[tool result truncated: \d+ chars omitted/);
  assert.ok(prompt.length < MAX_PROMPT_CHARS);
});

const DSML = [
  '< | | DSML | | calls>',
  '< | | DSML | | invoke name="pwsh">',
  '< | | DSML | | parameter name="description" string="true">List workspace files</ | | DSML | | parameter>',
  '< | | DSML | | parameter name="command" string="true">Get-ChildItem -Force | Select-Object Mode, Length, Name</ | | DSML | | parameter>',
  '</ | | DSML | | invoke>',
  '</ | | DSML | | calls>',
].join('\n');

test('parseDeepSeekToolCall reads native DSML into a normal tool call', () => {
  const call = parseDeepSeekToolCall(DSML, [{ name: 'pwsh' }]);
  assert.equal(call.name, 'pwsh');
  assert.deepEqual(call.arguments, {
    description: 'List workspace files',
    command: 'Get-ChildItem -Force | Select-Object Mode, Length, Name',
  });
  assert.equal(call.text, '');
  assert.equal(stripToolTags(DSML), '');
});

test('parseDeepSeekToolCall accepts fullwidth DSML and spaced attributes', () => {
  const fullwidth = [
    '<｜｜DSML｜｜ calls>',
    '<｜｜DSML｜｜ invoke name="edit">',
    '<｜｜DSML｜｜ parameter name="file_path" string="true">app.js</｜｜DSML｜｜ parameter>',
    '<｜｜DSML｜｜ parameter name=\n"old_string" string = "true">old</｜｜DSML｜｜ parameter>',
    '<｜｜DSML｜｜ parameter name="new_string" string="true">new</｜｜DSML｜｜ parameter>',
    '</｜｜DSML｜｜ invoke>',
    '</｜｜DSML｜｜ calls>',
  ].join('\n');
  const call = parseDeepSeekToolCall(fullwidth, [{ name: 'edit' }]);
  assert.equal(call.name, 'edit');
  assert.deepEqual(call.arguments, {
    file_path: 'app.js',
    old_string: 'old',
    new_string: 'new',
  });
});

test('the DeepSeek adapter streams a DSML tool call', async () => {
  const adapter = createDeepSeekWebAdapter({
    bridge: { ask: async () => ({ answer: DSML }) },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({
    system: '',
    messages: [],
    tools: [{ name: 'pwsh', description: 'Run PowerShell', parameters: { type: 'object' } }],
  })) chunks.push(chunk);
  const block = chunks.find((chunk) => chunk.type === 'block-end');
  assert.equal(block.block.type, 'tool-call');
  assert.equal(block.block.name, 'pwsh');
  assert.deepEqual(JSON.parse(block.block.arguments), {
    description: 'List workspace files',
    command: 'Get-ChildItem -Force | Select-Object Mode, Length, Name',
  });
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls');
});

test('a tool call for an unknown tool fails fast without a new chat', async () => {
  let newChats = 0;
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async () => ({ answer: '```tool\n<tool_call>{"name":"edit","arguments":{}}</tool_call>\n```' }),
      startNewChat: async () => {
        newChats += 1;
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({ system: '', messages: [], tools: [] })) chunks.push(chunk);
  assert.equal(newChats, 0);
  assert.equal(chunks.at(-1).reason.kind, 'error');
  assert.equal(chunks.at(-1).reason.failure.code, 'UNKNOWN_TOOL');
  assert.match(chunks.at(-1).reason.failure.message, /"edit"/);
});

test('a bridge EMPTY answer starts a new chat and retries once', async () => {
  let calls = 0;
  let newChats = 0;
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async () => {
        calls += 1;
        if (calls === 1) {
          const error = new Error('The provider returned an empty answer');
          error.code = 'EMPTY';
          throw error;
        }
        return { answer: 'recovered' };
      },
      startNewChat: async () => {
        newChats += 1;
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({ system: '', messages: [], tools: [] })) chunks.push(chunk);
  assert.equal(newChats, 1);
  assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'recovered');
});

test('a large prompt is compacted without a new chat', async () => {
  let newChats = 0;
  let captured = '';
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async (prompt) => {
        captured = prompt;
        return { answer: 'ok' };
      },
      startNewChat: async () => {
        newChats += 1;
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({
    system: 'S'.repeat(200000),
    messages: [{ role: 'user', content: [{ type: 'text', text: 'T'.repeat(200000) }] }],
    tools: [],
  })) chunks.push(chunk);
  assert.equal(newChats, 0);
  assert.match(captured, /Compacted earlier context/);
  assert.ok(captured.length <= MAX_PROMPT_CHARS);
  assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'ok');
});

test('subsequent turns send a continuation instead of the full prompt', async () => {
  const prompts = [];
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      currentChatKey: async () => 'chat-1',
      ask: async (prompt) => {
        prompts.push(prompt);
        return { answer: 'ok' };
      },
    },
  });

  for await (const _chunk of adapter.stream({
    sessionId: 'session-1',
    system: 'SYS-MARKER',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'first' }] }],
    tools: [],
  })) { /* consume */ }

  for await (const _chunk of adapter.stream({
    sessionId: 'session-1',
    system: 'SYS-MARKER',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'first' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'second' }] },
    ],
    tools: [],
  })) { /* consume */ }

  assert.match(prompts[0], /SYS-MARKER/);
  assert.match(prompts[0], /first/);
  assert.match(prompts[1], /CONTINUATION/);
  assert.match(prompts[1], /second/);
  assert.match(prompts[1], /ask_user_question/);
  assert.match(prompts[1], /Russian/i);
  assert.ok(!prompts[1].includes('SYS-MARKER'));
});

test('ask_user_question stays in the prompt even with many tools', () => {
  const tools = Array.from({ length: 40 }, (_, index) => ({
    name: `tool_${index}`,
    description: 'A tool with a moderately long description.',
    parameters: { type: 'object', properties: {} },
  }));
  tools.push({
    name: 'ask_user_question',
    description: 'Ask the user a structured question.',
    parameters: { type: 'object', properties: {} },
  });
  const prompt = buildBrowserAgentPrompt({ system: '', messages: [], tools });
  assert.match(prompt, /- ask_user_question:/);
  assert.match(prompt, /ambiguous/i);
});

test('ask_user_question survives literal newlines inside its JSON', () => {
  const answer = 'Before I continue, one question:\n```tool\n'
    + '<tool_call>{"name":"ask_user_question","arguments":{"questions":'
    + '[{"id":"approach","header":"Как продолжать","question":"line1\nline2",'
    + '"options":[{"label":"Продолжить","description":"..."}]}]}}</tool_call>\n```';
  const call = parseJsonToolCall(answer, ASK_TOOLS);
  assert.equal(call.name, 'ask_user_question');
  assert.equal(call.arguments.questions[0].id, 'approach');
  assert.match(call.arguments.questions[0].question, /line1/);
});

test('a model request auto-enables and persists its session', async () => {
  const state = { sessions: new Map() };
  let saved = 0;
  const adapter = createDeepSeekWebAdapter({
    state,
    bridge: {
      ask: async () => ({ answer: 'ok' }),
    },
    onSessionEnabled: () => {
      saved += 1;
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({
    sessionId: 'session-auto',
    system: '',
    messages: [],
    tools: [],
  })) chunks.push(chunk);
  assert.equal(state.sessions.get('session-auto'), true);
  assert.equal(saved, 1);
  assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'ok');
});

test('a bash tool call is aliased to pwsh on Windows', () => {
  const dsml = '<||DSML||calls>\n'
    + '<||DSML||invoke name="bash">\n'
    + '<||DSML||parameter name="command" string="true">node -e "console.log(1)"</||DSML||parameter>\n'
    + '</||DSML||invoke>\n'
    + '</||DSML||calls>';
  const dsmlCall = parseDeepSeekToolCall(dsml, PWSH_TOOLS);
  assert.equal(dsmlCall.name, 'pwsh');
  assert.match(dsmlCall.arguments.command, /node -e/);

  const jsonCall = parseJsonToolCall(
    '```tool\n<tool_call>{"name":"bash","arguments":{"command":"ls"}}</tool_call>\n```',
    PWSH_TOOLS,
  );
  assert.equal(jsonCall.name, 'pwsh');
  assert.equal(jsonCall.arguments.command, 'ls');
});

test('a DSML call with a fused closing tag and no invoke close is parsed', () => {
  // Captured from chat.deepseek.com (0.11.5): the model closed `workdir` with
  // `</… parameter name="timeoutMs" …>` and never closed `invoke`.
  const answer = [
    '<｜｜DSML｜｜ calls>',
    '<｜｜DSML｜｜ invoke name="pwsh">',
    '<｜｜DSML｜｜ parameter name="command" string="true">powershell -NoProfile -File .\\inspect.ps1</｜｜DSML｜｜ parameter>',
    '<｜｜DSML｜｜ parameter name="description" string="true">Запустить inspect.ps1</｜｜DSML｜｜ parameter>',
    '<｜｜DSML｜｜ parameter name="workdir" string="true">C:\\work</｜｜DSML｜｜ parameter>',
    '</｜｜DSML｜｜ parameter name="timeoutMs" string="false">30000</｜｜DSML｜｜ parameter>',
    '<｜｜DSML｜｜ parameter name="run_in_background" string="false">false</｜｜DSML｜｜ parameter>',
    '<｜｜DSML｜｜ parameter name="sandbox_permissions" string="true">workspace-write</｜｜DSML｜｜ parameter>',
    '<｜｜DSML｜｜ parameter name="justification" string="true">Нужно прочитать файл</｜｜DSML｜｜ parameter>',
    '</｜｜DSML｜｜ calls>',
  ].join('\n');
  const call = parseDeepSeekToolCall(answer, [{ name: 'pwsh' }]);
  assert.equal(call.name, 'pwsh');
  assert.deepEqual(call.arguments, {
    command: 'powershell -NoProfile -File .\\inspect.ps1',
    description: 'Запустить inspect.ps1',
    workdir: 'C:\\work',
    timeoutMs: 30000,
    run_in_background: false,
    sandbox_permissions: 'workspace-write',
    justification: 'Нужно прочитать файл',
  });
  assert.equal(call.text, '');
});

test('an unclosed DSML call still parses its arguments', () => {
  const answer = '<｜｜DSML｜｜ calls>\n'
    + '<｜｜DSML｜｜ invoke name="read">\n'
    + '<｜｜DSML｜｜ parameter name="file_path" string="true">app.js</｜｜DSML｜｜ parameter>';
  const call = parseDeepSeekToolCall(answer, READ_TOOLS);
  assert.equal(call.name, 'read');
  assert.equal(call.arguments.file_path, 'app.js');
});

test('the adapter streams a recovered broken DSML call instead of EMPTY', async () => {
  const answer = '<｜｜DSML｜｜ calls>\n'
    + '<｜｜DSML｜｜ invoke name="pwsh">\n'
    + '<｜｜DSML｜｜ parameter name="command" string="true">Get-ChildItem</｜｜DSML｜｜ parameter>\n'
    + '<｜｜DSML｜｜ parameter name="workdir" string="true">C:\\work</｜｜DSML｜｜ parameter>\n'
    + '</｜｜DSML｜｜ parameter name="timeoutMs" string="false">30000</｜｜DSML｜｜ parameter>\n'
    + '</｜｜DSML｜｜ calls>';
  const adapter = createDeepSeekWebAdapter({ bridge: { ask: async () => ({ answer }) } });
  const chunks = [];
  for await (const chunk of adapter.stream({
    system: '',
    messages: [],
    tools: [{ name: 'pwsh', description: 'Run PowerShell', parameters: { type: 'object' } }],
  })) chunks.push(chunk);
  const block = chunks.find((chunk) => chunk.type === 'block-end');
  assert.equal(block.block.name, 'pwsh');
  assert.deepEqual(JSON.parse(block.block.arguments), {
    command: 'Get-ChildItem',
    workdir: 'C:\\work',
    timeoutMs: 30000,
  });
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls');
});

test('a malformed envelope for a known tool starts a new chat and retries', async () => {
  let calls = 0;
  let newChats = 0;
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async () => {
        calls += 1;
        return { answer: calls === 1 ? '<｜｜DSML｜｜ invoke name="pwsh">' : 'recovered' };
      },
      startNewChat: async () => {
        newChats += 1;
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({
    system: '',
    messages: [],
    tools: [{ name: 'pwsh', description: 'Run PowerShell', parameters: { type: 'object' } }],
  })) chunks.push(chunk);
  assert.equal(newChats, 1);
  assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'recovered');
});

test('DeepSeek nested invoke argument tags are parsed', () => {
  const dsml = '<｜｜DSML｜｜ calls>\n'
    + '<｜｜DSML｜｜ invoke name="read">\n'
    + '<｜｜DSML｜｜ invoke name="file_path" string="true">index.html</｜DSML｜｜ invoke>\n'
    + '<｜｜DSML｜｜ invoke name="offset" string="false">1</｜DSML｜｜ invoke>\n'
    + '</｜｜DSML｜｜ invoke>\n'
    + '</｜｜DSML｜｜ calls>';
  const call = parseDeepSeekToolCall(dsml, READ_TOOLS);
  assert.equal(call.name, 'read');
  assert.equal(call.arguments.file_path, 'index.html');
  assert.equal(call.arguments.offset, 1);
});

test('core file and shell tools survive the tool budget', () => {
  const tools = [
    { name: 'free_models_search', description: 'x'.repeat(500), parameters: { type: 'object', properties: {} } },
    { name: 'free_models_config', description: 'x'.repeat(500), parameters: { type: 'object', properties: {} } },
    { name: 'plugin_manager', description: 'x'.repeat(500), parameters: { type: 'object', properties: {} } },
    { name: 'read', description: 'Read a file', parameters: { type: 'object', properties: {} } },
    { name: 'grep', description: 'Search files', parameters: { type: 'object', properties: {} } },
    { name: 'pwsh', description: 'Run PowerShell', parameters: { type: 'object', properties: {} } },
    { name: 'ask_user_question', description: 'Ask', parameters: { type: 'object', properties: {} } },
  ];
  const prompt = buildBrowserAgentPrompt({ system: '', messages: [], tools });
  assert.match(prompt, /- ask_user_question:/);
  assert.match(prompt, /- read:/);
  assert.match(prompt, /- grep:/);
  assert.match(prompt, /- pwsh:/);
});

test('a rate limit is retried once', async () => {
  let calls = 0;
  const adapter = createDeepSeekWebAdapter({
    rateLimitDelayMs: 0,
    bridge: {
      ask: async () => {
        calls += 1;
        if (calls === 1) {
          const error = new Error('DeepSeek rate limit');
          error.code = 'RATE_LIMIT';
          throw error;
        }
        return { answer: 'ok' };
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({
    sessionId: 'session-rate',
    system: '',
    messages: [],
    tools: [],
  })) chunks.push(chunk);
  assert.equal(calls, 2);
  assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'ok');
});

test('a degenerate answer starts a fresh chat and retries', async () => {
  let calls = 0;
  let newChats = 0;
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async () => {
        calls += 1;
        if (calls === 1) {
          const error = new Error('DeepSeek started repeating a malformed tool call');
          error.code = 'DEGENERATED';
          throw error;
        }
        return { answer: 'recovered' };
      },
      startNewChat: async () => {
        newChats += 1;
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({
    sessionId: 'session-degenerate',
    system: '',
    messages: [],
    tools: [],
  })) chunks.push(chunk);
  assert.equal(newChats, 1);
  assert.equal(calls, 2);
  assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'recovered');
});

test('a bare questions JSON is recovered as ask_user_question', () => {
  const answer = 'Сканирование сделал. Как поступить?\n'
    + 'questions: [{"id":"scope","header":"Уточнение","question":"Что исправить?",'
    + '"options":[{"label":"Все баги","description":"Ревизия логики"}]}]';
  const call = parseBrowserToolCall(answer, ASK_TOOLS);
  assert.equal(call.name, 'ask_user_question');
  assert.equal(call.arguments.questions[0].id, 'scope');
  assert.equal(call.arguments.questions[0].options[0].label, 'Все баги');
});

test('partial DOM snapshots are streamed as text deltas', async () => {
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async (_prompt, options) => {
        options.onDelta('Hel');
        options.onDelta('Hello');
        return { answer: 'Hello' };
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({ system: '', messages: [], tools: [] })) chunks.push(chunk);
  const deltas = chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text);
  assert.deepEqual(deltas, ['Hel', 'lo']);
  const end = chunks.find((chunk) => chunk.type === 'block-end' && chunk.block?.type === 'text');
  assert.equal(end.block.text, 'Hello');
  assert.equal(chunks.at(-1).reason.kind, 'stop');
});

test('a tool-call marker stops text streaming and emits the tool call', async () => {
  const raw = 'Let me check.\n```tool\n<tool_call>{"name":"bash","arguments":{"command":"ls"}}</tool_call>\n```';
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async (_prompt, options) => {
        options.onDelta('Let me check.');
        options.onDelta(raw);
        return { answer: raw };
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({ system: '', messages: [], tools: TOOLS })) chunks.push(chunk);
  const deltas = chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text);
  assert.deepEqual(deltas, ['Let me check.']);
  assert.ok(!deltas.join('').includes('<tool_call>'));
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls');
  const call = chunks.find((chunk) => chunk.type === 'tool-call-delta');
  assert.equal(call.name, 'bash');
});

test('a web-chat length limit starts a new chat and retries with the full prompt', async () => {
  let calls = 0;
  let newChats = 0;
  const prompts = [];
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      currentChatKey: async () => 'chat-1',
      startNewChat: async () => {
        newChats += 1;
      },
      ask: async (prompt) => {
        calls += 1;
        prompts.push(prompt);
        if (calls === 1) {
          const error = new Error('Length limit reached');
          error.code = 'CONTEXT_LIMIT';
          throw error;
        }
        return { answer: 'recovered' };
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({
    sessionId: 'session-1',
    system: 'SYS-MARKER',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'first' }] }],
    tools: [],
  })) chunks.push(chunk);
  assert.equal(newChats, 1);
  assert.match(prompts[1], /SYS-MARKER/);
  assert.ok(!prompts[1].includes('CONTINUATION'));
  assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'recovered');
});

test('automatic new chat is limited by a cooldown', async () => {
  let newChats = 0;
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async () => {
        const error = new Error('The provider returned an empty answer');
        error.code = 'EMPTY';
        throw error;
      },
      startNewChat: async () => {
        newChats += 1;
      },
    },
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const chunks = [];
    for await (const chunk of adapter.stream({ system: '', messages: [], tools: [] })) chunks.push(chunk);
  }
  assert.equal(newChats, 1);
});
test('parseJsonToolCall accepts a valid known tool and strips the block', () => {
  const call = parseJsonToolCall(
    'I will inspect.\n<tool_call>{"name":"bash","arguments":{"command":"ls"}}</tool_call>',
    TOOLS,
  );
  assert.equal(call.name, 'bash');
  assert.deepEqual(call.arguments, { command: 'ls' });
  assert.equal(call.text, 'I will inspect.');
  assert.equal(
    parseJsonToolCall('<tool_call>{"name":"rm","arguments":{}}</tool_call>', TOOLS),
    undefined,
  );
  assert.equal(stripToolTags('a<tool_call>{}</tool_call>b'), 'ab');
});

test('parseJsonToolCall handles a fenced tool block', () => {
  const fenced = '```tool\n<tool_call>{"name":"bash","arguments":{"command":"ls"}}</tool_call>\n```';
  const call = parseJsonToolCall(fenced, TOOLS);
  assert.equal(call.name, 'bash');
  assert.deepEqual(call.arguments, { command: 'ls' });
  assert.equal(call.text, '');
  assert.equal(stripToolTags(fenced), '');
});

test('a normal answer becomes a text stream', async () => {
  const adapter = createDeepSeekWebAdapter({ bridge: { ask: async () => ({ answer: 'hello' }) } });
  const chunks = [];
  for await (const chunk of adapter.stream({ system: '', messages: [], tools: [] })) chunks.push(chunk);
  assert.equal(chunks.length, 4);
  assert.equal(chunks[1].text, 'hello');
  assert.equal(chunks[3].reason.kind, 'stop');
});

test('a tool-call answer becomes a tool-call stream', async () => {
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async () => ({ answer: '<tool_call>{"name":"bash","arguments":{"command":"ls"}}</tool_call>' }),
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({ system: '', messages: [], tools: TOOLS })) chunks.push(chunk);
  const block = chunks.find((chunk) => chunk.type === 'block-end');
  assert.equal(block.block.type, 'tool-call');
  assert.equal(block.block.name, 'bash');
  assert.deepEqual(JSON.parse(block.block.arguments), { command: 'ls' });
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls');
});

test('a bridge failure becomes an error finish', async () => {
  const adapter = createDeepSeekWebAdapter({
    bridge: {
      ask: async () => {
        const error = new Error('not logged in');
        error.code = 'AUTH';
        throw error;
      },
    },
  });
  const chunks = [];
  for await (const chunk of adapter.stream({ system: '', messages: [], tools: [] })) chunks.push(chunk);
  assert.equal(chunks.at(-1).reason.kind, 'error');
  assert.equal(chunks.at(-1).reason.failure.code, 'AUTH');
});

test('the DeepSeek adapter advertises its own provider and model', async () => {
  const adapter = createDeepSeekWebAdapter({ bridge: { ask: async () => ({ answer: 'ok' }) } });
  assert.deepEqual(adapter.providerInfo(), { id: 'deepseek-web', name: 'DeepSeek Web' });
  const models = await adapter.listModels();
  assert.equal(models[0].id, 'deepseek-web');
  const resolved = await adapter.resolveModel('deepseek-web', 'deepseek-web');
  assert.equal(resolved.name, 'DeepSeek (browser)');
});
