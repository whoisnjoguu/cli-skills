# Architecture

How to structure a terminal UI program so it stays responsive, testable and recoverable: application model, state ownership, the event loop, background work, memory bounds, startup, error surfaces and logging. Load this before scaffolding a new TUI or when auditing one that freezes, flickers, leaks memory or is hard to test. Basic CLI behavior (flags, exit codes, streams, non-TTY fallback) is covered in [CLI-BASELINE.md](CLI-BASELINE.md).

## Choosing an application model

| Model | Examples | Fits well when | Watch out for |
| --- | --- | --- | --- |
| Elm / MVU (model-update-view) | Bubble Tea (Go), Ratatui with the TEA pattern (Rust), Elm-style apps in any language | Most apps; state is explicit, updates are pure, easy to unit test | Boilerplate for message types; nested components need message routing |
| Retained widget tree | Textual (Python), tview (Go), urwid, Cursive | Form-heavy or document-like UIs, built-in focus and layout | State scattered across widgets; keep domain state outside the tree |
| React-style components | Ink (Node), Textual's reactive attributes | Teams fluent in React; inline, short-lived UIs | Re-render cost on large lists; hooks hiding side effects |
| Immediate mode | Raw Ratatui `draw` loop, termbox/tcell loops | Dashboards and monitors that redraw every tick | Without discipline, state and I/O leak into draw code |

Pick one model and apply it consistently. Mixing (for example, widgets that own state plus a global model that also owns it) is the most common source of desynchronized UIs.

## Event loop

```
          +-------------------- messages ---------------------+
          |                                                   |
 input ---+--> [ event queue ] --> update(state, msg) --> new state --> view(state) --> diff --> terminal
 resize --+                              |
 timers --+                              +--> commands (I/O, timers, subprocesses)
                                                      |
                                       background tasks, results posted as messages
```

The loop owns the state. Only `update` mutates it, only `view` reads it to produce a frame, and anything slow runs as a command whose result returns as another message.

```go
// Bubble Tea v1 API (v2: match tea.KeyPressMsg; see FRAMEWORKS.md)
type model struct{ items []Item; loading bool; err error }
type itemsLoaded struct{ items []Item; err error }

func (m model) Init() tea.Cmd { return loadItems } // first frame renders before data arrives

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case itemsLoaded:
        m.loading, m.items, m.err = false, msg.items, msg.err
    case tea.KeyMsg:
        if msg.String() == "r" { m.loading = true; return m, loadItems }
    }
    return m, nil
}

func loadItems() tea.Msg { items, err := api.List(); return itemsLoaded{items, err} } // runs off the UI goroutine
```

## Rules

### TUI-ARC-001: Use one explicit application model and keep it consistent

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://guide.elm-lang.org/architecture/>

Choose MVU, a retained widget tree, React-style components or immediate mode deliberately (see the table above) and structure the whole app around it. MVU is the safest default: state, transitions and rendering are separate and individually testable. Do not hand-roll an ad hoc loop that mixes reading keys, fetching data and printing escape codes in one function.

**Verify:** Identify the framework and loop in the entry point. Flag code that writes escape sequences or calls `print`/`fmt.Print` directly from event handlers, or components that bypass the framework's update/render cycle.

### TUI-ARC-002: Keep a single source of truth for application state

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** original

Hold domain and UI state (selection, scroll offset, active pane, filter text, loading flags) in one model, or in a clearly owned tree of models, mutated only through the update path. Widgets may cache derived values but must not be the only holder of facts the rest of the app needs. Duplicate copies of the same data (for example a list in the model and a separately mutated copy in a widget) drift and produce stale or contradictory screens.

**Verify:** Search for global mutable variables, and for the same collection stored in both the model and a widget. Check that background tasks never mutate state directly but send messages.

### TUI-ARC-003: Render as a pure function of state

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

The view/draw function must read state and return or paint a frame, nothing else: no I/O, no network calls, no mutation, no timers started. Rendering may run many times per second and at arbitrary moments (resize, focus, ticks), so side effects in it cause duplicate requests, races and flicker. Pure views also make snapshot testing trivial.

**Verify:** Read every `View`, `render`, `draw` and `compose` method. Flag file, network or subprocess calls, state assignments, `time.Now()`-dependent logic that is not passed in through state, and logging on every frame.

### TUI-ARC-004: Never block the event loop

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** original

Run network requests, disk scans, subprocesses, database queries and any computation that can exceed a few milliseconds in a background task (Bubble Tea `tea.Cmd`, a Tokio task or thread plus channel in Ratatui, Textual workers/`run_worker`, async effects in Ink). Deliver results to the loop as messages. A blocked loop stops reading input, so the UI ignores keys, including quit, and cannot repaint on resize. Show a loading indicator while the work is pending.

**Verify:** Grep update/key handlers for synchronous I/O (`http.Get`, `requests.`, `fs.readFileSync`, `std::fs::read`, `exec.Command(...).Run`, `subprocess.run`). Manually trigger a slow operation (for example on a throttled network) and confirm the UI still scrolls and quits with `q`.

### TUI-ARC-005: Make in-flight work cancellable and discard stale results

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

When the user navigates away, changes a filter, or quits, cancel the work started for the old context (context cancellation in Go, `CancellationToken`/dropping a `JoinHandle` in Rust, `Worker.cancel()` in Textual, `AbortController` in Node). Tag requests with an ID or generation number and ignore results whose tag no longer matches, so a slow earlier response cannot overwrite a newer one. Quitting must not wait on unbounded background work.

**Verify:** Check that background tasks receive a context/token and that result messages carry a request ID compared against current state. Manually change selection quickly while results load and confirm the final screen matches the final selection; quit during a load and confirm exit is immediate.

