# Terminal compatibility

How a TUI coexists with the terminal it runs in: restoring state on every exit path, job control and signals, capability detection, multiplexers, remote links, Windows consoles, and optional protocol extensions. Load this when writing setup/teardown code, adding a terminal feature, or auditing robustness across terminals. Command-line basics (TTY detection for plain output, exit codes, stdout/stderr) are in [CLI-BASELINE.md](CLI-BASELINE.md); alternate screen, resize, and escape-sequence sanitizing are in [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md); key and mouse protocols are in [INPUT-AND-KEYBINDINGS.md](INPUT-AND-KEYBINDINGS.md).

## Terminal state to restore

Undo every mode you enable, in reverse order, and only the ones you enabled.

| Mode | Enable | Disable / restore |
| --- | --- | --- |
| Raw/cbreak input | `tcsetattr` (Unix), `SetConsoleMode` (Windows) | reapply the saved termios / console mode |
| Alternate screen | `ESC[?1049h` | `ESC[?1049l` |
| Cursor hidden | `ESC[?25l` | `ESC[?25h` |
| Mouse tracking | `ESC[?1000h`, `?1002h`/`?1003h`, `?1006h` | same numbers with `l` |
| Bracketed paste | `ESC[?2004h` | `ESC[?2004l` |
| Focus events | `ESC[?1004h` | `ESC[?1004l` |
| Kitty keyboard flags | `ESC[>Nu` (push) | `ESC[<u` (pop) |
| Styles/colors | any SGR | `ESC[0m` |
| Scroll region | `ESC[t;br` | `ESC[r` |
| Cursor shape | `ESC[N q` | `ESC[0 q` |

## Terminal test matrix

| Terminal | Why it matters |
| --- | --- |
| xterm | Reference implementation of most control sequences |
| GNOME Terminal and other VTE terminals | Very common Linux default; sets `COLORTERM=truecolor` |
| kitty | Kitty keyboard and graphics protocols; `TERM=xterm-kitty` often missing on remote hosts |
| WezTerm, Alacritty | Modern GPU terminals with differing feature sets |
| iTerm2, Apple Terminal | macOS defaults; older Apple Terminal versions lack truecolor |
| Windows Terminal, legacy conhost | ConPTY translation and legacy console limits |
| VS Code integrated terminal | xterm.js; very common for developers; `TERM_PROGRAM=vscode` |
| tmux, GNU screen | Rewrite or drop sequences; different `TERM`; extra latency |
| Linux console (`TERM=linux`) | 8/16 colors, limited glyphs, no OSC queries |

## Rules

### TUI-TRM-001: Restore the terminal on every exit path

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Normal quit, error return, panic or uncaught exception, and signal-triggered exit must all leave the terminal as it was: cooked mode with echo, primary screen, visible cursor, and mouse tracking, bracketed paste, focus events, and keyboard enhancement flags disabled. A broken terminal (no echo, mouse clicks printing garbage, invisible cursor) forces users to run `reset` and is the most visible TUI bug. Put teardown in one idempotent function and call it from every path; use framework-provided setup/teardown where available.

```rust
fn restore() -> std::io::Result<()> {
    use crossterm::{cursor, event::*, execute, terminal::*};
    disable_raw_mode()?;
    execute!(std::io::stdout(), PopKeyboardEnhancementFlags, DisableBracketedPaste,
        DisableFocusChange, DisableMouseCapture, LeaveAlternateScreen, cursor::Show)
}
```

**Verify:** Record `stty -g` before running, then exit the app via quit key, a forced error, and `kill -TERM`; after each, `stty -g` must match and the cursor must be visible. In a pty capture (`script -qec 'mytool' out.log`), the tail of `out.log` must contain the disable sequences for every mode enabled earlier.

### TUI-TRM-002: Restore the terminal before printing panic or crash output

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

A panic message written while still in the alternate screen and raw mode is lost when the screen switches back, or is printed with staircase line breaks. Install a hook that restores the terminal first, then delegates to the default reporter.

```rust
// Ratatui: init() installs a panic hook that calls restore() before the default hook.
let mut terminal = ratatui::init();
let result = run(&mut terminal);
ratatui::restore();
// Manual crossterm: chain your own hook.
let default = std::panic::take_hook();
std::panic::set_hook(Box::new(move |info| { let _ = restore(); default(info); }));
```

