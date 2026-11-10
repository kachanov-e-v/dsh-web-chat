/**
 * Shared browser-chat LLM adapter.
 *
 * The consumer web chat has no native function calling, so the adapter renders
 * the harness request into a single prompt, drives the logged-in browser page,
 * and translates the answer into DSH stream chunks. A `<tool_call>` or a
 * native DeepSeek DSML block becomes a real tool-call chunk, so the harness
 * executes normal tools and the web model can build a project turn by turn.
 */

import { buildBrowserAgentPrompt, buildContinuationPrompt, parseBrowserToolCall, stripToolTags } from './prompt.js';

function failureFinish(message, code) {
  return {
    type: 'finish',
    reason: {
      kind: 'error',
      failure: { message: String(message), code: String(code) },
    },
  };
}

const AUTO_NEW_CHAT_COOLDOWN_MS = 10 * 60 * 1000;
const CONTEXT_NEW_CHAT_COOLDOWN_MS = 60 * 1000;

function isRecoverable(error) {
  return ['EMPTY', 'NO_ANSWER', 'CONTEXT_LIMIT', 'DEGENERATED'].includes(String(error?.code ?? ''));
}

function textStream(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ];
}

/**
 * A browser model is already a web chat. Keep only normal DSH tools in its
 * prompt; the plugin itself exposes no consult tools.
 */
function agentTools(tools) {
  return Array.isArray(tools) ? tools : [];
}

