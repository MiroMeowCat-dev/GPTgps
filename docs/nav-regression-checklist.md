# Navigator Regression Checklist

Use this checklist before shipping changes to `chat-nav-sidebar.js`.

## 1) Basic Navigation

1. Open one ChatGPT conversation with at least 8 user prompts.
2. Confirm sidebar lists prompts in order and search filters prompt text.
3. Pin 2 prompts, refresh page, verify pin state persists.
4. Click a prompt entry and verify jump + highlight on target message.

## 2) Segmentation

1. Confirm default is 1 segment (title/summary based on the first prompt) before any manual split.
2. On a non-first prompt, click `Split Here` and verify a new segment starts there.
3. Rename the segment and refresh; verify custom title persists.
4. Click `Clear Split`; verify segmentation updates without breaking notes/pins.
5. Search with a query that matches segment title/summary and verify the whole segment is shown and each item can still jump.

## 3) Long-Chat Virtualization Jump

1. In a long conversation, scroll far away from early prompts.
2. Click an early prompt from sidebar.
3. Verify fallback scrolling loads older DOM content and eventually jumps to target.
4. If not found, verify status feedback appears (`Prompt not loaded yet`).

## 4) Persistence Isolation Across Routes

1. Set per-thread state (pins, notes, splits, renamed segment, pinned-only).
2. Switch to another conversation and set different state.
3. Return to first conversation and verify no cross-thread leakage.
4. During fast route switch after edits, verify no state corruption.

## 5) Pinned-only and Active Highlight

1. Enable `Pinned only`; verify only pinned prompts remain visible.
2. With filter enabled, search and verify filtering still works.
3. Scroll chat and verify active prompt highlight tracks current viewport.

## 6) Keyboard Shortcuts

1. Press `Alt+Shift+F`; verify sidebar opens (if hidden) and focuses search input.
2. Press `Alt+Shift+N`; verify sidebar toggles visibility.
3. While typing in ChatGPT textarea or note input, press shortcuts and verify they do not interrupt text entry.

## 7) Duplicate Prompt Stability (Blocking)

1. In one conversation, send the exact same user prompt text at least 3 times in different stages of the thread.
2. Add different note/pin/split markers to each duplicate entry from the sidebar.
3. Scroll far away so earlier duplicates are virtualized out, then jump back and forth between duplicates for at least 5 cycles.
4. Refresh page and repeat jumps.
5. Verify annotations do not cross-bind between duplicates (no note/pin/split/title leakage).

## 8) Plan 1/2/3

1. UAT: Verify manual segmentation (Split/Clear Split + Rename), then apply search and click jump entries to confirm the full navigation path still works.
2. Usability: Verify wheel switching works between visible segments when hovering segment header/non-prompt area, and prompt-list wheel keeps local scrolling (two-level scroll remains stable).
3. Productization: Manually resize the sidebar and verify min/max constraints work while content remains visible and scrollable.