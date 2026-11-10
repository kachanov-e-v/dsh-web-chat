# Changelog

## 0.9.3

- Auto-new-chat on DeepSeek `CONTEXT_LIMIT` with a 60-second cooldown and a full
  prompt retry.
- Full prompt reduced to 60 000 characters, project memory to 6 000, tool
  results to 10 000.
- Incremental continuation prompts are preserved.
- Auto-new-chat no longer triggers on prompt size or unparsed answers.

## 0.9.2

- Incremental prompts: full prompt on the first turn, continuation with only
  new messages afterwards.
- Detect “Length limit reached / Please start a new chat”.
- Compacted older context and a bounded full prompt.

## 0.9.0

- `PROJECT_MEMORY.md` is created, loaded into every request, and maintained by
  the model.
- Per-chat enablement persists in `sessions.json`.
- Deterministic context compaction.
- Auto-new-chat only for `EMPTY`/`NO_ANSWER` with a cooldown.

## 0.8.0

- DeepSeek-only: one browser provider and the `DeepSeek (browser)` model.
- Per-chat enablement via `sessionController.selectModel`; `NOT_ENABLED` in
  other chats.
- Green chip, anchored settings panel, outside-click close.
- `<tool_call>` code fences and native DSML parsing.

## 0.7.0

- Removed Gemini, Qwen and Mistral.
- Removed the direct DeepSeek API, token storage, consult tools and “Always”
  mode.

## Earlier

- 0.2–0.6: browser bridges for Gemini/Qwen/Mistral, automatic new chats,
  DSML support, prompt compaction and the first per-chat model adapters.
