# Layout and rendering

How a terminal UI should occupy the screen, adapt to its size, draw frames without flicker, measure text correctly and present every view state. Load this when designing screens, fixing flicker or misaligned columns, handling resize, or displaying untrusted text. Color and `NO_COLOR` basics are in [CLI-BASELINE.md](CLI-BASELINE.md).

## Probing a TUI with tmux

Many checks below can be run headlessly by hosting the app in a detached tmux session and capturing the pane:

```sh
tmux new-session -d -s probe -x 120 -y 40 'mytui'
sleep 1; tmux capture-pane -p -t probe            # what the user sees
tmux resize-window -t probe -x 50 -y 12; sleep 0.5
tmux capture-pane -p -t probe                     # layout after resize
tmux send-keys -t probe q; tmux kill-session -t probe 2>/dev/null
```

To inspect the raw escape sequences an app emits, record a session with `script -q -c mytui out.typescript` and search the file.

## Standard screen regions

| Region | Content | Notes |
| --- | --- | --- |
| Header / title bar | App name, current context (repo, cluster, host), tabs | One line; truncate context from the left of paths |
| Body | Panes, lists, tables, detail views | Takes all remaining space |
| Status bar | Mode, counts, selection, transient messages and errors, progress | One line; errors replace hints temporarily |
| Help / key hint bar | The most relevant keys for the focused view, `? help` | One line; contents change with focus |

## Rules

### TUI-LAY-001: Use the alternate screen for full-screen apps and restore the primary screen

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://invisible-island.net/xterm/ctlseqs/ctlseqs.html>

Full-screen apps should switch to the alternate screen buffer (`CSI ? 1049 h`) on start and back (`CSI ? 1049 l`) on every exit path, so the user's shell history and scrollback are left exactly as they were. Pair it with hiding the cursor and raw mode, and undo all of them together (see TUI-ARC-011 in [ARCHITECTURE.md](ARCHITECTURE.md)). Frameworks expose this as `tea.WithAltScreen()`, `EnterAlternateScreen` in crossterm, or the default in Textual. If the app prints a result for the user to keep (a chosen item, a summary), print it after leaving the alternate screen.

**Verify:** Grep for `1049`, `WithAltScreen`, `AltScreen = true`, `EnterAlternateScreen`, `smcup`/`rmcup` and confirm a matching leave on quit, error and signal paths. Probe: run some commands, launch the app, quit with `q`, and confirm the earlier shell output is intact and no frame remnants remain; in a `script` recording count equal numbers of `\e[?1049h` and `\e[?1049l`.

### TUI-LAY-002: Render inline for short-lived interactions

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Prompts, pickers, confirmations, progress displays and small selectors (in the style of `fzf --height=40%` or `gum choose`) should draw in place below the cursor on the primary screen without clearing it, and leave either nothing or a one-line summary when done. Taking over the whole screen for a three-option menu wipes the context the user was looking at. Reserve only the rows needed, and clean them up or collapse to the final answer on exit.

**Verify:** For each interaction that completes in seconds, check that it does not enter the alternate screen or clear the screen (`CSI 2 J`, `clear`). Run it after some shell output and confirm prior output remains visible above it and the result line is left in scrollback.

### TUI-LAY-003: Re-layout on terminal resize

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Listen for size changes (SIGWINCH on Unix, `tea.WindowSizeMsg`, crossterm `Event::Resize`, Textual `on_resize`, Ink `useStdout` dimensions) and recompute layout from the new width and height on the next frame. Never cache the size from startup, and never hard-code 80x24. After resizing, scroll offsets and the selection must be clamped so the selected row stays visible.

**Verify:** Grep for the resize event handler and confirm layout code reads current dimensions from state. Probe with tmux (see above): start at 120x40, resize to 60x15 and back, and confirm via `capture-pane` that borders, columns and the selection are redrawn correctly with no leftover characters.