```go
// Bubble Tea's Program.Run recovers panics in the event loop and restores the terminal.
// Goroutines you start yourself are not covered: a panic there kills the process
// without running main's defers, so recover locally and report back via a message.
go func() {
	defer func() {
		if r := recover(); r != nil {
			p.Send(errMsg{fmt.Errorf("worker panic: %v", r)})
		}
	}()
	work()
}()
// tcell: defer func() { if r := recover(); r != nil { screen.Fini(); panic(r) } }()
```

```python
# Textual restores the terminal and then prints the traceback. With raw curses:
import curses
curses.wrapper(main)  # try/finally around initscr()/endwin()
# Hand-rolled: try: run() finally: restore()
```

**Verify:** Grep for `set_hook`, `ratatui::init`, `recover()`, `wrapper(`, or `finally:` around the main loop. Trigger a panic via a debug-only path (for example an env var read in a test build) and confirm the traceback is readable on the primary screen and `stty -g` is unchanged.

### TUI-TRM-003: Handle SIGINT, SIGTERM and SIGHUP by restoring and exiting

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

In raw mode Ctrl-C arrives as a key (byte 0x03), not SIGINT, so map it to quit or cancel explicitly. SIGINT and SIGTERM can still arrive from `kill`, process managers, or `timeout`; catch them, restore the terminal, and exit with the conventional status (see [CLI-BASELINE.md](CLI-BASELINE.md)). SIGHUP means the terminal is gone: save state and exit without blocking on writes, and ignore write errors (`EIO`) during teardown. In Python, SIGTERM's default action skips `finally` blocks, so install a handler that raises `SystemExit`.

```python
import signal, sys
signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
signal.signal(signal.SIGHUP, lambda *_: sys.exit(129))
```

**Verify:** Start the app in a pty or tmux pane, then `kill -INT`, `kill -TERM`, and `kill -HUP` its PID in separate runs; the terminal must be restored (for HUP, check the process exits promptly with `ps`). Grep for signal handler registration (`signal.Notify`, `signal_hook`, `signal.signal`, `process.on('SIGTERM'`).

### TUI-TRM-004: Support suspend and resume with Ctrl-Z

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Users expect Ctrl-Z to background a terminal program. Raw mode disables signal generation, so Ctrl-Z arrives as byte 0x1A: restore the terminal, stop the process group with SIGTSTP at its default disposition, and after SIGCONT re-enter raw mode and the alternate screen, re-enable modes, re-query the size, and force a full redraw (the screen was overwritten while stopped). Handle an external `kill -TSTP` the same way. Bubble Tea provides `tea.Suspend` (and a `tea.ResumeMsg` on return); Textual provides `action_suspend_process`; with crossterm or raw termios, implement it yourself. Windows has no job control; ignore the key there.

```python
def suspend(app):
    app.restore_terminal()
    os.kill(0, signal.SIGTSTP)  # blocks here until SIGCONT
    app.setup_terminal()
    app.full_redraw()
```

**Verify:** Run the app, press Ctrl-Z, confirm the shell prompt is usable with echo, run `fg`, and confirm the UI is fully redrawn and responsive. Repeat with `kill -TSTP <pid>` from another terminal.

### TUI-TRM-005: Refuse or fall back when stdin or stdout is not a terminal

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Entering raw mode or the alternate screen on a pipe either fails or corrupts the output stream, and reading keys from a non-TTY stdin hangs or consumes piped data. Check both streams before setup: fall back to the plain, non-interactive behavior defined in [CLI-BASELINE.md](CLI-BASELINE.md), or exit with a clear error naming the non-interactive alternative. If the app legitimately reads data from stdin while staying interactive (like `fzf`), read keys from `/dev/tty` (`CONIN$` on Windows) instead.

**Verify:** Run `mytool | cat`, `echo x | mytool`, and `mytool < /dev/null`; each must either produce plain output or a clear error and exit promptly, with no escape sequences in the piped output and no hang.

### TUI-TRM-006: Handle dumb and unknown terminals

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

`TERM=dumb` (Emacs shell buffers, some CI and editor consoles) cannot position the cursor; do not start the full-screen UI there. Use plain mode or exit with an explanation. When `TERM` is unset or has no terminfo entry (common over SSH with `xterm-kitty`, `alacritty`, or `wezterm` on hosts lacking those entries), fall back to a conservative xterm-compatible subset and 16 colors rather than crashing on a terminfo lookup error.

