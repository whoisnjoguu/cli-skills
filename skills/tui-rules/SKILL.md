---
name: tui-rules
description: Design, build, and review terminal user interfaces (full-screen or inline interactive terminal apps built with Bubble Tea, Ratatui, Textual, Ink, tview, prompt libraries, and similar). Use when creating a TUI, adding views, keybindings, layouts, themes, or interactive prompts, choosing a TUI framework, fixing rendering, resize, color, or terminal-restore bugs, or auditing a TUI for usability, accessibility, and terminal compatibility. Run the full audit workflow only when the user explicitly asks for an audit or review report.
license: CC-BY-SA-4.0 (docs) and MIT (scripts). See LICENSE.txt
metadata:
  author: whoisnjoguu
  version: "0.1.0"
  repository: https://github.com/whoisnjoguu/cli-skills
---

# TUI design

Build terminal UIs that feel fast, are learnable on first launch, never wreck the user's terminal, and still behave like good command-line citizens. Every rule has a stable ID, a level, a default severity, and a **Verify** step.

A TUI is a CLI first. Its flags, `--help`, `--version`, exit codes, and non-TTY behavior follow the CLI baseline in [CLI-BASELINE.md](CLI-BASELINE.md), which restates the relevant rules from the companion `cli-rules` skill (based on [clig.dev](https://clig.dev)).

## Operating modes

This skill is guidance by default. Loading it does not authorize scaffolding a project, running the target, or writing report files.

- **Guidance mode** (default): answer design questions, review code, or fix specific behavior. Load only the relevant companion files and cite rule IDs.
- **Build mode**: the user asks you to create a TUI or a substantial new view or interaction. Follow [Build workflow](#build-workflow).
- **Audit mode**: the user explicitly asks to audit, review, or grade a TUI, or requests a report. Follow [AUDIT.md](AUDIT.md) and produce `findings.json` and `REPORT.md`.

If a request could mean more than one mode, ask one short question before creating files.

**Parent** means the coordinating agent, which owns shared files. **Sub-agent** means the platform's delegation mechanism. If your platform has none, do delegated steps yourself, in order.

## Where to look

| Topic | File | Rule IDs |
|---|---|---|
| CLI behavior every TUI needs: help, version, exit codes, streams, non-TTY, config | [CLI-BASELINE.md](CLI-BASELINE.md) | CLI-* |
| App models (MVU, retained, React-style), state, async work, cancellation, logging, startup | [ARCHITECTURE.md](ARCHITECTURE.md) | TUI-ARC |
| Alternate screen vs inline, resize, minimum size, flicker-free rendering, Unicode width, sanitizing untrusted text | [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md) | TUI-LAY |
| Quit/back/help keys, key hints, vim + arrows, focus, reserved keys, bracketed paste, mouse, remapping | [INPUT-AND-KEYBINDINGS.md](INPUT-AND-KEYBINDINGS.md) | TUI-INP |
| Color depth, `NO_COLOR`, themes, light and dark backgrounds, contrast, color-independence, motion, screen readers, glyph fallbacks | [COLOR-AND-ACCESSIBILITY.md](COLOR-AND-ACCESSIBILITY.md) | TUI-CLR, TUI-ACC |
| Restoring the terminal, signals, suspend/resume, capability detection, tmux, SSH, Windows, OSC 8/52 | [TERMINAL-COMPAT.md](TERMINAL-COMPAT.md) | TUI-TRM |
| Case studies (lazygit, k9s, btop, fzf, htop, Helix) and layout patterns (list-detail, dashboard, log viewer, picker, modal) | [EXEMPLARS.md](EXEMPLARS.md) | none |
| Framework comparison and selection (Go, Rust, Python, Node, C/C++) | [FRAMEWORKS.md](FRAMEWORKS.md) | none |
| Testing: state, frame snapshots, sizes, key flows, restoration, pty in CI | [TESTING.md](TESTING.md) | TUI-TST |
| Audit workflow, severity rubric, report template | [AUDIT.md](AUDIT.md) | none |

Machine-readable assets:

- [checklist.json](checklist.json) lists every rule, including the CLI baseline. It is generated from the markdown, so never edit it by hand.
- [report-schema.json](report-schema.json) is the `findings.json` contract.
- [validate-findings.cjs](validate-findings.cjs) checks `findings.json` against the schema and the checklist (Node.js, no dependencies).
- [probe-cli.cjs](probe-cli.cjs) checks the non-interactive entry points (`--help`, `--version`, piped, `NO_COLOR`, no TTY) safely (Node.js, no dependencies).

## Core principles

1. **Never wreck the terminal.** Restore raw mode, the alternate screen, cursor, mouse, and keyboard modes on every exit path: quit, error, panic, and signal ([TERMINAL-COMPAT.md](TERMINAL-COMPAT.md)).
2. **Learnable at a glance.** `q` quits, `?` shows help, Esc backs out, and key hints are always visible. Arrow keys always work, with vim keys added rather than substituted ([INPUT-AND-KEYBINDINGS.md](INPUT-AND-KEYBINDINGS.md)).
3. **Responsive.** The first frame appears in about 100 ms and the event loop never blocks. Slow work runs in the background, can be cancelled, and has visible loading states ([ARCHITECTURE.md](ARCHITECTURE.md)).
4. **Respect the user's terminal.** Use their palette and background, honor `NO_COLOR`, degrade with color depth, and require no special fonts ([COLOR-AND-ACCESSIBILITY.md](COLOR-AND-ACCESSIBILITY.md)).
5. **Adapt to the space.** Handle resize, define a minimum size, measure text by display width, and never trust that data is free of escape sequences ([LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md)).
6. **Scriptable counterpart.** Everything essential can be done without the UI, through flags, subcommands, and `--json` ([CLI-BASELINE.md](CLI-BASELINE.md)).
7. **Accessible.** Never use color as the only signal, keep focus visible, reduce motion on request, and provide a plain mode.

## Build workflow

1. **Clarify** the essentials: what the user does in the app (the core loop), inline vs full-screen, target platforms (Windows?), expected data sizes, and whether a non-interactive mode is needed (it almost always is).
2. **Pick a framework** with [FRAMEWORKS.md](FRAMEWORKS.md), and a model with [ARCHITECTURE.md](ARCHITECTURE.md). Prefer a framework that restores the terminal for you and has a test harness.
3. **Sketch the screens** before coding, starting from the closest pattern in [EXEMPLARS.md](EXEMPLARS.md#patterns): regions (header, body, status bar, key-hint bar), each view's loading, empty, and error states, the minimum size, and the keymap ([INPUT-AND-KEYBINDINGS.md](INPUT-AND-KEYBINDINGS.md#conventional-keymap)). Share the sketch when the design is non-trivial.
4. **Implement the CLI shell first**: argument parsing, `--help`, `--version`, a TTY check with fallback, config, and logging to a file ([CLI-BASELINE.md](CLI-BASELINE.md)).
5. **Implement the UI** to the baseline below.
6. **Write tests** from [TESTING.md](TESTING.md): state updates, frame snapshots at several sizes including the minimum, key flows, and terminal restoration after a panic.
7. **Self-check.** Run `node <skill-dir>/probe-cli.cjs -- <tool>` and fix every `fail`. Then run the app in a real terminal: resize below the minimum, press Ctrl-Z then `fg`, force an error, and press Ctrl-C. Confirm the terminal is intact after each.

### Baseline for every new TUI

| Concern | Do this | Rules |
|---|---|---|
| Restore | Restore the terminal on quit, error, panic, and SIGINT/SIGTERM/SIGHUP. Print crash output after restoring. | [TUI-TRM-001](TERMINAL-COMPAT.md#tui-trm-001-restore-the-terminal-on-every-exit-path), [TUI-TRM-002](TERMINAL-COMPAT.md#tui-trm-002-restore-the-terminal-before-printing-panic-or-crash-output), [TUI-TRM-003](TERMINAL-COMPAT.md#tui-trm-003-handle-sigint-sigterm-and-sighup-by-restoring-and-exiting) |
| No TTY | Refuse with a clear message or fall back to plain output. Never hang. | [TUI-TRM-005](TERMINAL-COMPAT.md#tui-trm-005-refuse-or-fall-back-when-stdin-or-stdout-is-not-a-terminal), [CLI-INT-001](CLI-BASELINE.md#cli-int-001-prompt-only-when-stdin-is-a-tty) |
| Keys | `q`/Ctrl-C quit, Esc backs out, `?` opens help, key hints always visible. | [TUI-INP-001](INPUT-AND-KEYBINDINGS.md#tui-inp-001-quit-with-q-and-ctrl-c), [TUI-INP-002](INPUT-AND-KEYBINDINGS.md#tui-inp-002-make-esc-back-out-never-quit-unexpectedly), [TUI-INP-003](INPUT-AND-KEYBINDINGS.md#tui-inp-003-open-a-help-overlay-with-), [TUI-INP-004](INPUT-AND-KEYBINDINGS.md#tui-inp-004-show-context-sensitive-key-hints-at-all-times) |
| Event loop | No blocking I/O on the UI thread. Make work cancellable and discard stale results. | [TUI-ARC-004](ARCHITECTURE.md#tui-arc-004-never-block-the-event-loop), [TUI-ARC-005](ARCHITECTURE.md#tui-arc-005-make-in-flight-work-cancellable-and-discard-stale-results) |
| Logging | Log to a file and never to the screen. | [TUI-ARC-012](ARCHITECTURE.md#tui-arc-012-log-to-a-file-never-to-the-screen) |
| Resize | Re-layout on resize and show a "terminal too small" message below the minimum. | [TUI-LAY-003](LAYOUT-AND-RENDERING.md#tui-lay-003-re-layout-on-terminal-resize), [TUI-LAY-004](LAYOUT-AND-RENDERING.md#tui-lay-004-show-a-clear-message-when-the-terminal-is-too-small) |
| Text | Measure by display width. Strip control and escape sequences from untrusted data. | [TUI-LAY-009](LAYOUT-AND-RENDERING.md#tui-lay-009-measure-text-by-display-width-not-bytes-or-code-points), [TUI-LAY-010](LAYOUT-AND-RENDERING.md#tui-lay-010-sanitize-control-characters-and-escape-sequences-in-displayed-data) |
| States | Every view has a loading, an empty, and an error state. | [TUI-LAY-014](LAYOUT-AND-RENDERING.md#tui-lay-014-design-loading-empty-and-error-states-for-every-view) |
| Color | Detect depth and degrade. Honor `NO_COLOR`. Never use color as the only signal. | [TUI-CLR-002](COLOR-AND-ACCESSIBILITY.md#tui-clr-002-degrade-colors-to-the-detected-depth), [TUI-CLR-003](COLOR-AND-ACCESSIBILITY.md#tui-clr-003-honor-no_color-in-the-full-screen-ui-and-keep-focus-visible), [TUI-ACC-001](COLOR-AND-ACCESSIBILITY.md#tui-acc-001-never-convey-information-by-color-alone) |
| Paste | Enable bracketed paste and treat pasted text as data. | [TUI-INP-012](INPUT-AND-KEYBINDINGS.md#tui-inp-012-enable-bracketed-paste-and-treat-pasted-text-as-data) |
| CLI shell | `--help` and `--version` without entering the UI. Exit codes. A scriptable counterpart for essential actions. | [CLI-HLP-001](CLI-BASELINE.md#cli-hlp-001-show-full-help-for--h-and---help-including-on-subcommands), [CLI-DST-004](CLI-BASELINE.md#cli-dst-004-provide---version-output-that-includes-build-information), [TUI-ARC-013](ARCHITECTURE.md#tui-arc-013-provide-a-non-interactive-counterpart-for-essential-actions) |

## Anti-patterns

- Leaving the terminal in raw mode or on the alternate screen after a panic, so the user has to type `reset`.
- `fmt.Println`/`print()` debugging while the UI runs, which garbles the screen.
- Hardcoded background colors and truecolor-only themes that become unreadable on light terminals or over SSH.
- Vim-only navigation, or `q` doing something other than quitting or closing.
- Blocking network calls in `update`/key handlers, which freeze the UI.
- `len(s)` for layout, which breaks on CJK, emoji, and combining characters.
- Rendering untrusted strings (log lines, filenames, API data) without stripping escape sequences.
- Binding destructive actions to single keys next to navigation keys, without confirmation.
- Requiring a Nerd Font or mouse for any essential function.
- A full-screen UI as the only way to do something scriptable.

## Attribution

The CLI baseline and rules marked with a clig.dev source are adapted from the [Command Line Interface Guidelines](https://clig.dev) by Aanand Prasad, Ben Firshman, Carl Tashian, and Eva Parish, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Rules marked `original` are new to this skill. This skill's documentation is licensed CC BY-SA 4.0 and its scripts MIT; see [LICENSE.txt](LICENSE.txt).
