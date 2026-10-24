# Frameworks

Comparison of widely used TUI frameworks and prompt libraries by language: rendering model, strengths, terminal-restore behavior, testing support, and Windows support. Load this when choosing a stack for a new TUI or when auditing an existing one and you need to know what the framework already handles. Restore and compatibility requirements are in [TERMINAL-COMPAT.md](TERMINAL-COMPAT.md); test tooling details are in [TESTING.md](TESTING.md). Verify versions and maintenance status at adoption time; this ecosystem moves quickly.

## Comparison

| Framework | Language | Model | Restores terminal on panic/exception | Testing support | Windows |
| --- | --- | --- | --- | --- | --- |
| Bubble Tea (+ Bubbles, Lip Gloss, Huh) | Go | MVU (Elm Architecture) | Yes, in the event loop (opt out with `WithoutCatchPanics`) | teatest (experimental), plain `Update` unit tests | Yes |
| tview | Go | Retained widget tree on tcell | Yes, `Application.Run` finalizes the screen before re-panicking | tcell simulation screen | Yes |
| tcell | Go | Low-level cell buffer | No, you call `Fini` (recover pattern documented) | `SimulationScreen` | Yes |
| Ratatui | Rust | Immediate mode | Yes with `ratatui::init` (panic hook) | `TestBackend` + insta | Yes (crossterm, termwiz backends) |
| Cursive | Rust | Retained views with callbacks | Backend-dependent; add a panic hook | Limited; test logic separately, drive via pty | Yes with crossterm backend |
| Textual | Python | Retained widget DOM, CSS, async, reactive attributes | Yes | Pilot (`App.run_test`), pytest-textual-snapshot | Yes |
| prompt_toolkit | Python | Retained layout; prompts or full-screen `Application` | Yes, on exit and exceptions inside the app | Pipe input + `DummyOutput` | Yes |
| urwid | Python | Retained widgets, `MainLoop` | Yes for exceptions in the loop | Canvas rendering to text | Unix-first; check current status |
| Rich (`Live`) | Python | Render-and-replace live region (not a full TUI) | Yes via context manager | Record/export console output | Yes |
| Ink | Node | React components | Yes on normal exit; add handlers for uncaught errors | ink-testing-library | Yes |
| blessed / neo-blessed | Node | Retained widget tree | Partial | Little | Partial |
| ncurses | C | Retained virtual screen, `refresh` | No, you call `endwin` | Little; drive via pty | Via PDCurses/PDCursesMod |
| notcurses | C (C++, Rust, Python bindings) | Planes (retained) with rich graphics | Yes, installs signal handlers by default | Little | Partial |
| FTXUI | C++ | Functional/declarative components (React-like) | Yes on normal exit and signals | Render to `Screen` and `ToString()` | Yes |

## Go

**Bubble Tea** (v1 `github.com/charmbracelet/bubbletea`; v2 `charm.land/bubbletea/v2`). Model-Update-View: `Update(msg)` returns a new model plus a command, and `View()` renders the frame. Pure state transitions make unit testing easy, and commands keep I/O out of `Update`. Runs inline by default with opt-in alternate screen, supports mouse, bracketed paste, focus reporting, and suspend (`tea.Suspend`).

The major versions differ in ways that matter when reading code or examples:

| Concern | v1 | v2 |
|---|---|---|
| `View()` returns | `string` | `tea.View` (content plus terminal state) |
| Alternate screen | `tea.WithAltScreen()` option or `tea.EnterAltScreen` command | `v.AltScreen = true` in `View()` |
| Mouse | `tea.WithMouseCellMotion()` | `v.MouseMode = tea.MouseModeCellMotion` |
| Key presses | `tea.KeyMsg` struct, `msg.Type`, `msg.Runes` | `tea.KeyPressMsg`, `msg.Code`, `msg.Text` (`tea.KeyMsg` is now an interface covering press and release) |
| Paste | `tea.KeyMsg` with `msg.Paste` set | `tea.PasteMsg` |
| Test harness | `github.com/charmbracelet/x/exp/teatest` | `github.com/charmbracelet/x/exp/teatest/v2` |