**Verify:** Run `TERM=dumb mytool` and `TERM=no-such-term mytool` in a pty; the first must not emit cursor-addressing sequences, and the second must start (in a degraded mode) or exit with a clear message rather than a stack trace.

### TUI-TRM-007: Detect capabilities instead of sniffing terminal names

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Terminal names lie: many terminals set `TERM=xterm-256color`, multiplexers replace `TERM`, and `TERM_PROGRAM` is not forwarded over SSH. Prefer, in order: explicit user config, protocol queries with replies (DA1, XTVERSION, kitty keyboard `CSI ? u`, kitty graphics query, OSC 11), terminfo capabilities, and documented environment conventions (`COLORTERM`). Use name checks only as a last-resort workaround for a specific known bug, and keep them in one place with a comment naming the bug.

**Verify:** Grep for `TERM_PROGRAM`, `== "xterm`, `iTerm`, `kitty`, `WT_SESSION` and similar; each match should be a documented workaround or a hint, not the primary feature gate.

### TUI-TRM-008: Never block on terminal queries

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://sw.kovidgoyal.net/kitty/keyboard-protocol/#detection-of-support-for-this-protocol>

Terminals ignore queries they do not understand, so a startup that waits for a reply can hang forever. Send the feature query followed by DA1 (`ESC[c`), which nearly every terminal answers: if the DA1 reply arrives first, the feature is unsupported. Also enforce a timeout (about 100–200 ms; longer only over slow links) and proceed with defaults when it expires. Read replies from the TTY, consume them so they are not mistaken for key presses, and batch queries into one round trip.

