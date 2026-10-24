# Testing TUIs

How to test a terminal UI at every level: pure state logic, rendered frames, end-to-end key flows in a real pseudo-terminal, terminal restoration, and degraded environments. Load this when adding tests to a TUI, setting up CI for one, or auditing test coverage. Framework capabilities are summarized in [FRAMEWORKS.md](FRAMEWORKS.md); the behaviors under test are defined in [TERMINAL-COMPAT.md](TERMINAL-COMPAT.md), [COLOR-AND-ACCESSIBILITY.md](COLOR-AND-ACCESSIBILITY.md), [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md), and [INPUT-AND-KEYBINDINGS.md](INPUT-AND-KEYBINDINGS.md).

## Test layers

| Layer | What it catches | Speed | Tools |
| --- | --- | --- | --- |
| State/update unit tests | Logic bugs, key-to-action mapping | ms | plain test runner |
| Frame snapshots | Layout, truncation, styling regressions | ms | TestBackend + insta, teatest golden files, pytest-textual-snapshot |
| Framework-driven flows | Multi-step interactions, focus | ms–s | teatest, Textual Pilot, ink-testing-library |
| Real pty end-to-end | Setup/teardown, signals, TTY detection, escape output | s | pexpect, expect, creack/pty, node-pty, tmux, VHS |
| Manual terminal matrix | Terminal-specific rendering and input | min | see [TERMINAL-COMPAT.md](TERMINAL-COMPAT.md) |

## Rules

### TUI-TST-001: Unit-test state transitions without a terminal

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Keep application state and transitions (update functions, reducers, action handlers) separate from rendering and terminal I/O so they can be tested by constructing a state, feeding an event or action, and asserting on the result. This is the fastest and most stable layer; most behavior should be tested here. Keep side effects (network, disk, timers) behind commands or interfaces that tests can stub.

```go
// Bubble Tea v1 API
m := model{items: []string{"a", "b"}}
next, _ := m.Update(tea.KeyMsg{Type: tea.KeyDown})
if got := next.(model).cursor; got != 1 {
	t.Fatalf("cursor = %d, want 1", got)
}
```

**Verify:** Look for tests that call update/handler functions directly with no terminal, pty, or backend. Grep test files for `Update(`, `handle_`, `dispatch`, or reducer calls; check that key handling logic is covered.

### TUI-TST-002: Snapshot-test rendered frames with deterministic inputs

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Render frames into an in-memory buffer at a fixed size and compare them to reviewed snapshots or golden files. Make output deterministic first: fix the clock, random seeds, IDs, and spinner frames; pin the color profile; use fixture data with stable ordering. Review snapshot diffs in code review like code, and never bulk-accept updates without looking.

```rust
#[test]
fn list_view_80x24() {
    let mut terminal = Terminal::new(TestBackend::new(80, 24)).unwrap();
    let app = App::with_fixture();
    terminal.draw(|frame| app.render(frame)).unwrap();
    insta::assert_snapshot!(terminal.backend());
}
```

**Verify:** Check for snapshot or golden files (`snapshots/`, `testdata/*.golden`, `__snapshots__/`) committed with the tests. Run the suite twice in a row and with a different `TZ` and locale; snapshots must not change.

### TUI-TST-003: Snapshot at several sizes including the minimum

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Layout bugs appear at edges. Snapshot each main screen at a common size (80x24), a large size (for example 200x50), the documented minimum, and one size below the minimum to check the "too small" message. Include narrow-and-tall and wide-and-short shapes when panes split responsively.

**Verify:** Inspect snapshot test parameters for multiple sizes including the minimum and a below-minimum case. Grep for the minimum size constant and confirm it is used in tests.

### TUI-TST-004: Test resize handling

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Send resize events mid-session (not only at startup) and assert that the layout reflows, scroll offsets and the selection stay valid, and nothing panics when shrinking to tiny sizes or 0x0. At the framework level, send the resize message or call the resize helper; at the pty level, change the window size (`pty.Setsize`, `child.setwinsize`, `tmux resize-window`) so the real SIGWINCH path runs. Resize behavior itself is specified in [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md).

```python
async with app.run_test(size=(80, 24)) as pilot:
    await pilot.press("end")
    await pilot.resize_terminal(30, 8)
    assert app.query_one(ItemList).cursor_visible
```

**Verify:** Grep tests for resize messages (`tea.WindowSizeMsg`, `resize_terminal`, `Setsize`, `setwinsize`, `resize-window`). Manually shrink the terminal to a few columns while the app runs and confirm no crash.