Go examples in this skill use the v1 API unless marked otherwise; `msg.String()` matching (for example `"ctrl+c"`) works in both. When auditing, check `go.mod` for the major version before judging an API call. The official [v2 upgrade guide](https://github.com/charmbracelet/bubbletea/blob/main/UPGRADE_GUIDE_V2.md) lists every change.

Panics in your own goroutines are not recovered; see TUI-TRM-002. Companion libraries: **Bubbles** (list, table, viewport, textinput, spinner, help/keymap), **Lip Gloss** (styles, layout, color-profile detection and downsampling), **Huh** (forms and prompts, with an accessible mode that falls back to plain sequential prompts).

**tview**. Batteries-included retained widgets (tables, trees, forms, flex/grid layouts, modals) built on tcell. Fast to build admin-style UIs; less control over rendering and harder to unit-test than MVU. Tests can inject a `tcell.SimulationScreen` via `Application.SetScreen`.

**tcell**. Low-level screen and input library: cell buffer, colors with downsampling, mouse, paste, Windows console support. Use directly for custom rendering engines or games; otherwise prefer a higher layer. Call `screen.Fini()` on every exit path.

## Rust

**Ratatui**. Immediate-mode: each frame you call `terminal.draw(|frame| ...)` and render widgets from current state; Ratatui diffs buffers and writes only changes. Backends: **crossterm** (default, cross-platform), **termion** (Unix only), **termwiz** (cross-platform). `ratatui::init()` enables raw mode and the alternate screen and installs a panic hook that restores; pair with `ratatui::restore()`. Event handling, async, and app architecture are up to you (common patterns: TEA-style update function, component trait). `TestBackend` renders into an in-memory buffer for snapshot tests.

**Cursive**. Retained views with callbacks, built-in dialogs, menus, and layouts; feels like a desktop toolkit. Supports several backends (crossterm, ncurses, pancurses, termion); choose crossterm for Windows. Less suited to highly custom rendering; test business logic outside the view tree.

## Python

**Textual**. Retained widget tree styled with CSS, async message passing, reactive attributes, and many built-in widgets (DataTable, Tree, Input, TextArea, Markdown). Handles terminal setup/restore, color detection, `NO_COLOR`, animations level (`TEXTUAL_ANIMATIONS`), and themes. Supports inline mode (`app.run(inline=True)`) and serving in a browser. Best-in-class testing: `App.run_test()` returns a `Pilot` to press keys, click, and resize; pytest-textual-snapshot compares SVG screenshots.

**prompt_toolkit**. Powers interactive REPLs (IPython, ptpython) and prompts; also builds full-screen apps via `Application(full_screen=True)` with a layout of containers and controls. Excellent line editing, completion, key bindings (Emacs/Vi), and Windows support. Test by feeding `create_pipe_input()` and rendering to `DummyOutput`.

**urwid**. Mature retained widget library with its own event loops (select, asyncio, Trio, Twisted). Stable but older API style; Unix-first. Good for maintaining existing apps; for new projects, compare with Textual.

**Rich**. Not a TUI framework: rich text, tables, syntax highlighting, progress bars, and `Live` regions that redraw in place. No input handling or focus. Use it for progress and live dashboards in otherwise line-oriented CLIs; move to Textual (built on Rich) when you need interaction.

## Node

**Ink**. React renderer for the terminal: components, hooks (`useInput`, `useFocus`, `useApp`), Flexbox layout via Yoga. Renders inline below the prompt by default, which suits CLIs with live output (it is used by several well-known developer CLIs). Restore and exit via `useApp().exit()`; add `uncaughtException`/signal handlers that unmount. Test with ink-testing-library (`render`, `lastFrame`, `stdin.write`).

**blessed / neo-blessed**. Full widget toolkit with curses-like screen management. The original blessed has been unmaintained for years and the neo-blessed fork has also seen little activity; expect open bugs, especially on Windows and with modern terminals. Avoid for new projects unless you are prepared to maintain a fork.

## C and C++

**ncurses**. The classic: terminfo-driven, ubiquitous on Unix, stable ABI. Low-level API (`initscr`, windows, `wrefresh`, `endwin`); you must restore on signals and errors yourself. Windows requires PDCurses/PDCursesMod. Wide-character support requires the `ncursesw` variant and `setlocale`.

**notcurses**. Modern C library with planes, true color, multimedia/bitmap graphics across protocols, and bindings for C++, Rust, and Python. Installs signal handlers that restore the terminal unless disabled. Heavier dependency; Windows support is partial.

**FTXUI**. C++ functional, declarative DOM of elements plus interactive components, with no dependencies beyond the standard library. Cross-platform including Windows and WebAssembly. Elements can be rendered to an off-screen `Screen` and converted with `ToString()` for tests.

## Inline prompt libraries

For one-off questions (confirm, select, text input, multi-select) inside a CLI, use a prompt library instead of a full-screen framework. They render inline, leave the answer in scrollback, and are easier to make accessible. Always provide flags so every prompt can be skipped non-interactively (see [CLI-BASELINE.md](CLI-BASELINE.md)).

| Library | Language | Notes |
| --- | --- | --- |
| Huh | Go | Forms and groups of fields; standalone or embedded in Bubble Tea; accessible mode |
| inquire | Rust | Text, select, multi-select, confirm, date, editor prompts with validation |
| dialoguer | Rust | Simple prompts and selects; pairs with indicatif for progress |
| questionary | Python | Prompts built on prompt_toolkit; supports async |
| @clack/prompts | Node | Styled grouped prompts with spinners and cancellation handling |

## Choosing

1. Need only a few questions or a progress display? Use an inline prompt library or Rich/Lip Gloss output, not a full-screen framework.
2. Pick the language the rest of the tool uses; shipping a second runtime costs more than any framework difference.
3. Go: Bubble Tea for custom, testable apps (lazygit-style or inline flows); tview for quick form/table admin UIs.
4. Rust: Ratatui for most apps (dashboards and git clients such as bottom and gitui are built on it); Cursive for dialog-heavy apps where retained widgets save effort.
5. Python: Textual for full apps (best testing story, CSS theming); prompt_toolkit for REPLs and line editing; Rich for live output without input.
6. Node: Ink for inline, React-style CLIs; avoid blessed for new work.
7. C/C++: FTXUI for new C++ apps; ncurses when you need minimal dependencies on Unix; notcurses for graphics-heavy apps.
8. Whatever you choose, confirm it restores the terminal on panics and signals, supports a headless test backend, and runs on every OS you ship to; fill any gaps using [TERMINAL-COMPAT.md](TERMINAL-COMPAT.md) and [TESTING.md](TESTING.md).