### TUI-LAY-004: Show a clear message when the terminal is too small

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Define the minimum width and height at which the layout works and, below it, replace the UI with a centered message stating the current and required size, for example `Terminal too small: 38x10 (need 60x15)`. Keep input handling alive so the user can still quit, and restore the normal view as soon as the terminal grows. Do not crash, panic on negative widths, or draw overlapping garbage.

**Verify:** Search for a minimum-size check in the render path. Probe with `tmux new-session -d -s p -x 20 -y 5 mytui; sleep 1; tmux capture-pane -p -t p` and confirm the message; then `tmux send-keys -t p q` exits cleanly.

### TUI-LAY-005: Adapt layout to available space

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** original

Design breakpoints rather than a single fixed layout: at narrow widths collapse side-by-side panes into tabs or a stack, hide low-priority columns, and shorten labels. Truncate text that does not fit with an ellipsis (`…`) instead of wrapping into adjacent cells or clipping silently; for paths and identifiers, truncate in the middle or from the left so the distinguishing part stays visible. Use proportional or flexible constraints, not absolute coordinates.

**Verify:** Capture the screen at 200x50, 100x30 and 70x20 using the tmux probe. Confirm no text overflows its region, truncated values show an ellipsis, and the most important columns survive at the narrowest supported size.

### TUI-LAY-006: Render by diffing frames, not clearing the screen

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Build each frame in an off-screen buffer and write only the cells that changed since the previous frame, in a single write (or a few large buffered writes) per frame. Clearing the whole screen and repainting each frame causes visible flicker, especially over SSH and in slower terminals. Most frameworks (Ratatui, Bubble Tea, Textual, tcell) do this already; do not defeat them by calling clear on every update or writing directly to stdout around the renderer.

**Verify:** Grep for `\x1b[2J`, `\033[2J`, `terminal.clear()`, `ClearScreen`, `console.clear` in per-frame paths. Watch the app over a high-latency SSH connection or with frequent updates and look for flashing; in a `script` recording, confirm full clears appear only at start and resize.

### TUI-LAY-007: Wrap frames in synchronized output where supported

- **Level:** consider
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036>

Synchronized output (DEC private mode 2026) tells the terminal to hold rendering between `CSI ? 2026 h` and `CSI ? 2026 l`, so a frame appears atomically without tearing. Terminals that do not recognize the mode ignore it, but you can query support with DECRQM (`CSI ? 2026 $ p`) and only emit it when acknowledged. Always pair begin and end, including when a frame write fails, or the terminal will appear frozen until its timeout.

**Verify:** Check whether the framework or backend emits `?2026h`/`?2026l` (crossterm `BeginSynchronizedUpdate`, recent Bubble Tea and Textual versions do). In a `script` recording, confirm each `\e[?2026h` has a matching `\e[?2026l`.

### TUI-LAY-008: Cap the frame rate

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Redraw only when state changed, and at most at a fixed ceiling (30-60 fps for animations, 1-10 updates per second for dashboards and log tails). Coalesce bursts of messages into one frame. Unthrottled rendering burns CPU, saturates SSH links and can make the app slower than the data it shows. Animations such as spinners should stop ticking when not visible.

**Verify:** Look for a render tick, frame limiter or framework FPS option (`tea.WithFPS`, a `tokio::time::interval` draw tick). Run the app idle and under a high-volume data source and check CPU in `top`; an idle TUI should use near zero CPU.

### TUI-LAY-009: Measure text by display width, not bytes or code points

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://www.unicode.org/reports/tr11/>

Column alignment, truncation, padding and cursor placement must use terminal cell width: East Asian wide characters and most emoji take two cells, combining marks and zero-width joiners take zero, and a grapheme cluster (for example a flag or family emoji) must never be split. Use a width library (`go-runewidth`/`uniseg` in Go, `unicode-width`/`unicode-segmentation` in Rust, `wcwidth` or `rich.cells` in Python, `string-width` in Node) rather than `len()`, `.length` or `chars().count()`. Truncate on grapheme boundaries.

