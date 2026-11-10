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
      : (sessionId) => state.sessions instanceof Map && state.sessions.get(sessionId) === true,
  });
}
