# Input and keybindings

How a terminal UI should read keys, paste, mouse and text input, and which keys to bind to what. Load this when designing a keymap, adding text fields or destructive actions, or auditing an app whose keys conflict, feel unfamiliar or misbehave in some terminals. Signal and exit-code basics are in [CLI-BASELINE.md](CLI-BASELINE.md).

## Conventional keymap

Follow these defaults unless the domain has a stronger convention. Bindings marked "add" are additions; the first column must always work.

| Action | Primary | Also bind | Notes |
| --- | --- | --- | --- |
| Quit app | `q` | `Ctrl-C` | `q` only when no text input has focus; `Ctrl-C` always |
| Back / close overlay / cancel | `Esc` | `q` in overlays | Never quits from the top level of a text input |
| Help overlay | `?` | `F1` | Lists every binding for the current context |
| Move selection | `↑` `↓` `←` `→` | `k` `j` `h` `l` (add) | Arrows are never replaced |
| Page | `PgUp` `PgDn` | `Ctrl-B` `Ctrl-F`, `Ctrl-U` `Ctrl-D` (add) | |
| Top / bottom | `Home` `End` | `g` `G` (add) | |
| Search / filter | `/` | | `n` / `N` next / previous match, `Esc` clears |
| Next / previous focus | `Tab` | `Shift-Tab` | Visible focus indicator required |
| Activate / open / confirm | `Enter` | `Space` toggles selection | |
| Refresh | `r` | `Ctrl-L` redraws screen | |
| Command palette / command line | `:` | `Ctrl-P` | Optional; k9s and vim users expect `:` |
| Delete / destructive | `D` or `Delete`, then confirm | `dd` | Never an unshifted key next to `hjkl` alone |
| Suspend to shell | `Ctrl-Z` | | Restore terminal, stop, re-enter on resume |

Text input fields follow readline/Emacs conventions instead: `Ctrl-A`/`Home` start of line, `Ctrl-E`/`End` end of line, `Ctrl-W` delete previous word, `Ctrl-U` delete to start, `Ctrl-K` delete to end, `Alt-B`/`Alt-F` word left/right, `↑`/`↓` history, `Enter` submit, `Esc` cancel.

## Rules

### TUI-INP-001: Quit with q and Ctrl-C

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

`q` must quit from the main view when no text field has focus, and `Ctrl-C` must quit (or, inside a running operation, cancel it, then quit on a second press) from anywhere, including text inputs. Raw mode turns off the terminal's own SIGINT generation, so the app must handle the `Ctrl-C` key event itself; forgetting this traps users. If there is unsaved work, ask once, and let a repeated `Ctrl-C` or `q` in the dialog force exit. Exit must restore the terminal (TUI-ARC-011 in [ARCHITECTURE.md](ARCHITECTURE.md)).

**Verify:** Grep key handling for `ctrl+c`/`KeyCode::Char('c')` with the control modifier/`\x03`. Probe: `tmux new-session -d -s p 'mytui; echo EXIT=$?; sleep 5'`, `tmux send-keys -t p C-c`, then `tmux capture-pane -p -t p` shows `EXIT=`; repeat with `q`, and with focus in a text field for `C-c`.

### TUI-INP-002: Make Esc back out, never quit unexpectedly

- **Level:** must
- **Severity:** medium
- **Check:** manual
- **Source:** original

`Esc` closes the topmost overlay, cancels the current mode (search, selection, edit) or moves one level up the navigation stack. At the top level it does nothing, or at most asks before quitting. It must never discard typed text and exit the app in one keystroke, because `Esc` is pressed reflexively and is also the prefix of many escape sequences. Clearing a filter with `Esc` is fine; leaving the app is not.

**Verify:** Open each overlay and mode and press `Esc`: one level closes each time. At the top level and while typing in a text input, press `Esc` repeatedly and confirm the app stays open and no data is lost.

### TUI-INP-003: Open a help overlay with ?

- **Level:** must
- **Severity:** medium
- **Check:** probe, manual
- **Source:** original

`?` (outside text inputs) opens an overlay listing every keybinding available in the current context, grouped by purpose, including global keys, plus where to find full docs or the config file for remapping. The overlay must scroll if long, close with `Esc`, `q` or `?`, and reflect user remaps rather than hard-coded defaults. Generate it from the same keymap table the handlers use so it cannot drift.

**Verify:** Probe with tmux: `send-keys -t p ?` then `capture-pane -p`, and confirm the listed keys match the handlers in source. Remap a key in config and confirm the help shows the new binding.

### TUI-INP-004: Show context-sensitive key hints at all times

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** original

Keep a hint line (usually the bottom row) showing the most useful keys for the focused view, for example `↑↓ move  enter open  / filter  d delete  ? help  q quit`. Update it as focus and mode change, so a search field shows `enter apply  esc cancel`. Drop low-priority hints first when narrow, but always keep `? help`.