```python
from wcwidth import wcswidth
assert len("日本") == 2 and wcswidth("日本") == 4
```

**Verify:** Grep layout and truncation code for `len(`, `.length`, `.chars().count()` applied to display strings. Probe by loading data containing `日本語`, `é` written as `e` + U+0301, and `👩‍💻`, and confirm columns and borders stay aligned in a tmux capture.

### TUI-LAY-010: Sanitize control characters and escape sequences in displayed data

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

File names, log lines, commit messages, HTTP responses and other untrusted text can contain ESC, CR, backspace, BEL, C1 controls (U+0080-U+009F) and full escape sequences. Written raw, they corrupt the layout and enable terminal injection: changing the window title, moving the cursor to spoof content, writing OSC 52 to the clipboard, or creating deceptive OSC 8 links. Before rendering, expand tabs to spaces at the correct tab stops, and replace or visibly escape other control characters (for example `\x1b` → `␛` or `^[`). If you intentionally preserve ANSI colors from subprocess output, parse them into styles and drop every non-SGR sequence.

**Verify:** Find where external strings enter render code and confirm a sanitization function. Probe with a file named `$(printf 'a\033]0;pwned\007b')` or a log line containing `printf '\033[2J\033]52;c;aGk=\007'`, and confirm the title, screen and clipboard are untouched and the characters are shown escaped.

### TUI-LAY-011: Handle long content with scrolling and visible position

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** original

Any view whose content can exceed its region must scroll, and the user must be able to tell there is more: a scrollbar, `12/340` position counter, or "more" markers. For long lines, choose deliberately between soft wrap and horizontal scroll (with a toggle when both are useful, as in log viewers), and never let a line spill into another pane. Keep the selection visible while scrolling and support page and jump-to-end keys (see [INPUT-AND-KEYBINDINGS.md](INPUT-AND-KEYBINDINGS.md)).

**Verify:** Load more items than fit and lines longer than the pane width. Confirm a position indicator, that `PgDn`/`G` reach the end, that long lines wrap or scroll horizontally without bleeding into neighboring regions.

### TUI-LAY-012: Keep consistent layout regions across views

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** original

Use the same regions in every view (see "Standard screen regions" above): context at the top, content in the body, status and messages in one status line, key hints in one help line. Users learn where to look once; moving the status line or hints between screens forces them to search. Overlays (help, confirmations, pickers) should appear centered over the body and leave the header and status visible.

**Verify:** Navigate through every top-level view and overlay; confirm status, errors and key hints always appear in the same rows.

### TUI-LAY-013: Make focus and hierarchy visible without relying on color alone

- **Level:** must
- **Severity:** medium
- **Check:** manual, probe
- **Source:** original

The focused pane, selected row and active tab must be identifiable at a glance and also when color is unavailable (`NO_COLOR`, monochrome terminals, color blindness): combine color with a heavier or different border, reverse video, bold, or a marker such as `>` or `▌`. Use borders sparingly; separate regions with whitespace or a single rule where possible, and reserve emphasis for what matters so the eye finds the focus first.

**Verify:** Run with `NO_COLOR=1` and with `TERM=xterm-mono`, Tab through panes, and confirm the focused pane and selected row are still distinguishable in a `tmux capture-pane -p` (plain text) or by eye.

### TUI-LAY-014: Design loading, empty and error states for every view

- **Level:** must
- **Severity:** medium
- **Check:** manual
- **Source:** original

Every view that shows data needs three states besides "has data": loading (spinner or skeleton with what is loading), empty (say why it is empty and how to populate it, for example "No pods in namespace default. Press n to switch namespace"), and error (what failed, plus a retry key). A blank pane is ambiguous: the user cannot tell loading from nothing from failure. Distinguish "no results for filter" from "no data at all", and show the active filter.

**Verify:** For each view, force each state: slow or offline backend, empty dataset, a filter matching nothing, and a failing request. Confirm each shows a distinct, explanatory message and a way forward.
