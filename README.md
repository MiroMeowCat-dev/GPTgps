# GPTgps

GPTgps is a browser extension for navigating long AI conversations across multiple chat sites.

It adds a dedicated navigation layer for finding earlier prompts, splitting large conversations into segments, placing checkpoints, pinning important nodes, adding notes, and optionally generating AI summaries so long threads stay usable.

## What It Solves

Long AI chats become hard to use when:

- you need to jump back to a specific earlier prompt
- the conversation covers several subtopics
- you want to mark important positions inside the chat body
- you need a compact outline instead of rereading the full thread

GPTgps addresses that with an in-page sidebar and jump system designed for long-form chat workflows.

## Supported Sites

- ChatGPT
- Gemini
- Qwen / Tongyi / Qianwen
- Doubao
- Claude

## Core Features

- Prompt navigation sidebar with search
- Segment split / rename workflow
- Mark / checkpoint anchors tied to chat-body positions
- Pin important prompts or markers
- Notes on prompts and markers
- Right-side mini jump dock
- AI summaries for segments and prompt-level items
- AI provider switching, diagnostics, retries, and language selection
- Export / import of current navigation state
- Session-state restoration after refresh

## AI Providers

GPTgps currently supports these summary backends:

- OpenAI-compatible APIs
- Qwen DashScope CN / Intl / US
- Qwen Coding endpoint
- MiniMax
- Custom OpenAI-compatible endpoints

## Install

### Chrome / Edge

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select [dist_mv3](/C:/Users/36135/Documents/Codex%20GPTgps/dist_mv3).

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on`.
3. Select [manifest.json](/C:/Users/36135/Documents/Codex%20GPTgps/dist_mv2/manifest.json).

## Build

- Windows: `build.bat`
- macOS / Linux: `build.sh`

This regenerates the unpacked builds in `dist_mv2` and `dist_mv3` from source.

## Basic Usage

1. Open a supported AI chat page.
2. Open GPTgps from the floating button.
3. Use the sidebar to search, jump, split, pin, rename, and annotate.
4. Optional: open AI settings to enable summaries and choose provider, model, base URL, language, and display limits.
5. Optional: use `Tools` for diagnostics, export, and import.

## Documentation

- Chinese quick start: [快速使用-中文.md](/C:/Users/36135/Documents/Codex%20GPTgps/docs/%E5%BF%AB%E9%80%9F%E4%BD%BF%E7%94%A8-%E4%B8%AD%E6%96%87.md)
- Regression checklist: [nav-regression-checklist.md](/C:/Users/36135/Documents/Codex%20GPTgps/docs/nav-regression-checklist.md)
- Release workflow: [GitHub发布流程.md](/C:/Users/36135/Documents/Codex%20GPTgps/docs/GitHub%E5%8F%91%E5%B8%83%E6%B5%81%E7%A8%8B.md)

## Current Status

This release is focused on long-chat navigation and multi-site support.

Stable for day-to-day use:

- ChatGPT
- Gemini
- Qwen
- Claude
- Doubao

Still being refined:

- Consecutive image-only messages are planned to collapse into a single expandable prompt group in a later update.

## Known Limitations

- AI summaries depend on the provider and API key you configure.
- Multi-site adapters rely on live site DOM structure, so selector recalibration may be needed after upstream UI changes.
- Image-only turns are preserved with placeholders such as `[Image-only message]`, but richer grouping for consecutive image-only turns is still planned.

## Project Positioning

GPTgps started from the Prompt Genius codebase and has been heavily extended with:

- segment-aware navigation
- checkpoint / marker anchors
- improved jump accuracy
- AI summary orchestration
- multi-site adapters
- diagnostics and session restoration

This repository is suitable for public open-source release with attribution and license continuity preserved.

## License and Attribution

This repository currently carries `CC BY-NC-SA 4.0` in [LICENSE](/C:/Users/36135/Documents/Codex%20GPTgps/LICENSE).

That means:

- attribution is required
- non-commercial use only
- share-alike applies to derivatives

If you publish or fork this repository, keep the attribution and license notices intact.

## Recommended Repo Description

`GPTgps: multi-site AI chat navigator with segments, markers, pinning, search, and AI summaries for long conversations.`

## Key Paths

- [chat-nav-sidebar.js](/C:/Users/36135/Documents/Codex%20GPTgps/src/content-scripts/chat-nav-sidebar.js): main GPTgps sidebar logic
- [background.js](/C:/Users/36135/Documents/Codex%20GPTgps/src/background.js): AI request routing and provider integration
- [manifests](/C:/Users/36135/Documents/Codex%20GPTgps/manifests): source manifests for MV2 and MV3
- [dist_mv3](/C:/Users/36135/Documents/Codex%20GPTgps/dist_mv3): unpacked build for Chrome / Edge
- [dist_mv2](/C:/Users/36135/Documents/Codex%20GPTgps/dist_mv2): unpacked build for Firefox