### TUI-ARC-006: Debounce or throttle rapid events

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Do not trigger expensive work on every keystroke, resize event or file-watch notification. Debounce search-as-you-type and resize-driven reflows (for example 100-250 ms after the last event), and throttle high-frequency streams (log tails, metrics) to a bounded update rate. Coalesce many pending events into one state change where possible.

**Verify:** Find handlers for filter input, resize and watcher events; confirm a debounce timer or rate limiter. Manually type quickly into a filter over a large dataset or drag-resize the window and confirm no backlog of work or visible lag.

### TUI-ARC-007: Bound memory for logs, streams and large datasets

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** original

Any buffer fed by an unbounded source (log tail, event stream, command output, history) must have a cap: use a ring buffer or drop the oldest lines past a configurable limit, and say so in the UI (for example "showing last 10,000 lines"). For large but finite data, virtualize lists and tables: build and render only the visible rows plus a small margin, not a widget per item. Long-running monitors like htop or k9s run for days; an unbounded slice is a slow memory leak.

**Verify:** Find every append to a collection fed by a stream and confirm a size limit. Check list/table construction for per-item widget creation over full datasets. Run against a high-volume source (for example `yes | head -n 1000000` piped in, or a chatty log) and watch RSS stay flat.

### TUI-ARC-008: Separate domain logic from UI code

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Put data access, parsing, business rules and side-effecting operations in a package or module with no dependency on the TUI framework. The UI layer translates key presses into calls on that layer and renders its results. This allows unit tests without a terminal, reuse by the non-interactive CLI (TUI-ARC-013), and swapping UI frameworks. Test the update function with plain messages and the view with snapshot/golden tests (for example `teatest`, Ratatui `TestBackend`, Textual `run_test`/`pilot`).

**Verify:** Check imports: domain modules must not import the TUI framework. Confirm tests exist for update/state transitions and at least one view snapshot test.

### TUI-ARC-009: Render the first frame fast and load lazily

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** original

Show a usable frame (layout, header, loading state) within about 100 ms of launch, then load data in the background and fill views as results arrive. Defer loading of panes, tabs and details until they are first shown. Avoid heavy synchronous initialization (full repository scans, network handshakes, large config parsing) before the loop starts.

**Verify:** Inspect startup code for blocking work before the program/loop is started. Run the app in a slow context (large repo, cold cache, slow network) and observe that a frame with a loading indicator appears immediately.

### TUI-ARC-010: Surface non-fatal errors inside the UI

- **Level:** must
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Errors from a single operation (a failed request, a permission-denied file, a bad filter regex) must not crash the app or print raw text over the screen. Store them in state and show them in a status bar, toast or inline in the affected view, with what failed and what the user can do (retry key, fix the input). Keep the error visible long enough to read, or until dismissed, and keep a history the user can reopen if errors are frequent.

**Verify:** Grep for `panic`, `log.Fatal`, `unwrap()`, `process.exit`, `sys.exit` and uncaught exceptions in handlers of recoverable operations. Manually cause a failure (disconnect network, point at an unreadable file) and confirm a readable in-UI message with the app still usable.

### TUI-ARC-011: Restore the terminal before reporting fatal errors

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

On fatal errors, panics, uncaught exceptions and signals (SIGINT, SIGTERM, SIGHUP), restore the terminal first: leave the alternate screen, show the cursor, disable raw mode, mouse reporting and bracketed paste, and reset attributes. Then print the error to stderr and exit non-zero. Install this as a panic hook / deferred cleanup / `finally` / `atexit`, not only on the happy path, or a crash leaves the user's shell unusable and the message hidden on the alternate screen.

```rust
let default_hook = std::panic::take_hook();
std::panic::set_hook(Box::new(move |info| {
    let _ = ratatui::restore(); // leave alt screen, disable raw mode
    default_hook(info);
}));
```

**Verify:** Confirm a panic hook or equivalent cleanup is registered before entering raw mode. Probe with `timeout --foreground -s TERM 2 mytui; echo; stty -a | grep -o -- '-icanon\|icanon'` (should show `icanon`, i.e. cooked mode) and confirm the cursor is visible and the prompt is not garbled. Trigger a fatal error and check that the message appears on the primary screen.

### TUI-ARC-012: Log to a file, never to the screen

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

In a TUI, stdout (and usually stderr, which shares the terminal) is the canvas. Any stray `print`, `console.log`, `fmt.Println` or default logger writing to the terminal corrupts the frame. Send diagnostics to a log file (for example under `$XDG_STATE_HOME/<app>/` or a path from `--log-file` / an env var), off by default or at a low level, and make the path discoverable in `--help`. Frameworks offer helpers: `tea.LogToFile`, Textual's devtools console, `tracing-appender` in Rust.

**Verify:** Grep UI code for direct printing and for loggers configured with stdout/stderr outputs. Run the app with debug logging enabled and confirm no log text appears on screen and the log file is written.

### TUI-ARC-013: Provide a non-interactive counterpart for essential actions

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Everything a user must be able to do (list, inspect, create, delete, apply) should also be reachable as a plain subcommand or flag that prints machine-readable output and needs no TTY, for example `mytool list --json` next to the interactive `mytool`. TUIs cannot be scripted, piped or used in CI; without a counterpart, users resort to screen scraping. Implement both on the shared domain layer (TUI-ARC-008). See [CLI-BASELINE.md](CLI-BASELINE.md) for non-TTY behavior.

**Verify:** List the TUI's primary actions and check each has a subcommand or flag. Probe with `mytool <subcommand> --json </dev/null | cat` and confirm it completes without opening the interface.
