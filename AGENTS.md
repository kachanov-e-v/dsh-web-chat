# AGENTS.md

Руководство для AI-агентов, работающих с `dsh-web-chat` (0.11.4).

## Проект

- Cordis-бандл DSH: `index.js` (Host, ESM, `apply(ctx)` + `inject`) и
  `client.js` (фабрика `window.__ModuleLoader__`, React из таблицы модулей).
- Без сборки, без TypeScript, без зависимостей. Только чистый JavaScript.
- Одна модель: **DeepSeek (browser)** (`deepseek-web`). Других провайдеров,
  прямого API, токенов и consult-инструментов нет.
- Включение **по сессии**: `state.sessions` + `sessions.json`; Host вызывает
  `sessionController.selectModel` для текущего чата. В других чатах адаптер
  возвращает `NOT_ENABLED`.
- UI: чип в `conversation.input.left` и плавающая панель в `shell.overlay`.
  Чип зелёный только во включённом чате; панель закрывается по клику вне окна.
- Браузерный слой (`lib/browser/*`) не читает и не экспортирует cookies: он
  запускает отдельный профиль Chrome/Edge, вводит текст через CDP и читает
  последний ответ из DOM. Селекторы живут только в `lib/browser/providers.js`.

## Ключевые файлы

- `lib/llm/prompt.js` — полный промпт, continuation, компактификация, парсеры.
- `lib/llm/browser-web.js` — LLM-адаптер, сессии, стриминг, cooldown, новый чат.
- `lib/llm/deepseek-web.js` — DeepSeek-обёртка.
- `lib/memory.js` — `PROJECT_MEMORY.md`.
- `lib/persist.js` — `sessions.json`.
- `lib/routes.js` — same-origin API.
- `lib/browser/dom.js` — CDP-выражения, `CONTEXT_LIMIT`, snapshot ответа,
  удаление чатов через меню/диалог.
- `lib/browser/manager.js` — `waitForAnswerStreaming`, `deleteAllChats`,
  деградация DSML, опрос DOM и onDelta.
- Хранилище профиля и `sessions.json` остаётся в `$DSH_HOME/dsh-chat-model` для
  совместимости со старым именем; не переименовывать без миграции входа.

## Соглашения

- Host-половина декларирует `inject` для обязательных сервисов (`webServer`);
  `llm`, `sessionController`, `agentDefaultModel`, `agents` и
  `workingDirectory` берутся через `ctx.get(...)`/`ctx.inject` с проверкой.
- Client-половина возвращает `{ inject, apply }` и регистрирует слоты через
  `ctx.slots.inject` + `ctx.slots.register`.
- Стилизация только токенами `--dsw-alias-*`; буквальные цвета — только в
  `icon.svg`.
- Строки UI — через собственные словари `en`/`ru`/`zh` в `client.js`; метаданные
  плагина — в `locale/*.json`, все три локали должны иметь одинаковые ключи.
- Тела запросов ограничены и валидируются на стороне Host; маршруты same-origin,
  редиректы запрещены.
- В `PROJECT_MEMORY.md` и `sessions.json` не должно быть секретов.

## Работа с кодом

- Правки — напрямую в `client.js` / `index.js` / `lib/*.js`.
- Проверка синтаксиса: `node --check <файл>`.
- Тесты: `node test/<name>.test.mjs` (не `node --test`: в этом окружении spawn
  дочерних процессов может быть запрещён).
- Проверка JSON: разобрать `package.json` и `locale/*.json`.
- SVG: должен разбираться как XML.
- Проверка состава пакета: `npm pack --dry-run --json`.
- После правок Host-половины — переустановить бандл через `plugin_manager`
  `install_bundle`; для клиентской половины — обновить страницу.

## Не делать

- Не добавлять JSX/TypeScript, не импортировать пакеты `@deepseek-ai/dsh-client-*`
  из клиентской половины.
- Не читать cookies браузерного профиля и не передавать их в Node/сеть; профиль
  остаётся собственностью браузера.
- Не писать `cordis.patch.yml` профиля вручную.
- Не отключать проверки Origin/размера тела.
- Не коммитить секреты, ad-hoc скрипты и артефакты.

## Релиз

1. Поднять `version` в `package.json`, `README.md`, `CHANGELOG.md`.
2. Прогнать проверки из раздела «Работа с кодом».
3. Переустановить бандл и проверить слоты через `cordis_inspect_query`
   (`Slots.listSubTree`).
4. Проверить живое подключение: включить плагин, открыть DeepSeek, войти.
5. Для GitHub-релиза: `git tag vX.Y.Z`, `git push origin main --tags`,
   `gh release create vX.Y.Z`. Установка по умолчанию идёт с `main`:
   `github:kachanov-e-v/dsh-web-chat`; закреплённая версия —
   `github:kachanov-e-v/dsh-web-chat#vX.Y.Z`.