**Verify:** Move focus through every pane and mode and confirm the hint line changes accordingly, lists only keys that work there, and still shows `?` at 60 columns.

### TUI-INP-005: Keep arrow keys working and add vim keys alongside

- **Level:** must
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Arrow keys, `PgUp`/`PgDn` and `Home`/`End` must navigate in every list, table and pane. Vim-style keys (`hjkl`, `g`/`G`, `Ctrl-D`/`Ctrl-U`) are welcome as additional bindings, never as the only way to move. Do not bind letter keys that navigate lists while a text input has focus; there they type characters.

**Verify:** Grep handlers: every `j`/`k` binding should be paired with `Down`/`Up`. Manually navigate each view with arrows only, and type `hjkl` into a text field to confirm they are inserted as text.

### TUI-INP-006: Use / to search or filter

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** original

In any list, table, log or document view, `/` opens a search or filter input. Show the query and match count while typing, `Enter` applies or jumps, `n`/`N` move between matches, and `Esc` clears and returns to the unfiltered view. Indicate in the status bar when a filter is active so an empty or short list is not mistaken for missing data.

**Verify:** Press `/` in each list-like view, type a query, and confirm results narrow, the active filter is visible after `Enter`, and `Esc` restores the full list.

### TUI-INP-007: Cycle focus with Tab and Shift-Tab and activate with Enter

- **Level:** must
- **Severity:** medium
- **Check:** manual
- **Source:** original

With multiple panes or form fields, `Tab` moves focus forward and `Shift-Tab` (`CSI Z`) backward in a predictable visual order, wrapping at the ends, and the focused element is always visibly marked (TUI-LAY-013 in [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md)). `Enter` activates the focused item: opens it, presses the button or submits the form. Number keys or `Alt-<n>` may jump directly to panes as an addition.

**Verify:** Press `Tab` repeatedly and confirm focus visits every interactive element in order and wraps; repeat with `Shift-Tab`. Press `Enter` on each focusable item type and confirm it activates.

### TUI-INP-008: Confirm destructive actions and keep them away from navigation keys

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** original

Deleting, killing, force-pushing, overwriting or discarding changes must require confirmation naming the target, for example `Delete pod web-7f9c? [y/N]`, with the safe choice as default and `Esc` cancelling. Do not bind destructive actions to an unshifted single key that sits next to or is easily confused with navigation (`h`, `j`, `k`, `l`, `g`, `space`, `enter`); prefer shifted keys (`D`, `X`), `Delete`, or a two-key sequence (`dd`). For high-impact actions, require typing the resource name. Offer undo where feasible.

**Verify:** List every binding that mutates or deletes data. Confirm each opens a confirmation with a default of No, and that none is mapped to `Enter`, `Space` or a key adjacent to `hjkl` without a modifier or confirmation.

### TUI-INP-009: Avoid keys reserved by terminals and multiplexers

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** original

