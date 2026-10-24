# Output

How a CLI should write to stdout and stderr: human-readable defaults, machine-readable modes (`--plain`, `--json`), success and state messages, color, animation, symbols, verbosity, and paging.
Load this when designing or auditing anything a command prints.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## TTY and color decision table

Decide color and decoration per stream. Check stdout and stderr independently: when stdout is piped to another program, stderr is often still a terminal and can keep its color.

| Condition | Color / styling | Animations, spinners, progress bars | Notes |
| --- | --- | --- | --- |
| Stream is a TTY, nothing else set | On | On (stderr usually) | Default interactive experience |
| Stream is a pipe or file | Off for that stream | Off | Other stream may still be a TTY |
| `NO_COLOR` set and non-empty (any value) | Off | Allowed if TTY | Standard from no-color.org |
| `MYAPP_NO_COLOR` set (program-specific) | Off | Allowed if TTY | Lets users turn color off for one tool |
| `TERM=dumb` | Off | Off (no cursor movement) | Terminal cannot handle escape sequences |
| `--no-color` passed | Off | Allowed if TTY | Explicit user request |
| `FORCE_COLOR` or `CLICOLOR_FORCE` set (de-facto convention, not a formal standard) | On even when piped | Still off when not a TTY | For CI logs that render ANSI; `FORCE_COLOR=0` conventionally means off |
| `--color=always` passed (common convention) | On | Still off when not a TTY | Explicit override |

Suggested precedence, highest first: explicit flag (`--no-color` / `--color=always|never|auto`), then `NO_COLOR` / `MYAPP_NO_COLOR`, then `FORCE_COLOR` / `CLICOLOR_FORCE`, then `TERM=dumb`, then the TTY check. If `NO_COLOR` and `FORCE_COLOR` are both set, prefer no color. Document the order you choose in `--help`.

#### TTY detection snippets

```go
import ("os"; "golang.org/x/term")
stdoutTTY := term.IsTerminal(int(os.Stdout.Fd()))
stderrTTY := term.IsTerminal(int(os.Stderr.Fd()))
```

```rust
use std::io::IsTerminal; // stable since Rust 1.70
let stdout_tty = std::io::stdout().is_terminal();
let stderr_tty = std::io::stderr().is_terminal();
```

```python
import sys
stdout_tty = sys.stdout.isatty()
stderr_tty = sys.stderr.isatty()
```

```js
// isTTY is true for terminals and undefined otherwise
const stdoutTTY = Boolean(process.stdout.isTTY);
const stderrTTY = Boolean(process.stderr.isTTY);
```

#### Color decision sketch

```python
import os, sys
def use_color(stream, flag):  # flag: "always" | "never" | "auto"
    if flag in ("always", "never"):
        return flag == "always"
    if os.environ.get("NO_COLOR") or os.environ.get("MYAPP_NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR", "0") != "0" or os.environ.get("CLICOLOR_FORCE", "0") != "0":
        return True
    if os.environ.get("TERM") == "dumb":
        return False
    return stream.isatty()
```

## Rules

### CLI-OUT-001: Design default output for humans and detect the TTY per stream

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

Default output exists to be read by people; machines are the second audience. Whether a given stream is a TTY is the most reliable signal that a human is reading it, so check stdout and stderr separately and adapt formatting (tables, color, wrapping, progress) to each. Every mainstream language has a helper for this (see the snippets above).

**Verify:** Grep source for a TTY check (`isatty`, `IsTerminal`, `is_terminal`, `isTTY`). Compare `mytool list` in a terminal with `mytool list | cat`; the piped form should drop decoration.

### CLI-OUT-002: Keep default output composable as lines of text

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** <https://clig.dev/#output>

Text streams are the universal UNIX interface: assume any output will become input to a program you have never seen, as McIlroy put it. When stdout is not a TTY, emit plain lines that `grep`, `cut`, `awk`, `sort`, and `wc -l` handle as expected, with one item per line and no ANSI codes, spinners, or box-drawing borders. Machine-friendliness should not come at the expense of human usability; the TTY check lets both coexist.

**Verify:** Run `mytool list | grep <known-item>` and `mytool list | cat -v`; matching lines should be whole records and `cat -v` should show no `^[[` escape sequences.

### CLI-OUT-003: Provide --plain when human formatting breaks one-record-per-line

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

Human-oriented layouts sometimes wrap a cell across several lines, truncate to terminal width, or group rows under headers. That breaks line-based tools. Offer a `--plain` flag that turns off all such manipulation and prints exactly one record per line in a stable tabular form (tab- or space-separated, no truncation) suitable for `grep` and `awk`.

**Verify:** If `mytool list` in a TTY wraps or truncates cells, check that `mytool list --plain | awk '{print $1}'` yields one identifier per record and that line count equals record count.

