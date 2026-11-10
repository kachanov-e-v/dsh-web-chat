/**
 * DeepSeek consumer web chat as a first-class DSH model.
 */

import { createBrowserWebAdapter } from './browser-web.js';

export const DEEPSEEK_WEB_PROVIDER = 'deepseek-web';
export const DEEPSEEK_WEB_MODEL = 'deepseek-web';

export function createDeepSeekWebAdapter(options = {}) {
  const state = options.state;
  return createBrowserWebAdapter({
    ...options,
    provider: DEEPSEEK_WEB_PROVIDER,
    model: DEEPSEEK_WEB_MODEL,
    displayName: 'DeepSeek Web',
    modelName: 'DeepSeek (browser)',
    isSessionEnabled: state === undefined
      ? undefined
      : (sessionId) => {
        if (typeof sessionId !== 'string' || sessionId === '') return false;
        if (!(state.sessions instanceof Map)) return false;
        if (state.sessions.get(sessionId) === true) return true;
        if (typeof options.isRootSession === 'function' && options.isRootSession(sessionId) !== true) {
          return false;
        }
        // The adapter is only invoked for a session that already selected
        // deepseek-web. That selection is the per-chat consent; remember it so
        // the chip, panel, and persisted sessions.json catch up. Subagent
        // children are not auto-enabled: they must remain opt-in.
        state.sessions.set(sessionId, true);
        if (typeof options.onSessionEnabled === 'function') {
          try {
            options.onSessionEnabled(sessionId);
          } catch {
            /* Persistence is best-effort. */
          }
        }
        return true;
      },
  });
}