| Query | Sequence | Reply |
| --- | --- | --- |
| Primary device attributes (DA1) | `ESC[c` | `ESC[?…c` |
| Terminal name and version (XTVERSION) | `ESC[>q` | `ESC P>\|name version ESC\` |
| Kitty keyboard flags | `ESC[?u` | `ESC[?flagsu` |
| Background color | `ESC]11;?ESC\` | `ESC]11;rgb:…ESC\` |
| Kitty graphics | `ESC_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAAESC\` | `ESC_Gi=31;OKESC\` |

**Verify:** Grep for query sequences (`\x1b[c`, `\x1b[>q`, `\x1b[?u`, `]11;?`, `_G`) and confirm each read has a timeout or DA1 sentinel. Run the app under `screen`, on the Linux console, or through a pty driver that never answers queries; startup must complete within a fraction of a second.

### TUI-TRM-009: Account for tmux and screen

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://github.com/tmux/tmux/wiki/FAQ>

Multiplexers sit between the app and the real terminal. Inside tmux (`TMUX` set) or screen (`STY` set): `TERM` is `tmux-256color`/`screen-256color` or similar; truecolor works only if the user configured it (tmux `terminal-features` with `RGB`); OSC 52 needs tmux `set-clipboard on`; images and other unknown sequences are dropped unless wrapped in DCS passthrough (`ESC Ptmux; … ESC\` with inner `ESC` doubled), which tmux 3.3+ only forwards with `allow-passthrough on`; queries may be answered by tmux itself rather than the outer terminal. Degrade features instead of emitting passthrough by default, and document required multiplexer settings.

**Verify:** Run the app inside `tmux new-session` and inside `screen` with default configs; confirm colors, borders, and input work and no stray characters appear. Grep for `Ptmux` and confirm passthrough is gated on detection or config.

### TUI-TRM-010: Minimize bytes per frame for slow and remote links

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** original

Over SSH, mosh, or serial links, every byte costs latency. Diff against the previous frame and send only changed cells, use relative cursor moves and reuse current SGR state instead of resetting per cell, coalesce updates to a frame-rate cap, and redraw nothing when idle. Avoid full clears (`ESC[2J`) except on resize or resume. Use synchronized output (`ESC[?2026h` … `ESC[?2026l`) where supported to avoid tearing; see [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md).

**Verify:** Capture output in a pty while moving the selection one row (`script -qec 'mytool' out.log`) and compare log growth per keypress; one-row changes should cost tens to low hundreds of bytes, not a full screen. Test over `ssh localhost` with added latency (`tc qdisc add dev lo root netem delay 100ms` on Linux, root required) and confirm typing remains usable.

### TUI-TRM-011: Enable VT processing on Windows and degrade on legacy consoles

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://learn.microsoft.com/en-us/windows/console/console-virtual-terminal-sequences>

Windows 10 1809+ consoles (Windows Terminal, conhost via ConPTY) understand VT sequences only after `SetConsoleMode` enables `ENABLE_VIRTUAL_TERMINAL_PROCESSING` on the output handle; enable `ENABLE_VIRTUAL_TERMINAL_INPUT` on input to receive VT key sequences. If enabling fails, you are on a legacy console: use a backend with the classic Console API (tcell, crossterm, and Textual's Windows driver handle this) or fall back to plain mode. Restore the original console modes on exit. Expect weaker glyph coverage, no job control, and different signals (Ctrl-C/Ctrl-Break events instead of SIGTERM/SIGHUP). On Python without a framework, `colorama.just_fix_windows_console()` enables VT output.

**Verify:** Grep for `SetConsoleMode` / `ENABLE_VIRTUAL_TERMINAL_PROCESSING` or a cross-platform backend. Run the app in Windows Terminal, in classic conhost (`conhost.exe mytool`), and in VS Code's terminal on Windows; confirm rendering, input, and restoration in each.

### TUI-TRM-012: Test across a matrix of terminals before release

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** original

Compatibility bugs come from the combination of terminal, multiplexer, OS, and font. Before each release, exercise startup, a full keyboard flow, resize, mouse (if supported), and exit in the terminals listed in the matrix above, at minimum one VTE terminal, one modern GPU terminal, tmux, Windows Terminal, and the VS Code integrated terminal. Record the matrix and known issues in the docs. Automated pty tests ([TESTING.md](TESTING.md)) catch logic regressions but not terminal-specific rendering.

**Verify:** Check release docs or CI notes for a terminal matrix and its last run. Spot-check the app in two terminals not used by the developer day to day.

### TUI-TRM-013: Treat OSC 8 hyperlinks as optional with a visible fallback

- **Level:** consider
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda>

OSC 8 (`ESC]8;;URL ESC\text ESC]8;; ESC\`) makes text clickable in terminals that support it; others show only the text. Because support cannot be reliably detected, always keep the URL discoverable without clicking (print it, show it in a details pane, or provide a copy/open key), allow disabling hyperlinks in config, and never emit OSC 8 when output is not a TTY. Sanitize URLs from untrusted sources before embedding them.

**Verify:** Grep for `]8;;` and confirm a config switch and TTY check gate it. Run in a terminal without OSC 8 support (for example the Linux console or `screen`) and confirm no stray characters appear and the URL is still obtainable.

### TUI-TRM-014: Treat OSC 52 clipboard writes as optional with a fallback

- **Level:** consider
- **Severity:** low
- **Check:** static, manual
- **Source:** <https://invisible-island.net/xterm/ctlseqs/ctlseqs.html>

OSC 52 (`ESC]52;c;BASE64 ESC\`) lets a remote TUI set the local clipboard, but many terminals disable it or cap the payload size, tmux needs `set-clipboard on`, and the app gets no confirmation. Offer it as one strategy alongside native clipboard tools (`pbcopy`, `wl-copy`, `xclip`, `clip.exe`), say "copied (via terminal)" rather than claiming success, and show the text for manual selection when no method is available. Never read the clipboard via OSC 52 queries without explicit user action.

**Verify:** Grep for `]52;` and native clipboard tool invocations. Copy in a terminal with OSC 52 disabled and confirm the app reports a fallback instead of silently failing.

### TUI-TRM-015: Leave a useful final message on the primary screen

- **Level:** consider
- **Severity:** low
- **Check:** probe, manual
- **Source:** original

The alternate screen disappears on exit, so anything the user needs afterward (the selected item, the path of a saved file, an error summary, a resume command) must be printed to the primary screen after teardown. Print to stdout only data the user asked for (so `cd "$(mytool)"`-style use works) and print status and errors to stderr. Inline (non-alt-screen) UIs should leave their final state rendered rather than erasing it, or collapse to a one-line summary.

**Verify:** Complete a task and quit; confirm a concise result or error summary remains visible in the shell scrollback. Run `out=$(mytool)` with a selection made and confirm `$out` contains only the result.
