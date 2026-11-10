/**
 * Prompt translation for the DeepSeek browser agent adapter.
 *
 * The consumer web chat has no native function calling. The adapter renders
 * the DSH system prompt, the tool schemas, and the conversation into one
 * self-contained prompt and asks the web model to answer either normally or
 * with a tool-call block.
 */

const MAX_PROMPT_CHARS = 60000;
const MAX_SYSTEM_CHARS = 8000;
const MAX_TOOL_CHARS = 10000;
const MAX_TOOL_RESULT_CHARS = 10000;
const MAX_MEMORY_CHARS = 6000;
const MAX_RECENT_TRANSCRIPT_CHARS = 25000;
const MAX_COMPACTED_CONTEXT_CHARS = 6000;

const MEMORY_GUIDANCE = [
  'Keep PROJECT_MEMORY.md current: record Goal, Stack, Structure, Decisions,',
  'Current state, and Next steps. Read it at the start of a task and update it',
  'with write/edit after meaningful changes. Never write secrets, tokens, or',
  'credentials into it.',
].join(' ');

function clipToolResult(text) {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  const half = Math.floor(MAX_TOOL_RESULT_CHARS / 2);
  const omitted = text.length - MAX_TOOL_RESULT_CHARS;
  return [
    text.slice(0, half),
    '',
    `[tool result truncated: ${omitted} chars omitted; use read with a line range or grep for details]`,
    '',
    text.slice(-half),
  ].join('\n');
}

function renderContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    switch (block.type) {
      case 'text':
        if (typeof block.text === 'string' && block.text !== '') parts.push(block.text);
        break;
      case 'tool-call':
        parts.push(`[tool call ${block.id ?? ''}: ${block.name}(${block.arguments ?? ''})]`);
        break;
      case 'image':
        parts.push('[image omitted]');
        break;
      case 'file':
        parts.push('[file omitted]');
        break;
      default:
        break;
    }
  }
  return parts.join('\n');
}

function renderMessage(message) {
  if (!message || typeof message !== 'object') return '';
  const role = String(message.role ?? 'user').toUpperCase();
  const body = renderContent(message.content);
  if (role === 'TOOL') {
    const error = message.isError === true ? ' (error)' : '';
    return `TOOL RESULT${error} [${message.toolCallId ?? 'unknown'}]: ${clipToolResult(body)}`;
  }
  if (body === '') return '';
  return `${role}: ${body}`;
}

function renderMessages(messages) {
  if (!Array.isArray(messages)) return '';
  return messages.map(renderMessage).filter((line) => line !== '').join('\n\n');
}

/**
 * Keep the most recent transcript verbatim and compress the older messages
 * into short one-line facts. The model can still read files for details.
 */
function compactTranscript(messages) {
  if (!Array.isArray(messages)) return '';
  const rendered = messages.map(renderMessage).filter((line) => line !== '');
  const recent = [];
  let recentChars = 0;
  let cut = rendered.length;
  for (let index = rendered.length - 1; index >= 0; index -= 1) {
    const text = rendered[index];
    if (recentChars + text.length > MAX_RECENT_TRANSCRIPT_CHARS && recent.length > 0) break;
    recent.unshift(text);
    recentChars += text.length;
    cut = index;
  }
  const summary = [];
  let summaryChars = 0;
  for (const text of rendered.slice(0, cut)) {
    const line = text.replace(/\s+/g, ' ').slice(0, 500);
    if (summaryChars + line.length > MAX_COMPACTED_CONTEXT_CHARS) {
      summary.push('[earlier context truncated]');
      break;
    }
    summary.push(line);
    summaryChars += line.length;
  }
  return [
    '--- Compacted earlier context ---',
    summary.join('\n') || '(none)',
    '',
    '--- Recent transcript ---',
    recent.join('\n\n') || '(none)',
  ].join('\n');
}

function toolList(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return '(no tools)';
  const lines = [];
  let total = 0;
  for (const tool of tools) {
    const description = String(tool.description ?? '').slice(0, 500);
    const parameters = JSON.stringify(tool.parameters ?? {}).slice(0, 1200);
    const line = `- ${tool.name}: ${description}\n  parameters: ${parameters}`;
    if (total + line.length > MAX_TOOL_CHARS) {
      lines.push(`- ... ${tools.length - lines.length} more tools omitted`);
      break;
    }
    lines.push(line);
    total += line.length;
  }
  return lines.join('\n');
}

const PROTOCOL = [
  'You are the agent model inside DeepSeek Harness. The tools in the list are not',
  'available natively: you call them by emitting a tool-call block.',
  'To call exactly one tool, output only one fenced code block with language `tool` and no other text:',
  '```tool',
  '<tool_call>{"name":"TOOL_NAME","arguments":{...}}</tool_call>',
  '```',
  'Use a tool name exactly as listed. To ask the user a question, call ask_user_question.',
  'To inspect or modify the project, use bash, edit, read, grep, glob and the other',
  'available tools, exactly as a normal agent would. When the task is complete, answer',
  'normally without a tool_call block.',
].join('\n');

