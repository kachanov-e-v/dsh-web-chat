# Changelog

## 0.11.7

- A fenced `tool` block is rendered by DeepSeek as a widget: the ``` markers
  and the inner `<tool_call>` tags never reach `innerText`, while the code-block
  banner (`tool`, `Copy`, `Download`) does. The turn then ended as plain text —
  the model announced “Начну со сканирования проекта”, the JSON was shown to the
  user, and nothing ran. A bare `{"name":…,"arguments":{…}}` that ends the
  answer is now parsed as a real tool call, the banner is hidden while the
  answer is read, and a bare payload stops text streaming.
- The banner is only hidden when it actually carries a copy/download button, so
  ordinary answer text is never dropped.

## 0.11.6

- Bare closing tags no longer leak into tool arguments. On the live page every
  DSML tag is closed as `</｜｜DSML｜｜>` (no `parameter`/`invoke` keyword), and
  0.11.5 kept that text in the value: `read` got `app.js</｜｜DSML｜｜>`, `grep`
  failed on the same path, and `pwsh` failed with
  `spawn …DeepSeek Harness.exe ENOENT` because `workdir` ended with the tag.
  Any closing DSML tag now terminates the current field.
- KaTeX restoration preserves line breaks. The TeX source is read verbatim and
  the formula is switched to `white-space: pre-wrap` while `innerText` runs,
  so a multi-line PowerShell script keeps its `$`, hyphens and newlines instead
  of being glued into one line.
- A half-streamed `<｜｜` opener is withheld until it is clear whether it is a
  tool call, so a partial tag no longer appears as a text block.
- An unclosed `calls` wrapper is dropped from the answer text.

## 0.11.5

- A broken DSML envelope no longer ends the turn as `EMPTY`. DeepSeek often
  drops the closing `</…DSML… invoke>` tag and fuses the closing `parameter`
  tag with the next opening one
  (`</… parameter name="timeoutMs" …>30000</… parameter>`); the argument reader
  is now a small tag state machine that recovers every field, and an unclosed
  `invoke` is read up to the closing `calls` wrapper.
- Tool arguments that DeepSeek renders as math are read from the TeX source.
  `$c = Get-Content -Raw …$` used to arrive as `𝑐 = 𝐺𝑒𝑡−𝐶𝑜𝑛𝑡𝑒𝑛𝑡…` (KaTeX
  glyphs, minus sign, prime, one character per line); the answer snapshot now
  swaps each KaTeX/MathJax node for its `application/x-tex` annotation, reads
  the text, and restores the DOM.
- An unparseable tool call for a known tool starts a new chat and retries once
  instead of failing the turn; a call for an unknown tool fails fast with
  `UNKNOWN_TOOL` and names the tool.
- A bare `questions: [...]` answer is no longer streamed into the chat as raw
  text before the `ask_user_question` card is emitted.

## 0.11.4

- Recover `ask_user_question` when DeepSeek corrupts the DSML wrapper but still
  emits a coherent `questions: [...]` array. The question card is shown instead
  of the raw JSON text.
- The tool protocol explicitly forbids native DSML and asks for the fenced
  `<tool_call>` JSON block.

## 0.11.3

- The prompt, tool protocol and continuation now require Russian answers,
  clarifications and `ask_user_question` labels/options. Code, commands, paths
  and tool names are kept unchanged.

## 0.11.2

- Parse DeepSeek DSML argument fields written as nested `invoke` tags. This was
  the cause of `read({})`, `glob({})`, `pwsh({})` and “missing required
  property”: the tool name was parsed but every argument was lost.
- Nested `invoke` fields and classic `parameter` fields are both supported;
  `string="false"` values are parsed as JSON.
- Regression test for the exact `read` DSML emitted by DeepSeek Web.

## 0.11.1

- Detect degenerate answers: a long repetition of `DSML` / `parameter name=`
  fragments is rejected, the web chat is reset, and the request is retried with
  the full prompt.
- The prompt now forbids repeating a tool call or its parameters and tells the
  model to scan large projects before reading only the needed ranges.

## 0.11.0

- Panel button **Delete all chats**: two-step confirmation, then removes every
  chat from chat.deepseek.com through the logged-in browser. DSH sessions,
  login state and project memory are untouched.
- Browser bridge deletes chats one by one via the DeepSeek sidebar menu and
  confirmation dialog, with retries and a wait for the list to shrink.
- Route `POST /dsh-web-chat/browser/deepseek/delete-all` and a route test.

## 0.10.4

- Core tools (`read`, `write`, `edit`, `glob`, `grep`, `pwsh`,
  `ask_user_question`, …) are prioritized in the 10 000-character tool budget so
  their schemas are visible and arguments are not guessed.
- Detect DeepSeek `Messages too frequent / Try again later`; pause 20 seconds
  and retry once instead of hanging until timeout.
- Throttle browser requests with a 1.5-second minimum gap.

## 0.10.3

- The tool protocol now names the actual shell tool, `pwsh`, instead of `bash`.
- `bash` tool calls in `<tool_call>` or DSML are aliased to `pwsh` when the
  Harness exposes `pwsh`, so the call is executed instead of being shown as
  text and silently stopping the turn.

## 0.10.2

- A session that actually invokes `deepseek-web` is auto-enabled and persisted,
  fixing `NOT_ENABLED` after a stale session state or a fresh chat.
- Lenient `<tool_call>` JSON recovery: literal newlines and trailing commas no
  longer turn `ask_user_question` into a raw text block.
- Added regression tests for auto-enable and long `ask_user_question` calls.

## 0.10.1

- The default GitHub install spec is now `github:kachanov-e-v/dsh-web-chat`
  (branch `main`, latest); tags remain available for pinning.
- The agent prompt now requires `ask_user_question` when the request is
  ambiguous or key requirements are missing, instead of guessing.
- `ask_user_question` is prioritized in the tool list so its schema survives
  the 10 000-character tool budget.

## 0.10.0

- Renamed the plugin and package to **dsh-web-chat**; routes, slot id, Cordis
  patch and GitHub repository follow the new name.
- Added **streaming partial answers**: the browser bridge polls the DOM and the
  LLM adapter emits text deltas before the final answer. Tool-call markers stop
  text streaming so raw DSML/`<tool_call>` is never shown as text.
- Browser profile and `sessions.json` stay in `$DSH_HOME/dsh-chat-model` for
  backward compatibility, so the rename does not log the user out.
- Install from GitHub with
  `github:kachanov-e-v/dsh-web-chat#v0.10.0`.

## 0.9.4

- Install directly from GitHub with
  `github:kachanov-e-v/dsh-chat-model#v0.9.4`.
- README documents the GitHub installation spec and the tagged release.
- No runtime changes from 0.9.3.

## 0.9.3