### CLI-OUT-004: Support --json for structured output

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

JSON carries nested and typed data that plain text cannot, and a large ecosystem (`jq`, web APIs via `curl`, every scripting language) consumes it directly. Any command that prints data should accept `--json` and emit the same information as the human view, formatted as valid JSON on stdout.

**Verify:** Run `mytool list --json | jq .` and `mytool show <id> --json | jq .`; both must parse. Grep the flag definitions for `json`.

### CLI-OUT-005: Treat JSON output as a stable, clean contract

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Once scripts depend on `--json`, its shape is an API. Keep it predictable:

- Keep key names and types stable; add fields freely, but rename or remove only with a deprecation path. Use `null` rather than omitting keys inconsistently.
- Emit exactly one JSON document for a finite result (an object, or an array for lists). For long-running or unbounded streams, emit JSON Lines (one complete object per line, newline-terminated) and document it, e.g. `--json` vs `--jsonl`.
- Write nothing else to stdout in JSON mode: no banners, progress, prompts, or warnings. Those go to stderr.
- Report errors on stderr with a non-zero exit code; if you also emit a machine-readable error object, document its schema (for example `{"error": {"code": "...", "message": "..."}}`) and its stream.
- Never include ANSI color codes in machine output, even when stdout is a TTY or `FORCE_COLOR` is set.

**Verify:** Run `mytool list --json 2>/dev/null | jq -e .` (must succeed) and `mytool show does-not-exist --json; echo $?` (non-zero, stdout empty or a documented error object). Run `FORCE_COLOR=1 mytool list --json | cat -v` and confirm no `^[[` sequences.

### CLI-OUT-006: Print brief output on success

- **Level:** should
- **Severity:** low
- **Check:** probe, manual
- **Source:** <https://clig.dev/#output>

The old UNIX habit of printing nothing on success suits scripts but makes slow commands look hung or broken to people (a long `cp` gives no sign of life). Silence is rarely the best default; print a short confirmation of what happened, and lean toward less rather than more.

**Verify:** Run a successful mutating command (e.g. `mytool create demo`) in a sandbox and confirm it prints one or a few lines confirming the result rather than nothing or a wall of text.

### CLI-OUT-007: Offer -q to suppress non-essential output

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

Scripts that want silence should not need `2>/dev/null`, which also hides real errors. Provide `-q`/`--quiet` that removes informational and progress output while keeping errors and requested data.

**Verify:** Grep flag definitions for `quiet`. Run `mytool <cmd> -q` and confirm only essential output remains; run a failing command with `-q` and confirm the error still appears on stderr.

### CLI-OUT-008: Tell the user when state changes

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** <https://clig.dev/#output>

After changing system state, explain what happened so users can update their mental model, especially when the effect differs from what they literally asked for (e.g. something was skipped, merged, or created implicitly). `git push` is a good model: it reports each step and the resulting remote ref (`6c22c90...a2a5217 branch -> branch`).

**Verify:** Run mutating commands in a sandbox and check the output names the affected objects and their new state (IDs, old -> new values, counts).

### CLI-OUT-009: Make the current state easy to inspect

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** <https://clig.dev/#output>

If the program manages complex state that is not obvious from the filesystem, provide a command that shows it (a `status`, `show`, or `list`), in the spirit of `git status`: as much relevant state as possible, plus hints on how to change it.

**Verify:** Look for a `status`/`show`/`list`-style command in `mytool --help`; run it and confirm it summarizes current state without side effects.

### CLI-OUT-010: Suggest the next commands to run

- **Level:** consider
- **Severity:** low
- **Check:** probe, manual
- **Source:** <https://clig.dev/#output>

When commands form a workflow, end output with the likely next step (`run "mytool deploy" to publish`). It teaches the tool and surfaces features. Keep suggestions on stderr or omit them in `--json`/`--plain`/`-q` modes so they do not pollute machine output.

**Verify:** Run the first step of a multi-step workflow (e.g. `mytool init` in a scratch dir) and check for a next-step hint; confirm `--json` output contains no hint text.

### CLI-OUT-011: Make actions that cross the program's boundary explicit

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://clig.dev/#output>

Users should not be surprised by side effects outside the program's own world. Make it explicit (in output, flags, or docs) when the command reads or writes files the user did not pass as arguments (internal state such as caches is exempt) or contacts a remote server, for example to download something.

**Verify:** Grep for file opens on paths not derived from arguments or the program's own config/cache dirs, and for network calls (`http`, `fetch`, `net.Dial`). Each should be announced in output or clearly documented and triggered by an explicit command or flag.

### CLI-OUT-012: Increase information density with compact, scannable formatting

- **Level:** consider
- **Severity:** info
- **Check:** manual
- **Source:** <https://clig.dev/#output>