### TUI-TST-005: Test key binding flows end-to-end

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

For each primary task, script the keystrokes a user would type (navigate, open, edit, confirm, quit) and assert on the final state and visible output. Include cancel paths (Esc, `q` in a confirmation), modal focus changes, and bindings that differ by mode. Keep a test that every binding listed in the help overlay actually triggers its action, so help and keymap cannot drift apart.

**Verify:** Look for tests that send key sequences through the framework driver or a pty (`tm.Type`, `pilot.press`, `stdin.write`, `child.send`) and assert on results. Compare the help overlay's binding list with the bindings exercised in tests.

### TUI-TST-006: Test terminal restoration after panic and error

- **Level:** should
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Restoration code runs rarely, so it rots. In a real pty, run the app through a normal quit, an error exit, and a forced panic (via a test-only hook), and assert that terminal modes match the starting state and that the output ends with the disable sequences for every mode enabled (alternate screen, cursor, mouse, bracketed paste, keyboard flags). See TUI-TRM-001 and TUI-TRM-002 in [TERMINAL-COMPAT.md](TERMINAL-COMPAT.md).

```sh
script -qec 'stty -g > before; MYTOOL_TEST_PANIC=1 mytool; stty -g > after' /dev/null
cmp before after && echo restored
```

**Verify:** Look for a test that triggers a panic or exception in a pty and asserts on terminal state or trailing escape sequences. Run the snippet above (adapting the panic trigger) and confirm the files match.

### TUI-TST-007: Test signal and suspend paths

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

In a pty, send SIGTERM and SIGHUP to the running app and assert it exits promptly with restored state; send Ctrl-Z (byte 0x1A), confirm the process stops and the terminal is cooked, then SIGCONT and confirm the UI redraws. These paths depend on real process and terminal semantics, so framework-level drivers cannot cover them.

**Verify:** Grep pty tests for `SIGTERM`, `SIGHUP`, `SIGCONT`, `kill(`, or `\x1a`. Run the app in tmux, send `kill -TERM` from another pane, and inspect the pane with `tmux capture-pane -p`.

### TUI-TST-008: Test non-TTY and no-color paths

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://no-color.org>

Add tests that run the binary with stdout piped, stdin from `/dev/null`, `TERM=dumb`, and `NO_COLOR=1`, asserting it falls back or exits cleanly without hanging, emits no cursor-movement sequences when not on a TTY, and emits no color sequences under `NO_COLOR` while focus stays visible. The expected behaviors are in [CLI-BASELINE.md](CLI-BASELINE.md), TUI-TRM-005 and TUI-TRM-006, and TUI-CLR-003.

**Verify:** Look for tests running the binary in these environments. Run `mytool < /dev/null | cat` and `NO_COLOR=1 TERM=xterm-256color script -qec mytool out.log` and inspect output.

### TUI-TST-009: Test color depth and theme variants

- **Level:** consider
- **Severity:** low
- **Check:** static
- **Source:** original

Snapshot key screens with styles included (not just text) for each supported color profile (truecolor, 256, 16, none) and each built-in theme, including light and dark variants. Add a unit test that computes contrast ratios for built-in themes (TUI-CLR-008). Style-aware snapshots catch regressions such as a highlight disappearing in 16-color mode.

**Verify:** Check that snapshot tests pin and vary the color profile (for example a forced profile option, `COLORTERM`/`TERM` in test env) and include style information (SVG snapshots, styled buffer dumps, raw ANSI golden files).

### TUI-TST-010: Run interactive tests under a real pty in CI

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

CI runners usually provide no TTY, so a TUI either takes its non-interactive path or fails, leaving the interactive code untested. Allocate a pseudo-terminal in tests (pexpect, creack/pty, node-pty, tmux, or `script`), set an explicit `TERM` and window size, and run at least the smoke flow (start, navigate, quit) on every OS you ship, including Windows where ConPTY-based drivers are available.

```python
child = pexpect.spawn("mytool", dimensions=(24, 80),
                      env={**os.environ, "TERM": "xterm-256color"}, timeout=5)
child.expect("Items")
child.send("q")
child.expect(pexpect.EOF)
```

**Verify:** Inspect CI configuration for pty-based test steps (`script -qec`, `pexpect`, `tmux`, `creack/pty`, `node-pty`, `vhs`) and an OS matrix. Confirm those tests fail when the app crashes on startup.

