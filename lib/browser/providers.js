/**
 * Selector profile for the one browser provider: DeepSeek.
 *
 * Data only: when chat.deepseek.com changes its DOM, update this file.
 */

export const BROWSER_PROVIDERS = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    host: 'chat.deepseek.com',
    startUrl: 'https://chat.deepseek.com/',
    experimental: true,
    newChatSelectors: [
      '[aria-label*="New chat" i]',
      '[aria-label*="Новый чат" i]',
      '[class*="new-chat" i]',
    ],
    inputSelectors: [
      'textarea#chat-input',
      'textarea',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ],
    sendSelectors: [
      'div[role="button"][aria-label*="Send" i]',
      'button[aria-label*="Send" i]',
      'div[role="button"][aria-label*="Отправить" i]',
      'button[class*="send" i]',
      'button[type="submit"]',
    ],
    answerSelectors: [
      'div.ds-markdown',
      '[class*="ds-markdown"]',
      'div[class*="markdown"]',
    ],
    timeoutMs: 180000,
    stableMs: 2500,
  },
];

export function browserProviderById(id) {
  return BROWSER_PROVIDERS.find((provider) => provider.id === id);
}
