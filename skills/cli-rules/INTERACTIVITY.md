# Interactivity

When and how a CLI may prompt: TTY detection, `--no-input`, prompting for missing values, hidden password entry, letting users escape, and confirmation for dangerous actions.
Load this when adding prompts, confirmations, or any interactive element, or when auditing whether a command is safe to run in scripts and CI.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Prompts and confirmations

The rules for when to prompt for missing values and how to confirm destructive actions live in [ARGUMENTS-AND-FLAGS.md](ARGUMENTS-AND-FLAGS.md): [CLI-ARG-009](ARGUMENTS-AND-FLAGS.md#cli-arg-009-prompt-for-missing-input-when-running-interactively), [CLI-ARG-010](ARGUMENTS-AND-FLAGS.md#cli-arg-010-never-require-a-prompt), [CLI-ARG-011](ARGUMENTS-AND-FLAGS.md#cli-arg-011-confirm-before-dangerous-operations), [CLI-ARG-012](ARGUMENTS-AND-FLAGS.md#cli-arg-012-scale-confirmation-friction-to-the-level-of-danger) and [CLI-ARG-013](ARGUMENTS-AND-FLAGS.md#cli-arg-013-treat-indirect-destruction-as-severe). This section shows how to implement them together with [CLI-INT-001](#cli-int-001-prompt-only-when-stdin-is-a-tty) and [CLI-INT-002](#cli-int-002-honor---no-input-by-disabling-all-prompts).

#### Prompt-or-fail pattern

Every prompt needs a flag equivalent. Prompt only when stdin is a TTY and `--no-input` is not set; otherwise exit non-zero with a message naming the missing value and the flag that supplies it. Write prompt text to stderr so stdout stays clean.

```python
import sys

def require(value, flag, label, no_input):
    if value is not None:
        return value
    if sys.stdin.isatty() and not no_input:
        sys.stderr.write(f"{label}: ")
        sys.stderr.flush()
        answer = sys.stdin.readline().strip()
        if answer:
            return answer
    sys.exit(f"error: {label} is required; pass {flag} <value>")  # exits with status 1

name = require(args.name, "--name", "Project name", args.no_input)
```

Probe it with `mytool create < /dev/null; echo $?`: it must exit promptly with a non-zero status and a flag hint, never hang.

#### Confirmation tiers

| Danger | Examples | Interactive (TTY) | Non-interactive / scripts |
| --- | --- | --- | --- |
| Mild | Delete one local file; command name already says "delete" | Optional `y/N` prompt | Proceed, or require `-f`/`--force` if you prompted |
| Moderate | Delete a directory, delete a remote resource, bulk change that is hard to undo | `y/N` prompt (default No); offer `--dry-run` | Require `-f`/`--force`; fail with a hint otherwise |
| Severe | Delete an entire remote app, server, or database; implicit mass deletion (e.g. lowering a replica count from 10 to 1) | Make the user type the resource name; a bare `y` must not be enough | Require `--confirm=<name>` matching the target exactly; `--force` alone is not enough |

Implementation notes: default every `y/N` prompt to No so pressing Enter cancels; when stdin is not a TTY or `--no-input` is set, never fall through to the destructive path without the required flag; and print what will be destroyed (including implied deletions) before asking.

## Rules

### CLI-INT-001: Prompt only when stdin is a TTY

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#interactivity>

Prompts, menus, spinners waiting for keys, and other interactive elements are only appropriate when stdin is an interactive terminal. If stdin is piped or the command runs in a script or CI, a prompt either hangs forever or consumes piped data as an answer. In that case skip the prompt and fail with an error that names the flag to pass.

**Verify:** Grep for prompt calls and confirm each is guarded by a stdin TTY check. Run `mytool <cmd-that-prompts> < /dev/null; echo $?` and `echo | mytool <cmd>`; both must exit promptly with a non-zero status and a message naming the required flag, never hang.

### CLI-INT-002: Honor --no-input by disabling all prompts

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#interactivity>

Provide `--no-input` as an explicit switch that turns off every prompt and interactive element, even on a TTY. If the command then lacks required input, fail and tell the user which flag supplies it. Consider also honoring an environment variable (e.g. `MYAPP_NO_INPUT=1`) and treating `CI=true` as non-interactive.

**Verify:** In a terminal, run `mytool <cmd-that-prompts> --no-input; echo $?` and confirm it exits non-zero immediately with a flag hint and shows no prompt. Grep flag definitions for `no-input`.

### CLI-INT-003: Do not echo passwords as they are typed

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** <https://clig.dev/#interactivity>

When prompting for a password or other secret, turn off terminal echo so it never appears on screen or in recordings. Use the language's helper: Python `getpass.getpass()`, Go `term.ReadPassword(int(os.Stdin.Fd()))` from `golang.org/x/term`, Rust the `rpassword` crate, Node a library such as `@inquirer/password` or raw mode with masked output. Restore echo on every exit path, including Ctrl-C. When non-interactive, read secrets from a file or stdin, not from a flag value.

**Verify:** Grep secret prompts for `getpass`, `ReadPassword`, `rpassword`, or equivalent rather than plain `input()`/`readline`. Manually run the prompt in a terminal, confirm typed characters are hidden, press Ctrl-C mid-entry, and confirm the shell still echoes afterwards.

### CLI-INT-004: Let the user escape at any time

- **Level:** must
- **Severity:** high
- **Check:** static, probe, manual
- **Source:** <https://clig.dev/#interactivity>

Make the way out obvious; do not trap users the way vim famously does. Ctrl-C must keep working during prompts, interactive screens, and while blocked on network or disk I/O: do not swallow SIGINT, and make long operations cancellable (contexts, timeouts, abortable requests). Interactive screens should show their quit key.

**Verify:** Run a command that waits on the network (e.g. against an unroutable host such as `mytool fetch --host 10.255.255.1`) and press Ctrl-C; it should exit within about a second. Press Ctrl-C at each prompt and confirm a clean exit. Grep for signal handlers that ignore SIGINT.

### CLI-INT-005: Explain how to exit when Ctrl-C is passed through

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#interactivity>

Programs that wrap another session (SSH, tmux, telnet, REPLs, container attach) often forward Ctrl-C to the inner program, so it cannot quit the wrapper. Provide a documented escape mechanism and tell users about it, as SSH does with its `~` escape sequences (`~.` to disconnect).

**Verify:** For wrapper or attach commands, check that the banner or `--help` states the detach/quit key sequence, and confirm manually that it works.
