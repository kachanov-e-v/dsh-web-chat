/**
 * Client half of dsh-chat-model.
 *
 * One chip in the composer row and one floating DeepSeek Browser panel. The
 * chip turns green when the plugin is enabled; enabling also selects
 * `DeepSeek (browser)` as the default model on the Host.
 */

window.__ModuleLoader__.load({
  id: 'dsh-chat-model',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const COPY = {
      en: {
        label: 'DeepSeek Browser',
        'panel.title': 'DeepSeek Browser',
        'panel.subtitle': 'Use your logged-in chat.deepseek.com as the DSH model.',
        enable: 'Enable',
        disable: 'Disable',
        enabled: 'DeepSeek (browser) is enabled.',
        selected: 'DeepSeek (browser) is selected for this chat.',
        noSession: 'Open the panel from a chat first.',
        modelNotSelected: 'The model was not switched; pick DeepSeek (browser) in the model selector.',
        modelSelectionUnavailable: 'Session model selection is unavailable; pick DeepSeek (browser) manually.',
        disabled: 'DeepSeek (browser) is disabled.',
        status: 'Status',
        idle: 'Not opened',
        ready: 'Ready',
        login: 'Login required',
        error: 'Error',
        open: 'Open browser',
        check: 'Check login',
        test: 'Test',
        newChat: 'New chat',
        close: 'Close',
        busy: 'Working…',
        loginRequired: 'Sign in in the browser window, then check again.',
        loginOk: 'Logged in.',
        testOk: 'Answered: {answer}',
        newChatOk: 'A new DeepSeek chat is ready.',
        closeOk: 'Browser closed.',
        modelRegistered: 'DeepSeek (browser) model is registered.',
        modelMissing: 'Model is not registered — restart DSH.',
        hint: 'The browser profile keeps the login. Enable the plugin to select the model automatically.',
        memory: 'Project memory: PROJECT_MEMORY.md is created and loaded into every request; the model updates it. Do not store secrets there.',
        tos: 'Automating the consumer web chat may violate the provider’s terms of service.',
        openSite: 'Open chat.deepseek.com',
        'panel.close': 'Close',
      },
      ru: {
        label: 'DeepSeek Browser',
        'panel.title': 'DeepSeek Browser',
        'panel.subtitle': 'Использовать ваш вход в chat.deepseek.com как модель DSH.',
        enable: 'Включить',
        disable: 'Выключить',
        enabled: 'DeepSeek (browser) включён.',
        selected: 'DeepSeek (browser) выбран для этого чата.',
        noSession: 'Сначала откройте панель из чата.',
        modelNotSelected: 'Модель не переключилась; выберите DeepSeek (browser) в селекторе модели.',
        modelSelectionUnavailable: 'Выбор модели для сессии недоступен; выберите DeepSeek (browser) вручную.',
        disabled: 'DeepSeek (browser) выключен.',
        status: 'Статус',
        idle: 'Не открыт',
        ready: 'Готов',
        login: 'Нужен вход',
        error: 'Ошибка',
        open: 'Открыть браузер',
        check: 'Проверить вход',
        test: 'Тест',
        newChat: 'Новый чат',
        close: 'Закрыть',
        busy: 'Работаю…',
        loginRequired: 'Войдите в браузере, затем проверьте снова.',
        loginOk: 'Вход выполнен.',
        testOk: 'Ответ: {answer}',
        newChatOk: 'Новый чат DeepSeek готов.',
        closeOk: 'Браузер закрыт.',
        modelRegistered: 'Модель DeepSeek (browser) зарегистрирована.',
        modelMissing: 'Модель не зарегистрирована — перезапустите DSH.',
        hint: 'Профиль браузера сохраняет вход. Включите плагин, чтобы модель выбралась автоматически.',
        memory: 'Память проекта: PROJECT_MEMORY.md создаётся и подгружается в каждый запрос; модель его обновляет. Не храните там секреты.',
        tos: 'Автоматизация потребительского веб-чата может нарушать условия использования.',
        openSite: 'Открыть chat.deepseek.com',
        'panel.close': 'Закрыть',
      },
      zh: {
        label: 'DeepSeek Browser',
        'panel.title': 'DeepSeek Browser',
        'panel.subtitle': '将已登录的 chat.deepseek.com 用作 DSH 模型。',
        enable: '启用',
        disable: '停用',
        enabled: 'DeepSeek (browser) 已启用。',
        selected: 'DeepSeek (browser) 已为此聊天选择。',
        noSession: '请先从聊天中打开面板。',
        modelNotSelected: '模型未切换；请在模型选择器中选择 DeepSeek (browser)。',
        modelSelectionUnavailable: '会话模型选择不可用；请手动选择 DeepSeek (browser)。',
        disabled: 'DeepSeek (browser) 已停用。',
        status: '状态',
        idle: '未打开',
        ready: '就绪',
        login: '需要登录',
        error: '错误',
        open: '打开浏览器',
        check: '检查登录',
        test: '测试',
        newChat: '新建聊天',
        close: '关闭',
        busy: '处理中…',
        loginRequired: '请在浏览器窗口中登录，然后重新检查。',
        loginOk: '已登录。',
        testOk: '回答：{answer}',
        newChatOk: '新的 DeepSeek 聊天已准备好。',
        closeOk: '浏览器已关闭。',
        modelRegistered: 'DeepSeek (browser) 模型已注册。',
        modelMissing: '模型未注册 — 请重启 DSH。',
        hint: '浏览器资料会保留登录。启用插件后会自动选择模型。',
        memory: '项目记忆：PROJECT_MEMORY.md 会自动创建并加载到每次请求中，模型会更新它。不要在其中保存密钥。',
        tos: '自动化消费者网页聊天可能违反服务商的使用条款。',
        openSite: '打开 chat.deepseek.com',
        'panel.close': '关闭',
      },
    };

    const STYLE = [
      '.dcm-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.dcm-chip:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dcm-chip[data-on="true"]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.dcm-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary);flex:none}',
      '.dcm-dot[data-on="true"]{background:var(--dsw-alias-state-success-primary)}',
      '.dcm-panel{position:fixed;z-index:1100;width:min(380px,calc(100vw - 32px));padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px}',
      '.dcm-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}',
      '.dcm-title{font-weight:600;font-size:13px}',
      '.dcm-close{margin-left:auto;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:16px;line-height:1}',
      '.dcm-subtitle{color:var(--dsw-alias-label-secondary);margin:0 0 10px}',
      '.dcm-status{display:flex;align-items:center;gap:6px;margin:8px 0;color:var(--dsw-alias-label-secondary)}',
      '.dcm-actions{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}',
      '.dcm-btn{height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.dcm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.dcm-btn:disabled{opacity:.5;cursor:default}',
      '.dcm-btn[data-primary="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dcm-btn[data-on="true"]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.dcm-notice{margin:8px 0 0;padding:6px 8px;border-radius:6px;font-size:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dcm-notice[data-tone="ok"]{color:var(--dsw-alias-state-success-primary)}',
      '.dcm-notice[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dcm-notice[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}',
      '.dcm-hint{color:var(--dsw-alias-label-secondary);font-size:11px;margin:6px 0 0}',
      '.dcm-link{color:var(--dsw-alias-brand-primary);text-decoration:none}',
      '@media (max-width:520px){.dcm-label{display:none}}',
    ].join('\n');

    function format(template, values = {}) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        values[key] === undefined ? match : String(values[key])
      ));
    }

    function apiPath(path) {
      const relative = String(path).replace(/^\/+/, '');
      if (typeof document === 'undefined') return `/${relative}`;
      return new URL(relative, document.baseURI).pathname;
    }

    async function request(path, method = 'GET', body) {
      const response = await fetch(apiPath(path), {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload === null || payload.ok !== true) {
        const error = new Error((payload && (payload.error || payload.code)) || `HTTP ${response.status}`);
        error.code = payload && payload.code;
        throw error;
      }
      return payload;
    }

    function createStore() {
      let snapshot = {
        open: false,
        sessionId: null,
        anchor: null,
        state: null,
        loading: true,
        error: null,
        notice: null,
      };
      const listeners = new Set();
      return {
        get: () => snapshot,
        set(patch) {
          snapshot = { ...snapshot, ...patch };
          for (const listener of listeners) listener();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    }

    function useStore(store) {
      const [snapshot, setSnapshot] = React.useState(store.get());
      React.useEffect(() => store.subscribe(() => setSnapshot(store.get())), [store]);
      return snapshot;
    }

    function BridgeIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16', width: 14, height: 14, className: 'dcm-icon',
          'aria-hidden': true, fill: 'none', xmlns: 'http://www.w3.org/2000/svg',
        },
        h('path', {
          d: 'M2.1 3.1h4.6a1.2 1.2 0 0 1 1.2 1.2v3.4a1.2 1.2 0 0 1-1.2 1.2H4.3l-1.7 1.5V8.9h-.5a.8.8 0 0 1-.8-.8V3.9a.8.8 0 0 1 .8-.8z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M9.3 7.1h3.8a.8.8 0 0 1 .8.8v4.2a.8.8 0 0 1-.8.8h-.5v1.5L10.9 12.9H9.3a1.2 1.2 0 0 1-1.2-1.2V8.3a1.2 1.2 0 0 1 1.2-1.2z',
          fill: 'currentColor', opacity: 0.75,
        }),
      );
    }

    function apply(ctx) {
      const store = createStore();

      if (typeof document !== 'undefined'
        && typeof document.getElementById === 'function'
        && typeof document.createElement === 'function'
        && document.getElementById('dcm-style') === null) {
        const style = document.createElement('style');
        style.id = 'dcm-style';
        style.textContent = STYLE;
        document.head.appendChild(style);
      }

      function currentLanguage() {
        let active = 'en';
        try {
          active = String(ctx.locale.getLocale().active || 'en').toLowerCase();
        } catch {
          /* English fallback. */
        }
        if (active.indexOf('ru') === 0) return 'ru';
        if (active.indexOf('zh') === 0) return 'zh';
        return 'en';
      }

      function useLanguage() {
        const [language, setLanguage] = React.useState(currentLanguage);
        React.useEffect(() => {
          const update = () => setLanguage(currentLanguage());
          update();
          let dispose;
          try {
            dispose = ctx.locale.subscribe(update);
          } catch {
            dispose = undefined;
          }
          return typeof dispose === 'function' ? dispose : undefined;
        }, []);
        return language;
      }

      async function refresh() {
        try {
          const payload = await request('/dsh-chat-model/state');
          store.set({ state: payload, loading: false, error: null });
        } catch (error) {
          store.set({
            loading: false,
            error: error instanceof Error ? error.message : 'Request failed',
          });
        }
      }

      function Chip(props) {
        const snapshot = useStore(store);
        const copy = COPY[useLanguage()];
        const sessionId = props?.sessionId ?? null;
        const enabled = sessionId !== null && snapshot.state?.sessions?.[sessionId] === true;

        React.useEffect(() => {
          void refresh();
        }, []);

        const openPanel = (event) => {
          const rect = event?.currentTarget?.getBoundingClientRect?.();
          store.set({
            open: !snapshot.open,
            sessionId,
            anchor: rect
              ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
              : snapshot.anchor,
          });
          if (!snapshot.open) void refresh();
        };

        return h(
          'button',
          {
            type: 'button',
            className: 'dcm-chip',
            'data-on': enabled ? 'true' : 'false',
            title: copy.label,
            'aria-pressed': enabled,
            'aria-expanded': snapshot.open ? 'true' : 'false',
            onClick: openPanel,
          },
          h(BridgeIcon),
          h('span', { className: 'dcm-label' }, copy.label),
          h('span', { className: 'dcm-dot', 'data-on': enabled ? 'true' : 'false', 'aria-hidden': true }),
        );
      }

      function Panel() {
        const snapshot = useStore(store);
        const copy = COPY[useLanguage()];
        const [busy, setBusy] = React.useState(null);
        const state = snapshot.state;
        const sessionId = snapshot.sessionId;
        const enabled = typeof sessionId === 'string' && state?.sessions?.[sessionId] === true;
        const browser = state?.browserProviders?.deepseek ?? {
          enabled: false, status: 'idle', lastError: null,
        };
        const modelRegistered = Array.isArray(state?.llmProviders)
          && state.llmProviders.some((entry) => entry && entry.id === 'deepseek-web');
        const status = browser.status === 'ready'
          ? copy.ready
          : browser.status === 'login'
            ? copy.login
            : browser.status === 'error'
              ? copy.error
              : copy.idle;

        const panelStyle = (() => {
          if (typeof window === 'undefined') return undefined;
          const anchor = snapshot.anchor;
          if (!anchor) return { position: 'fixed', right: 16, bottom: 72 };
          const width = Math.min(380, Math.max(240, window.innerWidth - 32));
          const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
          if (anchor.top > 360) {
            return {
              position: 'fixed',
              left,
              bottom: Math.max(8, window.innerHeight - anchor.top + 8),
            };
          }
          return { position: 'fixed', left, top: Math.max(8, anchor.bottom + 8) };
        })();

        React.useEffect(() => {
          if (!snapshot.open) return undefined;
          void refresh();
          const onKeyDown = (event) => {
            if (event.key === 'Escape') store.set({ open: false });
          };
          const onPointerDown = (event) => {
            const target = event.target;
            if (typeof target?.closest === 'function'
              && (target.closest('.dcm-panel') !== null || target.closest('.dcm-chip') !== null)) {
              return;
            }
            store.set({ open: false });
          };
          window.addEventListener('keydown', onKeyDown);
          window.addEventListener('pointerdown', onPointerDown, true);
          return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('pointerdown', onPointerDown, true);
          };
        }, [snapshot.open]);

        const run = async (name, work) => {
          setBusy(name);
          try {
            await work();
          } catch (error) {
            store.set({
              notice: {
                tone: 'error',
                text: error instanceof Error ? error.message : 'Request failed',
              },
            });
          } finally {
            setBusy(null);
          }
        };

        const toggle = () => run('toggle', async () => {
          if (typeof sessionId !== 'string') {
            throw new Error(copy.noSession);
          }
          const payload = await request('/dsh-chat-model/toggle', 'POST', {
            enabled: !enabled,
            sessionId,
          });
          await refresh();
          store.set({
            notice: {
              tone: 'ok',
              text: payload.selected
                ? enabled
                  ? copy.disabled
                  : copy.selected
                : enabled
                  ? copy.disabled
                  : `${copy.enabled} ${copy.modelNotSelected}`,
            },
          });
        });

        const browserAction = (name, path, okText) => run(name, async () => {
          const payload = await request(`/dsh-chat-model/browser/deepseek/${path}`, 'POST');
          await refresh();
          let text = okText;
          if (path === 'test') text = format(copy.testOk, { answer: String(payload.answer ?? '').slice(0, 200) });
          else if (path === 'open') text = payload.ready === true ? copy.loginOk : copy.loginRequired;
          else text = copy[okText];
          store.set({ notice: { tone: 'ok', text } });
        });

        if (!snapshot.open) return null;

        return h(
          'div',
          { className: 'dcm-panel', style: panelStyle, role: 'dialog', 'aria-label': copy['panel.title'] },
          h(
            'div',
            { className: 'dcm-head' },
            h('span', { className: 'dcm-dot', 'data-on': enabled ? 'true' : 'false', 'aria-hidden': true }),
            h('span', { className: 'dcm-title' }, copy['panel.title']),
            h(
              'button',
              { type: 'button', className: 'dcm-close', title: copy['panel.close'], onClick: () => store.set({ open: false }) },
              '×',
            ),
          ),
          h('p', { className: 'dcm-subtitle' }, copy['panel.subtitle']),
          h(
            'div',
            { className: 'dcm-status' },
            h('span', null, `${copy.status}: ${status}`),
            browser.lastError ? h('span', null, ` — ${browser.lastError}`) : null,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dcm-btn',
              'data-primary': enabled ? 'false' : 'true',
              'data-on': enabled ? 'true' : 'false',
              disabled: busy !== null,
              onClick: toggle,
            },
            busy === 'toggle' ? copy.busy : enabled ? copy.disable : copy.enable,
          ),
          h(
            'div',
            { className: 'dcm-actions' },
            h('button', { type: 'button', className: 'dcm-btn', disabled: busy !== null, onClick: () => browserAction('open', 'open', '') }, busy === 'open' ? copy.busy : copy.open),
            h('button', { type: 'button', className: 'dcm-btn', disabled: busy !== null, onClick: () => browserAction('check', 'check', 'loginOk') }, busy === 'check' ? copy.busy : copy.check),
            h('button', { type: 'button', className: 'dcm-btn', disabled: busy !== null, onClick: () => browserAction('test', 'test', '') }, busy === 'test' ? copy.busy : copy.test),
            h('button', { type: 'button', className: 'dcm-btn', disabled: busy !== null, onClick: () => browserAction('new-chat', 'new-chat', 'newChatOk') }, busy === 'new-chat' ? copy.busy : copy.newChat),
            h('button', { type: 'button', className: 'dcm-btn', disabled: busy !== null, onClick: () => browserAction('close', 'close', 'closeOk') }, busy === 'close' ? copy.busy : copy.close),
          ),
          h('p', { className: 'dcm-hint' }, modelRegistered ? copy.modelRegistered : copy.modelMissing),
          modelRegistered && state?.canSelectModel === false
            ? h('p', { className: 'dcm-hint' }, copy.modelSelectionUnavailable)
            : null,
          snapshot.notice
            ? h('p', { className: 'dcm-notice', 'data-tone': snapshot.notice.tone, role: 'status' }, snapshot.notice.text)
            : null,
          snapshot.error
            ? h('p', { className: 'dcm-notice', 'data-tone': 'error', role: 'status' }, snapshot.error)
            : null,
          h('p', { className: 'dcm-hint' }, copy.hint),
          h('p', { className: 'dcm-hint' }, copy.memory),
          h('p', { className: 'dcm-hint' }, copy.tos),
          h(
            'a',
            { className: 'dcm-link', href: 'https://chat.deepseek.com/', target: '_blank', rel: 'noopener noreferrer' },
            copy.openSite,
          ),
        );
      }

      ctx.slots.inject('conversation.input.left', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.left',
            id: 'chat-model',
            order: 110,
            label: () => COPY[currentLanguage()].label,
          },
          Chip,
        ),
      );

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'chat-model-panel',
            order: 500,
            label: () => COPY[currentLanguage()]['panel.title'],
          },
          Panel,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
