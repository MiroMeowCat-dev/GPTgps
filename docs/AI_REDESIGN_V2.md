# GPTgps AI Redesign (V2)

## Why V2
- Current AI path showed unstable behavior (`Receiving end does not exist`, provider mismatch, summary not visibly rendered).
- V2 keeps the old implementation as backup and rebuilds the active integration around:
  - stricter provider presets,
  - minimal official request payloads,
  - message-channel retry/diagnostics,
  - visible summary output in sidebar.

## Backup
- Frozen backup snapshot:
  - `backup/20260328-ai-v1/chat-nav-sidebar.js`
  - `backup/20260328-ai-v1/background.js`
  - `backup/20260328-ai-v1/mv3-manifest.json`
  - `backup/20260328-ai-v1/mv2-manifest.json`

## Official References Used
- OpenAI Chat Completions API:
  - https://platform.openai.com/docs/api-reference/chat
- Qwen via DashScope OpenAI compatible mode:
  - https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
- Qwen Coding Plan (Cline/other tools):
  - https://help.aliyun.com/zh/model-studio/cline-coding-plan
  - https://help.aliyun.com/zh/model-studio/other-tools-coding-plan
  - https://help.aliyun.com/zh/model-studio/coding-plan-faq
- MiniMax ChatCompletion v2:
  - https://platform.minimax.io/document/ChatCompletion_v2
- Chrome extension messaging + service worker lifecycle:
  - https://developer.chrome.com/docs/extensions/develop/concepts/messaging
  - https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
  - https://developer.chrome.com/docs/extensions/reference/api/permissions

## Community/GitHub References Reviewed
- Neutral_Summarizer:
  - https://github.com/JC1DA/Neutral_Summarizer
- Open WebUI extension:
  - https://github.com/open-webui/extension

## V2 Technical Decisions
1. Keep AI requests in extension background (not page context).
2. Normalize `baseUrl` by stripping accidental endpoint suffixes:
   - `/chat/completions`
   - `/text/chatcompletion_v2`
3. Use minimal body fields (remove speculative provider-only params).
4. Endpoint selection:
   - OpenAI/Qwen/Coding Plan: `.../chat/completions`
   - MiniMax: `.../text/chatcompletion_v2` first, then fallback `.../chat/completions`
5. Add message-channel heartbeat (`gptgps_ai_ping`) + retry path for background wakeup failures.
6. Improve diagnostics:
   - explicit API key cleanup warning (raw vs cleaned length),
   - test success warns: "Test passed only; click Save to enable summaries."
7. Surface segment summary text directly in segment header so users can confirm AI output immediately.

## Rollout Strategy
1. Keep V1 backup untouched.
2. Run V2 in-place on active files.
3. Verify with Test + Save flow on all providers:
   - OpenAI
   - Qwen DashScope
   - Qwen Coding Plan
   - MiniMax
4. If needed, re-open V1 backup for diff-based rollback.
