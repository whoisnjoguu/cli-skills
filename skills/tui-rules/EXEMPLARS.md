# Exemplars and patterns

What good TUIs look like in practice. The first half studies six well-known apps and names the rules each one illustrates. The second half turns them into layout patterns you can start from. Load this when designing a new TUI, choosing a layout, or explaining a rule with a concrete example.

This file contains no rules; it only references them. The apps are described as of their 2026 releases and change over time, so check the current version before copying a detail. Studying an app's behavior is fine; copy ideas, not code or artwork, unless its license allows it.

## Case studies

### lazygit: list-detail panels with a visible command log

A Git client built from stacked list panels (files, branches, commits, stash) beside a main detail pane.

- **Key hints and help.** A bottom bar lists the keys for the focused panel, and `?` opens a searchable menu of every binding in the current context. [TUI-INP-003](INPUT-AND-KEYBINDINGS.md#tui-inp-003-open-a-help-overlay-with-), [TUI-INP-004](INPUT-AND-KEYBINDINGS.md#tui-inp-004-show-context-sensitive-key-hints-at-all-times).
- **Visible effects.** It shows the git commands it runs in a command log, so users learn what each key did and can repeat it in a shell. This is a good habit for any TUI that fronts another tool.
- **Safe destruction.** Discarding changes or deleting a branch opens a confirmation popup, and the most common mistakes can be undone through the reflog. [TUI-INP-008](INPUT-AND-KEYBINDINGS.md#tui-inp-008-confirm-destructive-actions-and-keep-them-away-from-navigation-keys).
- **Consistent regions.** Panels stay in the same places across views, and focus moves between them with the arrow keys or the number keys. [TUI-LAY-012](LAYOUT-AND-RENDERING.md#tui-lay-012-keep-consistent-layout-regions-across-views), [TUI-INP-007](INPUT-AND-KEYBINDINGS.md#tui-inp-007-cycle-focus-with-tab-and-shift-tab-and-activate-with-enter).
- **Configurable.** Keybindings and colors live in a YAML file in the XDG config directory. [TUI-INP-013](INPUT-AND-KEYBINDINGS.md#tui-inp-013-let-users-remap-keybindings), [TUI-CLR-010](COLOR-AND-ACCESSIBILITY.md#tui-clr-010-let-users-configure-and-override-themes), [CLI-CFG-004](CLI-BASELINE.md#cli-cfg-004-store-user-config-cache-data-and-state-in-xdg-base-directories).

### k9s: command mode, filtering, and a read-only switch

A Kubernetes dashboard that puts many resource types behind one navigable table.

- **Command mode plus search.** `:` jumps to a resource type (`:pods`, `:deploy`), and `/` filters the current table. One prefix for navigation and one for filtering keeps a large surface learnable. [TUI-INP-006](INPUT-AND-KEYBINDINGS.md#tui-inp-006-use--to-search-or-filter).
- **Breadcrumbs and a header.** The header shows the cluster, context and namespace, and breadcrumbs show the path back. Esc returns one level. [TUI-INP-002](INPUT-AND-KEYBINDINGS.md#tui-inp-002-make-esc-back-out-never-quit-unexpectedly), [TUI-LAY-012](LAYOUT-AND-RENDERING.md#tui-lay-012-keep-consistent-layout-regions-across-views).
- **Safety switch.** `k9s --readonly` disables every mutating action, which makes it safe to hand to on-call staff or demo against production. Destructive actions otherwise need confirmation. [TUI-INP-008](INPUT-AND-KEYBINDINGS.md#tui-inp-008-confirm-destructive-actions-and-keep-them-away-from-navigation-keys).
- **Logs off screen.** It writes its own logs to a file, and `k9s info` prints where its config, logs and screen dumps live. [TUI-ARC-012](ARCHITECTURE.md#tui-arc-012-log-to-a-file-never-to-the-screen), [CLI-CFG-004](CLI-BASELINE.md#cli-cfg-004-store-user-config-cache-data-and-state-in-xdg-base-directories).
- **Live data without stalls.** Tables refresh on an interval (`--refresh`) without blocking input. [TUI-ARC-004](ARCHITECTURE.md#tui-arc-004-never-block-the-event-loop), [TUI-ARC-005](ARCHITECTURE.md#tui-arc-005-make-in-flight-work-cancellable-and-discard-stale-results).

### btop: a dense dashboard that degrades gracefully

A resource monitor with CPU, memory, network and process boxes on one screen.

- **Information density by choice.** The number keys toggle each box, and presets switch between layouts, so a small terminal can show only what matters. [TUI-LAY-005](LAYOUT-AND-RENDERING.md#tui-lay-005-adapt-layout-to-available-space).
- **Color depth fallbacks.** It detects terminal capability, offers `-l/--low-color` for 256-color terminals and `-t/--tty` for 16 colors with plain graph symbols, and ships many themes. [TUI-CLR-001](COLOR-AND-ACCESSIBILITY.md#tui-clr-001-detect-color-depth-from-the-environment-and-terminfo), [TUI-CLR-002](COLOR-AND-ACCESSIBILITY.md#tui-clr-002-degrade-colors-to-the-detected-depth), [TUI-CLR-010](COLOR-AND-ACCESSIBILITY.md#tui-clr-010-let-users-configure-and-override-themes), [TUI-ACC-012](COLOR-AND-ACCESSIBILITY.md#tui-acc-012-provide-an-ascii-fallback-for-box-drawing-and-symbols).
- **Mouse optional.** Every mouse action has a key. [TUI-INP-011](INPUT-AND-KEYBINDINGS.md#tui-inp-011-make-mouse-support-optional-never-required), [TUI-ACC-002](COLOR-AND-ACCESSIBILITY.md#tui-acc-002-make-every-action-keyboard-operable).
- **Bounded history.** Graphs keep a fixed window of samples rather than growing without limit. [TUI-ARC-007](ARCHITECTURE.md#tui-arc-007-bound-memory-for-logs-streams-and-large-datasets).

### fzf: an inline picker that composes with pipes

A fuzzy finder that reads candidates on stdin, draws its UI on the terminal, and writes the selection to stdout.

- **A TUI inside a pipeline.** Because the UI is drawn on the controlling terminal while stdin and stdout carry data, `find . | fzf | xargs ...` works. This is the strongest example of a TUI that stays a CLI. [CLI-BAS-004](CLI-BASELINE.md#cli-bas-004-send-primary-and-machine-readable-output-to-stdout), [TUI-ARC-013](ARCHITECTURE.md#tui-arc-013-provide-a-non-interactive-counterpart-for-essential-actions).
- **Inline when short-lived.** `--height` renders below the prompt instead of taking over the screen, and the result stays in scrollback. [TUI-LAY-002](LAYOUT-AND-RENDERING.md#tui-lay-002-render-inline-for-short-lived-interactions), [TUI-TRM-015](TERMINAL-COMPAT.md#tui-trm-015-leave-a-useful-final-message-on-the-primary-screen).
- **Documented exit codes.** 0 for a selection, 1 for no match, 2 for an error, and 130 when the user cancels with Ctrl-C or Esc, so scripts can tell "nothing chosen" from "failed". [CLI-BAS-003](CLI-BASELINE.md#cli-bas-003-map-distinct-non-zero-exit-codes-to-the-important-failure-modes), [CLI-SIG-004](CLI-BASELINE.md#cli-sig-004-exit-with-status-130-after-sigint).
- **Responsive on large inputs.** Matching runs while input is still streaming in, and the list updates without blocking typing. [TUI-ARC-004](ARCHITECTURE.md#tui-arc-004-never-block-the-event-loop), [TUI-ARC-009](ARCHITECTURE.md#tui-arc-009-render-the-first-frame-fast-and-load-lazily).
- **Remappable.** `--bind` attaches actions to keys and events. [TUI-INP-013](INPUT-AND-KEYBINDINGS.md#tui-inp-013-let-users-remap-keybindings).

### htop: function-key bar with letter equivalents

A process viewer that has been usable on bare consoles for decades.

- **Always-visible key bar.** The bottom row labels F1 to F10, and most actions also have a letter or symbol (`/` search, `\` filter, `t` tree, `k` kill, `q` quit) for terminals and laptops where function keys are awkward. [TUI-INP-004](INPUT-AND-KEYBINDINGS.md#tui-inp-004-show-context-sensitive-key-hints-at-all-times), [TUI-INP-009](INPUT-AND-KEYBINDINGS.md#tui-inp-009-avoid-keys-reserved-by-terminals-and-multiplexers).
- **Confirm the dangerous action.** Killing a process opens a signal menu before anything is sent. [TUI-INP-008](INPUT-AND-KEYBINDINGS.md#tui-inp-008-confirm-destructive-actions-and-keep-them-away-from-navigation-keys).
- **Monochrome mode.** `-C/--no-color` gives a usable display without color. [TUI-CLR-004](COLOR-AND-ACCESSIBILITY.md#tui-clr-004-provide-an-app-level-color-switch-that-overrides-detection), [TUI-ACC-001](COLOR-AND-ACCESSIBILITY.md#tui-acc-001-never-convey-information-by-color-alone).
- **Works in 80×24.** The default layout fits a classic terminal and scrolls instead of overflowing. [TUI-LAY-005](LAYOUT-AND-RENDERING.md#tui-lay-005-adapt-layout-to-available-space), [TUI-LAY-011](LAYOUT-AND-RENDERING.md#tui-lay-011-handle-long-content-with-scrolling-and-visible-position).

### Helix: discoverable modal keys

A modal text editor. Its keymap is its own, but the way it teaches that keymap transfers to any app with many bindings.

- **Which-key popups.** Pressing a prefix such as Space shows an info box listing every key that can follow. Users never need to memorize a chord to find it. [TUI-INP-003](INPUT-AND-KEYBINDINGS.md#tui-inp-003-open-a-help-overlay-with-), [TUI-INP-004](INPUT-AND-KEYBINDINGS.md#tui-inp-004-show-context-sensitive-key-hints-at-all-times).
- **A health check command.** `hx --health` reports clipboard support, language servers and other capabilities from the shell, without starting the UI. That is a CLI counterpart for diagnosing the environment. [TUI-ARC-013](ARCHITECTURE.md#tui-arc-013-provide-a-non-interactive-counterpart-for-essential-actions), [TUI-TRM-007](TERMINAL-COMPAT.md#tui-trm-007-detect-capabilities-instead-of-sniffing-terminal-names).
- **Built-in tutorial.** `hx --tutor` opens an interactive tutorial, so learning happens inside the tool.
- **Themes from config.** Themes are files users can copy and edit. [TUI-CLR-010](COLOR-AND-ACCESSIBILITY.md#tui-clr-010-let-users-configure-and-override-themes).

## Patterns

Each pattern names a layout, the keys users will expect, and the states to design before writing code. Combine the rules listed with the baseline in [SKILL.md](SKILL.md).

### List and detail

**Use for:** browsing records (commits, tickets, resources, files). Seen in lazygit and k9s.

```
┌ Items ─────────────┐┌ Detail ─────────────────────────────┐
│> api-gateway   ok  ││ name:     api-gateway               │
│  billing       warn││ status:   ok (3/3 ready)            │
│  search        ok  ││ updated:  2026-10-24 21:14 UTC      │
│                    ││                                     │
└────────────────────┘└─────────────────────────────────────┘
 ↑/↓ move  enter open  / filter  d delete  ? help  q quit
```

- Keep the selection marker visible without color (`>` or reverse video), and show status as text, not only color. [TUI-LAY-013](LAYOUT-AND-RENDERING.md#tui-lay-013-make-focus-and-hierarchy-visible-without-relying-on-color-alone), [TUI-ACC-001](COLOR-AND-ACCESSIBILITY.md#tui-acc-001-never-convey-information-by-color-alone).
- Load the detail for the selected row asynchronously and drop stale results when the selection moves. [TUI-ARC-005](ARCHITECTURE.md#tui-arc-005-make-in-flight-work-cancellable-and-discard-stale-results).
- Below a width threshold, show the list only and open the detail as a full view on Enter. [TUI-LAY-005](LAYOUT-AND-RENDERING.md#tui-lay-005-adapt-layout-to-available-space).
- Design the empty list, the loading state and the error state. [TUI-LAY-014](LAYOUT-AND-RENDERING.md#tui-lay-014-design-loading-empty-and-error-states-for-every-view).

### Dashboard

**Use for:** live metrics and status at a glance. Seen in btop and htop.

- Let users hide or rearrange panes so small terminals stay readable. [TUI-LAY-005](LAYOUT-AND-RENDERING.md#tui-lay-005-adapt-layout-to-available-space).
- Throttle updates to a fixed rate and render by diffing frames. [TUI-LAY-008](LAYOUT-AND-RENDERING.md#tui-lay-008-cap-the-frame-rate), [TUI-LAY-006](LAYOUT-AND-RENDERING.md#tui-lay-006-render-by-diffing-frames-not-clearing-the-screen).
- Keep a fixed-size window of samples per series. [TUI-ARC-007](ARCHITECTURE.md#tui-arc-007-bound-memory-for-logs-streams-and-large-datasets).
- Pair each sparkline or gauge with a number, so the value survives monochrome and screen readers. [TUI-ACC-011](COLOR-AND-ACCESSIBILITY.md#tui-acc-011-do-not-put-essential-information-only-in-art-or-box-drawing).

### Log or stream viewer

**Use for:** following logs, events or build output. Seen in k9s log views and `less +F`.

- Follow the tail by default, pause following when the user scrolls up, and show that following is paused. [TUI-LAY-011](LAYOUT-AND-RENDERING.md#tui-lay-011-handle-long-content-with-scrolling-and-visible-position), [TUI-ACC-008](COLOR-AND-ACCESSIBILITY.md#tui-acc-008-announce-state-changes-in-text).
- Use a ring buffer with a documented line limit. [TUI-ARC-007](ARCHITECTURE.md#tui-arc-007-bound-memory-for-logs-streams-and-large-datasets).
- Strip or escape control sequences from the streamed text before drawing it. [TUI-LAY-010](LAYOUT-AND-RENDERING.md#tui-lay-010-sanitize-control-characters-and-escape-sequences-in-displayed-data).
- `/` searches, `n`/`N` jumps between matches, and a key toggles wrapping. [TUI-INP-006](INPUT-AND-KEYBINDINGS.md#tui-inp-006-use--to-search-or-filter).
- Offer a non-interactive equivalent (`mytool logs --follow`) for pipes. [TUI-ARC-013](ARCHITECTURE.md#tui-arc-013-provide-a-non-interactive-counterpart-for-essential-actions), [TUI-TRM-005](TERMINAL-COMPAT.md#tui-trm-005-refuse-or-fall-back-when-stdin-or-stdout-is-not-a-terminal).

### Inline picker or prompt

**Use for:** choosing one or several items, or answering a short form, inside a larger shell workflow. Seen in fzf and prompt libraries such as Huh and Inquirer.

- Render inline, not on the alternate screen, and leave the answer in scrollback. [TUI-LAY-002](LAYOUT-AND-RENDERING.md#tui-lay-002-render-inline-for-short-lived-interactions), [TUI-TRM-015](TERMINAL-COMPAT.md#tui-trm-015-leave-a-useful-final-message-on-the-primary-screen).
- Read data from stdin or flags and write the result to stdout, drawing the UI on the terminal. [CLI-BAS-004](CLI-BASELINE.md#cli-bas-004-send-primary-and-machine-readable-output-to-stdout).
- When not on a terminal, fail with a message naming the flag that supplies the answer, instead of hanging. [TUI-TRM-005](TERMINAL-COMPAT.md#tui-trm-005-refuse-or-fall-back-when-stdin-or-stdout-is-not-a-terminal), [CLI-INT-001](CLI-BASELINE.md#cli-int-001-prompt-only-when-stdin-is-a-tty).
- Exit 130 on Ctrl-C, and use a distinct code for "nothing selected". [CLI-SIG-004](CLI-BASELINE.md#cli-sig-004-exit-with-status-130-after-sigint), [CLI-BAS-003](CLI-BASELINE.md#cli-bas-003-map-distinct-non-zero-exit-codes-to-the-important-failure-modes).

### Modal or command-palette app

**Use for:** apps with many actions and power users (editors, admin consoles). Seen in Helix and k9s.

- Show the current mode in the status line in text. [TUI-ACC-008](COLOR-AND-ACCESSIBILITY.md#tui-acc-008-announce-state-changes-in-text).
- After a prefix key, show what can follow. [TUI-INP-004](INPUT-AND-KEYBINDINGS.md#tui-inp-004-show-context-sensitive-key-hints-at-all-times).
- Make Esc always return to the base mode, and never make it quit. [TUI-INP-002](INPUT-AND-KEYBINDINGS.md#tui-inp-002-make-esc-back-out-never-quit-unexpectedly).
- Provide a palette or `:` command line with completion, so actions can be found by name as well as by key. [TUI-INP-003](INPUT-AND-KEYBINDINGS.md#tui-inp-003-open-a-help-overlay-with-).