Compact notations reward learning: `ls -l` permission strings (`drwxr-xr-x`) are ignorable at first and become instantly readable with experience. Use aligned columns, fixed-width markers, and short symbolic fields to fit more into each line, while keeping `--plain`/`--json` available for machines.

**Verify:** Review TTY output of list/status commands for aligned columns and consistent field positions rather than verbose prose per item.

### CLI-OUT-013: Use color with intention

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** <https://clig.dev/#output>

Color should carry meaning: highlight what needs attention, red for errors, perhaps green for success. If everything is colored, color conveys nothing and text gets harder to read. Never rely on color alone to convey meaning; pair it with words or symbols.

**Verify:** Inspect TTY output: colored spans should be few and semantically consistent (same color, same meaning across commands), and the output should still make sense with `NO_COLOR=1`.

### CLI-OUT-014: Disable color when not on a terminal or when the user asks

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

Turn color off for a stream when any of these hold: that stream (stdout or stderr, checked individually) is not a TTY; `NO_COLOR` is set to a non-empty value, whatever the value; `TERM` is `dumb`; the user passed `--no-color`. Optionally also honor a program-specific `MYAPP_NO_COLOR`. See the decision table above for precedence and the `FORCE_COLOR` convention.

**Verify:** Each of these must produce no `^[[` sequences: `mytool list | cat -v`, `NO_COLOR=1 mytool list 2>&1 | cat -v` (run in a TTY), `TERM=dumb mytool list 2>&1 | cat -v`, `mytool list --no-color 2>&1 | cat -v`. Grep source for `NO_COLOR` and `TERM`.

### CLI-OUT-015: Show animations only when the stream is a terminal

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

Spinners and progress bars rely on carriage returns and cursor movement. In CI logs or redirected files they turn into hundreds of garbage lines. Skip all animation when stdout is not a TTY (and check stderr too if that is where progress goes); print occasional plain status lines instead if progress matters. Also skip it for `TERM=dumb`.

**Verify:** Run a long operation with `mytool <cmd> 2>&1 | cat -v > out.log` and confirm `out.log` contains no `\r`-redrawn frames (`^M`) or cursor-control escapes.

### CLI-OUT-016: Use symbols and emoji only where they add clarity

- **Level:** consider
- **Severity:** info
- **Check:** manual
- **Source:** <https://clig.dev/#output>

A well-chosen symbol can separate items, draw attention to a warning, or give output some structure beyond a wall of text (yubikey-agent marks its critical warning with a cross mark). Overuse makes the tool look cluttered or toy-like. Use them sparingly, pair them with text, and fall back to ASCII when the terminal or locale cannot render them.

**Verify:** Review output for decorative symbols; each should mark something distinct (status, warning, section) and the line should remain meaningful without it.

### CLI-OUT-017: Hide developer-only information by default

- **Level:** should
- **Severity:** low
- **Check:** probe, manual
- **Source:** <https://clig.dev/#output>

Output that only helps the authors understand internals (debug traces, internal IDs, timings, raw API payloads) belongs behind `--verbose`/`--debug`, not in default output. Get usability feedback from newcomers and outsiders; they spot noise and confusing output that the authors no longer notice.

**Verify:** Run common commands without flags and check for stack traces, internal object dumps, or debug-style lines; confirm they appear only with `-v`/`--verbose`/`--debug`.

### CLI-OUT-018: Do not format stderr as a log file by default

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

stderr is for messages to the user, not a log stream. By default, omit log-level prefixes (`ERR`, `WARN`, `INFO`), timestamps, source locations, and other context; write plain sentences. Reserve log-style formatting for verbose mode or an explicit `--log-format`.

**Verify:** Trigger a warning or error and inspect stderr for prefixes like `[INFO]`, `level=`, or ISO timestamps; they should appear only with `--verbose` or equivalent.

### CLI-OUT-019: Page long output only when interactive, with safe options

- **Level:** consider
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

For large output, pipe through a pager as `git diff` does, but only when stdin or stdout is an interactive terminal; never page when output is redirected. Paging done badly is worse than none, so use `less -FIRX`: `-F` exits if the content fits one screen, `-I` makes search case-insensitive, `-R` passes color through, `-X` leaves content on screen after quitting. Honor `$PAGER` (and a program-specific override), provide `--no-pager`, and fall back to direct output if the pager cannot start. Prefer a robust library (for example pypager in Python) over ad hoc piping where available.

```go
cmd := exec.Command("less", "-FIRX")
cmd.Stdin, cmd.Stdout, cmd.Stderr = &buf, os.Stdout, os.Stderr
if err := cmd.Run(); err != nil { io.Copy(os.Stdout, &buf) }
```

**Verify:** Run `mytool <long-output-cmd> | cat` and confirm no pager starts and output is complete. In a TTY, confirm short output prints without entering the pager and that `PAGER=cat` or `--no-pager` disables paging.