const INTRO = [
  'You are DeepSeek, acting as the full agent model inside DeepSeek Harness.',
  'You can inspect and modify the project only through the tools below.',
  'Follow the harness system prompt, the conversation, and the tool protocol.',
].join(' ');

export function buildContinuationPrompt(options) {
  let delta = renderMessages(options?.messages);
  if (delta.length > 30000) delta = delta.slice(-30000);
  return [
    'CONTINUATION of the same task in this web chat.',
    'The system prompt, tool schemas, project memory, and earlier turns are above.',
    'New messages since the last turn:',
    delta || '(none)',
    '',
    'Use the same tool-call protocol. Answer the latest user request.',
  ].join('\n');
}

export function buildBrowserAgentPrompt(options) {
  const system = String(options?.system ?? '');
  const transcript = renderMessages(options?.messages);
  const tools = toolList(options?.tools);
  const memory = String(options?.memory ?? '').slice(0, MAX_MEMORY_CHARS);
  const compose = (systemText, transcriptText) => [
    INTRO,
    '',
    '--- Harness system prompt ---',
    systemText || '(none)',
    '',
    '--- Available tools ---',
    tools,
    '',
    '--- Project memory (PROJECT_MEMORY.md) ---',
    memory || '(not created yet; create it with write when you have enough context)',
    '',
    '--- Memory rules ---',
    MEMORY_GUIDANCE,
    '',
    '--- Conversation transcript ---',
    transcriptText || '(no messages yet)',
    '',
    '--- Tool call protocol ---',
    PROTOCOL,
  ].join('\n');

  let prompt = compose(system, transcript);
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = compose(
      system.slice(0, MAX_SYSTEM_CHARS),
      compactTranscript(options?.messages),
    );
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    const tail = `\n\n--- Tool call protocol ---\n${PROTOCOL}`;
    const room = Math.max(1000, MAX_PROMPT_CHARS - tail.length);
    prompt = `${prompt.slice(0, room)}${tail}`;
  }
  return prompt;
}

/**
 * Parse the first valid tool-call block. Returns undefined for a normal answer.
 */
export function parseJsonToolCall(answer, tools) {
  const text = String(answer ?? '');
  const match = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i.exec(text);
  if (!match) return undefined;
  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const name = payload.name ?? payload.tool;
  let args = payload.arguments ?? payload.args ?? payload.parameters ?? {};
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  if (typeof name !== 'string' || name === '') return undefined;
  if (!Array.isArray(tools) || !tools.some((tool) => tool && tool.name === name)) {
    return undefined;
  }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) args = {};
  return {
    name,
    arguments: args,
    text: stripFenceWrappers(text.replace(match[0], '')),
  };
}

function stripFenceWrappers(text) {
  return String(text ?? '').replace(/```(?:tool|json)?\s*```/gi, '').trim();
}

function parseDsmlParameters(body) {
  const args = {};
  const pattern = /<[^>]*DSML[^>]*parameter\s+name\s*=\s*"([^"]+)"(?:\s+string\s*=\s*"(true|false)")?[^>]*>([\s\S]*?)<[^>]*\/[^>]*DSML[^>]*parameter\s*>/gi;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const key = match[1];
    const stringMode = match[2];
    let value = match[3].trim();
    if (stringMode === 'false') {
      try {
        value = JSON.parse(value);
      } catch {
        /* Keep the raw string when the model did not produce JSON. */
      }
    }
    args[key] = value;
  }
  return args;
}

function stripDsmlBlocks(text) {
  return String(text ?? '')
    .replace(/<[^>]*DSML[^>]*calls\s*>[\s\S]*?<[^>]*\/[^>]*DSML[^>]*calls\s*>/gi, '')
    .replace(/<[^>]*DSML[^>]*invoke\s+name="[^"]+"[^>]*>[\s\S]*?<[^>]*\/[^>]*DSML[^>]*invoke\s*>/gi, '')
    .replace(/<[^>]*DSML[^>]*>/gi, '')
    .trim();
}

/**
 * DeepSeek Web emits native DSML tool calls such as:
 *   < | | DSML | | calls>< | | DSML | | invoke name="pwsh">...
 * Parse the first invoke into a normal tool call.
 */
export function parseDeepSeekToolCall(answer, tools) {
  const text = String(answer ?? '');
  const match = /<[^>]*DSML[^>]*invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<[^>]*\/[^>]*DSML[^>]*invoke\s*>/i
    .exec(text);
  if (match === null) return undefined;
  const name = match[1];
  if (!Array.isArray(tools) || !tools.some((tool) => tool && tool.name === name)) {
    return undefined;
  }
  return {
    name,
    arguments: parseDsmlParameters(match[2]),
    text: stripFenceWrappers(stripDsmlBlocks(text)),
  };
}

/** Accept both the adapter protocol and DeepSeek's native DSML format. */
export function parseBrowserToolCall(answer, tools) {
  return parseJsonToolCall(answer, tools) ?? parseDeepSeekToolCall(answer, tools);
}

/** Remove an unparseable tool block so it never leaks into the final answer. */
export function stripToolTags(answer) {
  const withoutJson = String(answer ?? '').replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  return stripFenceWrappers(stripDsmlBlocks(withoutJson));
}

export { MAX_PROMPT_CHARS };