export function createBrowserWebAdapter(options = {}) {
  const bridge = options.bridge;
  const provider = options.provider ?? 'deepseek-web';
  const model = options.model ?? provider;
  const displayName = options.displayName ?? 'DeepSeek Web';
  const modelName = options.modelName ?? 'DeepSeek (browser)';
  const isSessionEnabled = options.isSessionEnabled;
  const loadMemory = options.loadMemory;
  const rateLimitDelayMs = options.rateLimitDelayMs ?? 20000;
  let lastAutoNewChatAt = 0;
  let lastContextNewChatAt = 0;
  const sendState = new Map();

  const adapter = {
    providerInfo() {
      return { id: provider, name: displayName };
    },

    providerRetryPolicy() {
      return undefined;
    },

    imageRequestPricing() {
      return undefined;
    },

    imageRequestTarget() {
      throw new Error(`${displayName} does not support image inputs`);
    },

    async listModels() {
      return [{
        provider,
        id: model,
        name: modelName,
        inputModalities: ['text'],
      }];
    },

    async resolveModel(requestedProvider, requestedModel) {
      return {
        provider: requestedProvider ?? provider,
        id: requestedModel ?? model,
        name: modelName,
        context: { contextWindow: 128000 },
        defaultMaxTokens: 8192,
        inputModalities: ['text'],
      };
    },

    async prepareCall(requestedProvider, requestedModel) {
      const resolved = await adapter.resolveModel(requestedProvider, requestedModel);
      return {
        model: resolved,
        stream: (requestOptions) => adapter.stream(requestOptions),
      };
    },

    async *stream(request) {
      if (bridge === undefined) {
        yield failureFinish(`The ${displayName} browser bridge is not available`, 'BRIDGE_MISSING');
        return;
      }
      if (typeof isSessionEnabled === 'function' && isSessionEnabled(request?.sessionId) !== true) {
        yield failureFinish(
          `${displayName} is not enabled for this chat. Open the plugin panel in this chat and enable it.`,
          'NOT_ENABLED',
        );
        return;
      }
      const signal = request?.signal;
      const tools = agentTools(request?.tools);
      const messages = Array.isArray(request?.messages) ? request.messages : [];
      const sessionKey = String(request?.sessionId ?? '');
      let memory = '';
      if (typeof loadMemory === 'function') {
        try {
          memory = String(await loadMemory(request?.sessionId) ?? '');
        } catch {
          memory = '';
        }
      }
      const fullPrompt = buildBrowserAgentPrompt({ ...request, tools, memory });
      let chatKey;
      if (typeof bridge.currentChatKey === 'function') {
        try {
          chatKey = await bridge.currentChatKey();
        } catch {
          chatKey = undefined;
        }
      }
      const previous = sendState.get(sessionKey);
      let prompt = fullPrompt;
      if (
        previous !== undefined
        && chatKey !== undefined
        && previous.chatKey === chatKey
        && messages.length >= previous.count
      ) {
        prompt = buildContinuationPrompt({ messages: messages.slice(previous.count), tools });
      }

      const remember = async (fallbackKey) => {
        let finalKey = fallbackKey;
        if (typeof bridge.currentChatKey === 'function') {
          try {
            finalKey = await bridge.currentChatKey();
          } catch {
            /* Keep the pre-request key. */
          }
        }
        sendState.set(sessionKey, { chatKey: finalKey, count: messages.length });
      };

      const startNewChat = typeof bridge.startNewChat === 'function'
        ? async () => {
          try {
            await bridge.startNewChat();
          } catch {
            /* The caller still retries once. */
          }
          try {
            return typeof bridge.currentChatKey === 'function'
              ? await bridge.currentChatKey()
              : undefined;
          } catch {
            return undefined;
          }
        }
        : undefined;

      const ask = (text, onDelta) => bridge.ask(text, { signal, onDelta });
      const state = {
        blockOpen: false,
        blockIndex: 0,
        nextIndex: 0,
        emitted: '',
        suppress: false,
        result: undefined,
        error: undefined,
      };

      const streamAnswer = async function* (text) {
        const queue = [];
        let wake;
        let settled = false;
        let result;
        let error;
        const push = (full) => {
          queue.push(String(full ?? ''));
          if (wake !== undefined) {
            const resume = wake;
            wake = undefined;
            resume();
          }
        };
        const promise = ask(text, push);
        promise.then(
          (value) => {
            result = value;
            settled = true;
            if (wake !== undefined) {
              const resume = wake;
              wake = undefined;
              resume();
            }
          },
          (reason) => {
            error = reason;
            settled = true;
            if (wake !== undefined) {
              const resume = wake;
              wake = undefined;
              resume();
            }
          },
        );
        while (!settled || queue.length > 0) {
          if (queue.length === 0) {
            await new Promise((resolve) => {
              wake = resolve;
            });
            continue;
          }
          const full = queue.shift();
          if (state.suppress) continue;
          if (/DSML|<tool_call>|```tool/i.test(full)) {
            state.suppress = true;
            continue;
          }
          if (!full.startsWith(state.emitted)) continue;
          const delta = full.slice(state.emitted.length);
          if (delta === '') continue;
          if (!state.blockOpen) {
            state.blockOpen = true;
            state.blockIndex = state.nextIndex;
            state.nextIndex += 1;
            yield { type: 'block-start', index: state.blockIndex, blockType: 'text' };
          }
          state.emitted = full;
          yield { type: 'text-delta', index: state.blockIndex, text: delta };
        }
        state.result = result;
        state.error = error;
      };

      yield* streamAnswer(prompt);
      let lastError = state.error;
      let rateLimitRetried = false;
      if (state.result === undefined && lastError !== undefined) {
        const contextLimit = lastError?.code === 'CONTEXT_LIMIT';
        const canContextNewChat = contextLimit
          && startNewChat !== undefined
          && Date.now() - lastContextNewChatAt >= CONTEXT_NEW_CHAT_COOLDOWN_MS;
        const canGeneralNewChat = !contextLimit
          && startNewChat !== undefined
          && Date.now() - lastAutoNewChatAt >= AUTO_NEW_CHAT_COOLDOWN_MS;
        if (!signal?.aborted && isRecoverable(lastError) && (canContextNewChat || canGeneralNewChat)) {
          if (contextLimit) lastContextNewChatAt = Date.now();
          else lastAutoNewChatAt = Date.now();
          if (state.blockOpen) {
            yield {
              type: 'block-end',
              index: state.blockIndex,
              block: { type: 'text', text: state.emitted },
            };
            state.blockOpen = false;
            state.emitted = '';
          }
          const newKey = await startNewChat();
          state.suppress = false;
          state.result = undefined;
          state.error = undefined;
          yield* streamAnswer(fullPrompt);
          lastError = state.error;
          if (state.result !== undefined) await remember(newKey);
        }
      }

      if (state.result === undefined && lastError?.code === 'RATE_LIMIT' && !rateLimitRetried) {
        rateLimitRetried = true;
        if (state.blockOpen) {
          yield {
            type: 'block-end',
            index: state.blockIndex,
            block: { type: 'text', text: state.emitted },
          };
          state.blockOpen = false;
          state.emitted = '';
        }
        await new Promise((resolve) => { setTimeout(resolve, rateLimitDelayMs); });
        state.suppress = false;
        state.result = undefined;
        state.error = undefined;
        yield* streamAnswer(prompt);
        lastError = state.error;
      }

      if (state.result === undefined) {
        if (state.blockOpen) {
          yield {
            type: 'block-end',
            index: state.blockIndex,
            block: { type: 'text', text: state.emitted },
          };
          state.blockOpen = false;
        }
        if (signal?.aborted || lastError?.code === 'ABORTED') {
          yield failureFinish(`${displayName} request was cancelled`, 'ABORTED');
          return;
        }
        yield failureFinish(
          lastError instanceof Error ? lastError.message : `${displayName} request failed`,
          lastError?.code || 'BROWSER_WEB_ERROR',
        );
        return;
      }

      await remember(chatKey);
      const answer = String(state.result?.answer ?? '');
      const toolCall = parseBrowserToolCall(answer, tools);
      const text = stripToolTags(answer).trim();

      if (toolCall !== undefined) {
        if (state.blockOpen) {
          if (toolCall.text !== '' && toolCall.text.startsWith(state.emitted)) {
            const rest = toolCall.text.slice(state.emitted.length);
            if (rest !== '') {
              state.emitted = toolCall.text;
              yield { type: 'text-delta', index: state.blockIndex, text: rest };
            }
          }
          yield {
            type: 'block-end',
            index: state.blockIndex,
            block: { type: 'text', text: state.emitted },
          };
          state.blockOpen = false;
        } else if (toolCall.text !== '') {
          const index = state.nextIndex;
          state.nextIndex += 1;
          yield { type: 'block-start', index, blockType: 'text' };
          yield { type: 'text-delta', index, text: toolCall.text };
          yield { type: 'block-end', index, block: { type: 'text', text: toolCall.text } };
        }
        const index = state.nextIndex;
        state.nextIndex += 1;
        const id = `browser_${provider}_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
        const args = JSON.stringify(toolCall.arguments);
        yield { type: 'block-start', index, blockType: 'tool-call' };
        yield {
          type: 'tool-call-delta',
          index,
          id,
          name: toolCall.name,
          argumentsDelta: args,
        };
        yield {
          type: 'block-end',
          index,
          block: { type: 'tool-call', id, name: toolCall.name, arguments: args },
        };
        yield { type: 'finish', reason: { kind: 'tool-calls' } };
        return;
      }

      if (text === '') {
        if (state.blockOpen) {
          yield {
            type: 'block-end',
            index: state.blockIndex,
            block: { type: 'text', text: state.emitted },
          };
          state.blockOpen = false;
        }
        yield failureFinish(`${displayName} returned an empty answer`, 'EMPTY');
        return;
      }
      if (state.blockOpen) {
        if (text.startsWith(state.emitted)) {
          const rest = text.slice(state.emitted.length);
          if (rest !== '') {
            state.emitted = text;
            yield { type: 'text-delta', index: state.blockIndex, text: rest };
          }
        }
        yield {
          type: 'block-end',
          index: state.blockIndex,
          block: { type: 'text', text: state.emitted },
        };
        state.blockOpen = false;
        yield { type: 'finish', reason: { kind: 'stop' } };
        return;
      }
      for (const chunk of textStream(text)) yield chunk;
    },
  };

  return adapter;
}