### TUI-TST-011: Test Unicode and wide-character rendering

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Include fixtures with CJK text, emoji (including ZWJ sequences and flags), combining marks, right-to-left text, tabs, and control characters, and assert that columns stay aligned, truncation never splits a wide character, ellipses land in the right place, and borders are not shifted. Include data containing escape sequences to confirm they are sanitized (see [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md)).

**Verify:** Grep test fixtures for non-ASCII samples (`日本`, `👍`, `e\u0301`, `\x1b[`). Review snapshots of tables containing them for misaligned borders.

### TUI-TST-012: Bound every interactive test with a timeout

- **Level:** should
- **Severity:** high
- **Check:** static
- **Source:** original

A TUI test that waits for output that never comes hangs CI until the job limit. Give every expect/wait call and every pty session an explicit timeout, kill the child process on failure, and dump the last captured screen to the test log so failures are diagnosable.

**Verify:** Grep pty and framework-driven tests for timeouts (`timeout=`, `WithFinalTimeout`, `WaitFor` durations, `expect -timeout`); flag waits without one. Check that failure handlers print the captured screen.

## Tooling

#### Go: Bubble Tea teatest

`github.com/charmbracelet/x/exp/teatest` (experimental API; use `teatest/v2` with Bubble Tea v2) runs a Bubble Tea program against a virtual terminal of a fixed size, lets you send messages and type keys, wait for output, and compare final output against golden files (regenerate with `go test -update`).

```go
// Bubble Tea v1 API
tm := teatest.NewTestModel(t, initialModel(), teatest.WithInitialTermSize(80, 24))
tm.Send(tea.KeyMsg{Type: tea.KeyDown})
tm.Type("q")
out, _ := io.ReadAll(tm.FinalOutput(t, teatest.WithFinalTimeout(2*time.Second)))
teatest.RequireEqualOutput(t, out) // testdata/<TestName>.golden
```

For tview/tcell apps, inject `tcell.NewSimulationScreen("UTF-8")` and inspect its cell contents.

#### Rust: Ratatui TestBackend and insta

`ratatui::backend::TestBackend` renders into an in-memory buffer; its `Display` output works with `insta::assert_snapshot!`, and `TestBackend::assert_buffer` compares against an expected `Buffer` including styles. Run `cargo insta review` to accept changes. Drive event handling by calling your handler with constructed `crossterm::event::KeyEvent` values.

#### Python: Textual Pilot and pytest-textual-snapshot

`async with app.run_test(size=(80, 24)) as pilot:` runs the app headlessly; `pilot.press(...)`, `pilot.click(...)`, `pilot.resize_terminal(...)`, and `pilot.pause()` drive it, and you assert on `app` state or queried widgets. The pytest-textual-snapshot plugin provides a `snap_compare` fixture that saves SVG screenshots and shows visual diffs:

```python
def test_main_screen(snap_compare):
    assert snap_compare("app.py", press=["j", "enter"], terminal_size=(80, 24))
```

For prompt_toolkit, use `create_pipe_input()` with `DummyOutput`.

#### Node: ink-testing-library

`render(<App />)` returns `lastFrame()`, `frames`, `stdin.write()`, `rerender()`, and `unmount()`. Allow a tick for effects after writing input.

```tsx
const {lastFrame, stdin} = render(<App items={fixture} />);
stdin.write("j");
await new Promise((r) => setTimeout(r, 0));
expect(lastFrame()).toContain("> second");
```

#### Generic pty drivers

- **expect** (Tcl) and **pexpect** (Python): spawn in a pty, `expect` patterns, `send` keys, `setwinsize` for resize. Language-agnostic smoke tests for any binary.
- **creack/pty** (Go): `pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})`, then read/write the returned file; `pty.Setsize` triggers SIGWINCH.
- **node-pty** (Node): `spawn(file, args, {cols, rows, env})`, `onData`, `write`, `resize`; uses ConPTY on Windows.
- **tmux**: `tmux new-session -d -s t -x 80 -y 24 'mytool'`, `tmux send-keys -t t j Enter`, `tmux capture-pane -p -t t` (add `-e` to keep escape sequences); good for shell-level tests and debugging.
- **VHS** (charmbracelet): `.tape` scripts (`Type`, `Enter`, `Sleep`, `Set Width`) render demo GIFs/videos for docs and can write text output (`Output golden.txt`) for coarse visual regression in CI.
- **script** (util-linux): `script -qec 'cmd' log` gives any command a pty and records raw output; macOS/BSD syntax is `script -q log cmd`.
