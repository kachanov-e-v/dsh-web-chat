/**
 * Host half of dsh-web-chat.
 *
 * One DeepSeek browser profile, one same-origin settings API, and one LLM
 * adapter exposed as the `DeepSeek (browser)` model.
 */

import { createState } from './lib/state.js';
import { createDeepSeekWebAdapter } from './lib/llm/deepseek-web.js';
import { loadProjectMemory } from './lib/memory.js';
import { loadSessions, saveSessions } from './lib/persist.js';
import { registerRoutes } from './lib/routes.js';
import { BROWSER_PROVIDERS } from './lib/browser/providers.js';
import { BrowserBridge } from './lib/browser/manager.js';

export const name = 'dsh-web-chat';

export const inject = ['webServer'];

export async function apply(ctx) {
  const state = createState();
  for (const id of await loadSessions()) state.sessions.set(id, true);
  const bridges = new Map();
  for (const provider of BROWSER_PROVIDERS) {
    state.browserProviders[provider.id] = {
      enabled: false,
      status: 'idle',
      lastError: null,
    };
    bridges.set(provider.id, new BrowserBridge({ provider }));
  }

  registerRoutes(ctx, { state, bridges, persist: saveSessions });

  ctx.inject(['llm'], (child) => {
    const adapter = createDeepSeekWebAdapter({
      bridge: bridges.get('deepseek'),
      state,
      loadMemory: (sessionId) => loadProjectMemory({ ctx, sessionId }),
      isRootSession: (sessionId) => {
        try {
          const agents = ctx.get('agents');
          if (agents === undefined || typeof agents.roots !== 'function') return true;
          const roots = agents.roots();
          if (!Array.isArray(roots) || roots.length === 0) return true;
          return roots.some((agent) => (agent?.session?.id ?? agent?.id) === sessionId);
        } catch {
          return true;
        }
      },
      onSessionEnabled: () => {
        saveSessions(state.sessions).catch(() => {
          /* Persistence is best-effort. */
        });
      },
    });
    child.effect(
      () => child.llm.registerAdapter(['deepseek-web'], adapter),
      'dsh-web-chat: deepseek browser model',
    );
  });

  ctx.effect(() => () => {
    for (const bridge of bridges.values()) {
      void bridge.close();
    }
  }, 'dsh-web-chat: browser lifetime');
}
