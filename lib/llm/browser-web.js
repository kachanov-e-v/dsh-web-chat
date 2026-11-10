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
  return ['EMPTY', 'NO_ANSWER', 'CONTEXT_LIMIT'].includes(String(error?.code ?? ''));
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

      const ask = (text) => bridge.ask(text, { signal });
      let result;
      let lastError;
      try {
        result = await ask(prompt);
      } catch (error) {
        lastError = error;
        const contextLimit = error?.code === 'CONTEXT_LIMIT';
        const canContextNewChat = contextLimit
          && startNewChat !== undefined
          && Date.now() - lastContextNewChatAt >= CONTEXT_NEW_CHAT_COOLDOWN_MS;
        const canGeneralNewChat = !contextLimit
          && startNewChat !== undefined
          && Date.now() - lastAutoNewChatAt >= AUTO_NEW_CHAT_COOLDOWN_MS;
        if (!signal?.aborted && isRecoverable(error) && (canContextNewChat || canGeneralNewChat)) {
          if (contextLimit) lastContextNewChatAt = Date.now();
          else lastAutoNewChatAt = Date.now();
          const newKey = await startNewChat();
          try {
            result = await ask(fullPrompt);
            await remember(newKey);
          } catch (retryError) {
            lastError = retryError;
          }
        }
      }

      if (result !== undefined) await remember(chatKey);

      if (result === undefined) {
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

      let answer = String(result?.answer ?? '');
      let toolCall = parseBrowserToolCall(answer, tools);
      let text = stripToolTags(answer).trim();

      if (toolCall !== undefined) {
        let index = 0;
        if (toolCall.text !== '') {
          yield { type: 'block-start', index, blockType: 'text' };
          yield { type: 'text-delta', index, text: toolCall.text };
          yield { type: 'block-end', index, block: { type: 'text', text: toolCall.text } };
          index = 1;
        }
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
        yield failureFinish(`${displayName} returned an empty answer`, 'EMPTY');
        return;
      }
      for (const chunk of textStream(text)) yield chunk;
    },
  };

  return adapter;
}
