# GPTgps

GPTgps is a browser extension for ChatGPT conversation navigation.

It helps you quickly find previous prompts/markers in long chats, split conversations into segments, pin key nodes, and optionally generate AI summaries for better scanning.

## What GPTgps Adds

- Segment-based navigation for long conversations
- Prompt/Marker timeline with search, pin, split, and notes
- Marker checkpoints anchored by position in the chat body
- Stable jump-to-position behavior for prompts and markers
- AI summary pipeline (multi-provider, with fallback and retries)
- Per-segment scroll and session position restore after refresh
- Draggable floating open button and compact sidebar workflow

## Current AI Providers

- OpenAI (Chat Completions compatible)
- Qwen DashScope (CN / Intl / US / Coding endpoint variants)
- MiniMax (OpenAI-compatible endpoint flow)
- Custom OpenAI-compatible endpoint

## Install (Local, Unpacked)

### Chrome / Edge (MV3)

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select:
   - `dist_mv3` (recommended), or
   - build from source then load output.

### Firefox (MV2)

1. Open `about:debugging`.
2. Choose `This Firefox`.
3. Click `Load Temporary Add-on`.
4. Select `dist_mv2/manifest.json`.

## Build

- Windows: run `build.bat`
- macOS/Linux: run `build.sh`

This regenerates `dist_mv2` and `dist_mv3` from source/manifests.

## How to Use

1. Open a ChatGPT conversation.
2. Use GPTgps sidebar to:
   - search prompts/notes
   - split into segments
   - create/move markers
   - pin key items
   - jump to exact conversation positions
3. Optional: configure AI summary from the AI settings panel.

## Open-Source Positioning / Originality

This project is a heavily customized derivative of the Prompt Genius codebase, with major additions around:

- conversation segment model
- marker checkpoint system
- robust in-page jump logic
- AI summary orchestration and diagnostics
- restored state and scroll continuity
- interaction and layout redesign for long-task workflows

It is suitable to publish publicly as an open repository **with clear attribution and license continuity**.

## License and Attribution

This repository currently carries `CC BY-NC-SA 4.0` in [LICENSE](LICENSE).

That means:

- attribution is required
- non-commercial use only
- share-alike applies to derivatives

If you publish this repository, keep original attribution and license notices intact.

## Suggested Repository Description

`GPTgps: ChatGPT conversation navigator with segments, markers, pinning, and AI summaries for long, complex chats.`

## Project Structure (Key Paths)

- `src/content-scripts/chat-nav-sidebar.js` - main GPTgps sidebar logic
- `src/background.js` - AI request routing and provider integration
- `manifests/` - source manifests for MV2/MV3
- `dist_mv3/` - unpacked build for Chrome/Edge
- `dist_mv2/` - unpacked build for Firefox
- `src/icons/` - extension icon assets