Do not bind by default: `Ctrl-S`/`Ctrl-Q` (XON/XOFF flow control can freeze output when IXON is on, as in some serial and multiplexer setups), `Ctrl-Z` (job-control suspend; implement it by restoring the terminal, raising SIGTSTP and re-initializing on SIGCONT), `Ctrl-\` (SIGQUIT), `Ctrl-B` and `Ctrl-A` as global commands (tmux and GNU screen prefixes), and `Ctrl-D` as quit when it can be pressed inside a text field. Also avoid relying on `Ctrl-Shift-<letter>` and `F11`/`Ctrl-+`/`Ctrl--`, which terminal emulators usually intercept.

**Verify:** Grep the keymap for `ctrl+s`, `ctrl+q`, `ctrl+z`, `ctrl+\`, `ctrl+b`, `ctrl+a` bound to app commands outside text inputs. Run inside tmux, press `Ctrl-Z`, confirm the shell prompt appears cleanly, then `fg` restores the full UI.

### TUI-INP-010: Handle legacy key ambiguity and use enhanced keyboard protocols progressively

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://sw.kovidgoyal.net/kitty/keyboard-protocol/>

In traditional terminal encoding several keys send identical bytes: `Ctrl-I` is `Tab`, `Ctrl-M` is `Enter`, `Ctrl-[` is `Esc`, `Ctrl-H` is `Backspace` in some terminals, `Ctrl-Shift-<letter>` equals `Ctrl-<letter>`, and `Alt-<key>` arrives as `Esc` followed by the key. Never assign different actions to members of an ambiguous pair, and use a short escape timeout (about 25-50 ms) to tell a lone `Esc` from an `Alt` sequence. Where the terminal supports the kitty keyboard protocol (query with `CSI ? u`, enable with `CSI > flags u`, pop with `CSI < u` on exit), use it for unambiguous keys and release events, but keep the keymap fully usable without it.

**Verify:** Inspect the keymap for distinct actions on `Ctrl-I`/`Tab`, `Ctrl-M`/`Enter`, `Ctrl-H`/`Backspace`, or `Ctrl-Shift-x`/`Ctrl-x`. If the kitty protocol is enabled, confirm a matching pop on every exit path and that the app works in a terminal without it (for example inside tmux with default settings).

### TUI-INP-011: Make mouse support optional, never required

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://invisible-island.net/xterm/ctlseqs/ctlseqs.html>

Every mouse action (click to focus, scroll, drag to resize) must have a keyboard equivalent. If you enable mouse reporting (prefer SGR encoding, mode 1006, with 1000/1002), note that it captures clicks and breaks native text selection; provide a key or config option to turn it off and mention that most terminals let `Shift`-drag select anyway. Disable all mouse modes on exit, or the shell receives escape garbage on every click.

**Verify:** Grep for `?1000h`, `?1002h`, `?1003h`, `?1006h`, `EnableMouseCapture`, `WithMouseCellMotion` and confirm matching disables on exit. Complete every task using only the keyboard. After quitting, click in the shell and confirm no characters appear.

### TUI-INP-012: Enable bracketed paste and treat pasted text as data

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://invisible-island.net/xterm/ctlseqs/ctlseqs.html>

Enable bracketed paste (`CSI ? 2004 h`) so pastes arrive wrapped in `CSI 200 ~` ... `CSI 201 ~` as a single paste event. Insert the content into the focused text field; never interpret pasted characters as keybindings, and never let an embedded newline submit a form or run a command. In single-line fields, replace newlines with spaces or ask before submitting multi-line content. Without this, pasting `rm -rf ~\n` into the wrong place, or pasting text containing `q`, `d` and `y`, triggers actions. Disable the mode on exit.

**Verify:** Grep for `2004`, `EnableBracketedPaste`, `tea.PasteMsg`/`msg.Paste`, Textual `on_paste`. Probe: `tmux set-buffer "$(printf 'abc\nqdy')"; tmux paste-buffer -p -t p` (`-p` sends bracketed paste) and confirm the text lands in the input and nothing quits, deletes or submits.

### TUI-INP-013: Let users remap keybindings

- **Level:** consider
- **Severity:** info
- **Check:** static, manual
- **Source:** original

Read keybinding overrides from the app's config file (for example `keys: { delete: "ctrl+d" }`), validate them at startup, and report conflicts and unknown action names clearly instead of silently ignoring them. Define bindings in one table mapping action names to keys so remaps, help (TUI-INP-003) and hints (TUI-INP-004) all update together. Config file locations and precedence follow [CLI-BASELINE.md](CLI-BASELINE.md).

**Verify:** Check for a central keymap structure rather than literal keys scattered through handlers. Override one binding in config, restart, and confirm the new key works, the old one does not, and help shows the change; add a conflicting binding and confirm a clear warning.

### TUI-INP-014: Support standard line-editing keys and history in text inputs

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** original

Single-line inputs (search, command line, form fields) should support cursor movement with arrows, `Home`/`End`, `Ctrl-A`/`Ctrl-E`; deletion with `Backspace`, `Delete`, `Ctrl-W` (previous word), `Ctrl-U` (to start), `Ctrl-K` (to end); and word motion with `Alt-B`/`Alt-F` or `Ctrl-←`/`Ctrl-→`. Command and search inputs should keep history navigable with `↑`/`↓`, optionally persisted to the state directory. Use the framework's text input widget (Bubbles `textinput`, `tui-textarea`/`tui-input`, Textual `Input`) rather than hand-rolling one.

**Verify:** In each text field, type `hello world`, press `Ctrl-W` (leaves `hello `), `Ctrl-A` then type `x` (inserts at start), `Ctrl-U` (clears); submit two queries and confirm `↑` recalls them.

### TUI-INP-015: Process all pending input each frame

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Drain every queued input event before rendering, instead of handling one event per frame or per tick. With key repeat (around 30 events per second) or fast typing, handling one event per frame builds a backlog, so the selection keeps moving after the key is released and keystrokes appear late. Apply consecutive navigation events to state, then draw once. Never drop typed characters.

**Verify:** In the loop, confirm events are read until the queue is empty (for example a loop over `event::poll(Duration::ZERO)` in crossterm) before `draw`. Hold `↓` in a long list for two seconds, release, and confirm movement stops immediately; type quickly into a field and confirm every character appears in order.

### TUI-INP-016: Accept Unicode and IME input in text fields

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** original

Text inputs must accept any Unicode text, including composed input from IMEs (Chinese, Japanese, Korean), dead keys and emoji pickers, which arrive as multi-byte characters or multi-character bursts. Store input as strings of grapheme clusters, move the cursor and delete by grapheme, and position the terminal cursor at the correct display column (TUI-LAY-009 in [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md)) so the IME's candidate window appears at the insertion point. Do not filter input to ASCII.

**Verify:** Type or paste `naïve`, `日本語` and `👩‍💻` into each text field; confirm they display correctly, the cursor sits after the last character, and one `Backspace` removes one visible character. With an IME, confirm the candidate window appears at the cursor.
