# Changelog

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