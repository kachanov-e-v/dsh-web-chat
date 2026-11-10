# Changelog

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