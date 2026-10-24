# Testing CLIs

Load this file when writing or reviewing the test suite of a CLI tool, or when an audit needs to confirm that interface guarantees (exit codes, output streams, JSON contracts, non-interactive behavior) are protected by tests.
Test the built program as a black box through its real interface: argv, environment, stdin, stdout, stderr, exit status and signals.

## Tooling by language

| Language | Process-level tests | Snapshots / golden files | Notes |
| --- | --- | --- | --- |
| Go | `os/exec` against a binary built in `TestMain`; `github.com/rogpeppe/go-internal/testscript` (txtar scripts with `exec`, `stdout`, `stderr`, `! exec` for expected failures) | Golden files under `testdata/` with an `-update` flag | testscript can run `main` in-process via `testscript.RunMain` and isolates `HOME`/`WORK` per script |
| Rust | `assert_cmd` (`Command::cargo_bin("mytool")`) + `predicates` | `trycmd` (Markdown/TOML-driven CLI cases), `snapbox`, `insta` (`assert_snapshot!`) | `trycmd` doubles as tested documentation; update with `TRYCMD=overwrite` |
| Python | `subprocess.run([...], capture_output=True, timeout=...)` against the installed entry point | `pytest` with `syrupy` or plain golden files | `click.testing.CliRunner` / `typer.testing.CliRunner` invoke in-process; fast but bypass real TTY, signals and process exit |
| Node | `execa` (`reject: false` to inspect failures) | `vitest` `toMatchSnapshot`/`toMatchFileSnapshot` | Build first and run the shipped `bin` entry, not the TypeScript source |

In-process runners are good for breadth; keep a smaller set of subprocess tests for anything involving exit codes, streams, TTYs, signals and environment.

## Testing TTY behavior

Pipes in a test harness are never terminals, so default runs exercise only the non-TTY path.
To test colors, spinners, prompts and terminal-width handling, attach the child to a pseudo-terminal (pty), which makes `isatty()` return true.

- `script(1)`: `script -qec "mytool list" /dev/null` (util-linux) or `script -q /dev/null mytool list` (macOS/BSD) for quick manual checks.
- Python: `pty.openpty()` with `subprocess`, or `pexpect` for interactive prompt scripts.
- Node: `node-pty` (`pty.spawn`) to drive prompts and read rendered output.
- Go: `github.com/creack/pty` (`pty.Start(cmd)`), or `github.com/Netflix/go-expect` for prompt flows.
- `expect(1)` for shell-level interactive scripts.

Set `TERM`, `COLUMNS` and `LINES` explicitly so output is deterministic, and expect `\r\n` line endings from a pty.

```python
import os, pty, subprocess

def run_in_pty(cmd, env=None):
    leader, follower = pty.openpty()
    proc = subprocess.Popen(cmd, stdin=follower, stdout=follower, stderr=follower, env=env)
    os.close(follower)
    out = b""
    while True:
        try:
            chunk = os.read(leader, 4096)
        except OSError:  # Linux raises EIO once the child closes the pty
            break
        if not chunk:
            break
        out += chunk
    os.close(leader)
    return proc.wait(timeout=10), out

code, out = run_in_pty(["mytool", "list"], env={**os.environ, "TERM": "xterm-256color"})
assert code == 0 and b"\x1b[" in out  # color is on when attached to a terminal
```

## Rules

### CLI-TST-001: Test exit codes for success, usage errors and runtime failures

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Scripts branch on exit status, so it is part of the interface. Assert the exact code for at least three classes: success (0), usage errors such as an unknown flag or missing argument (commonly 2), and runtime failures such as a missing file or unreachable service (non-zero, distinct from usage errors where the tool documents it). Also cover `--help` and `--version` returning 0.

```python
r = subprocess.run(["mytool", "--bogus"], capture_output=True, text=True)
assert r.returncode == 2
r = subprocess.run(["mytool", "read", "missing.txt"], capture_output=True, text=True)
assert r.returncode == 1
```

**Verify:** Grep the test suite for assertions on exit status (`returncode`, `.code(`, `exitCode`, `! exec`, `ExitError`). Probe: `mytool --bogus; echo $?` and `mytool <cmd> /nonexistent; echo $?` must both be non-zero, and `mytool --help >/dev/null; echo $?` must be 0.

### CLI-TST-002: Snapshot help text and usage errors with golden files

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Help output is documentation that silently drifts. Store `--help` for the root command and every subcommand, plus representative usage-error messages, as golden files or snapshots, and review diffs in code review. Render with a fixed width (`COLUMNS=80`) and no color so snapshots are stable across machines.

**Verify:** Look for snapshot files or golden files containing help text (`testdata/*.golden`, `__snapshots__`, `*.trycmd`, `*.txtar`). Confirm every subcommand has one and that tests set a fixed width.

### CLI-TST-003: Test output when stdout is not a TTY

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Piped output must contain no ANSI escapes, no spinner or progress frames, no carriage-return redraws, and no prompts. Since test harnesses capture output through pipes, assert this directly on captured stdout and stderr, and compare against a stable expected value.

```rust
Command::cargo_bin("mytool")?.arg("list").assert().success()
    .stdout(predicates::str::contains("\x1b[").not())
    .stdout(predicates::str::contains("\r").not());
```

**Verify:** Find a test asserting the absence of `\x1b[` and `\r` in piped output. Probe: `mytool list | cat -v` shows no `^[[` sequences and no `^M` redraws.

### CLI-TST-004: Test that color opt-outs disable color

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Piped-output tests do not prove that color honors user opt-outs, because color is already off without a TTY. Run under a pseudo-terminal with `NO_COLOR=1`, then with `TERM=dumb`, then with `--no-color` if offered, and assert no escape sequences appear. Add a positive control (pty, no opt-out) that shows color, so the negative tests cannot pass vacuously.

**Verify:** Grep tests for `NO_COLOR` and `TERM=dumb` combined with a pty helper. Probe: `NO_COLOR=1 script -qec "mytool list" /dev/null | cat -v` contains no `^[[` color sequences.

### CLI-TST-005: Validate JSON output against a contract

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

`--json` output is an API. Parse it in tests (not substring-match it), validate against a JSON Schema or typed model, and assert that stdout contains nothing besides the JSON document (or one document per line for JSON Lines). Cover empty results, errors, and fields that must keep stable names and types across releases.

```ts
const { stdout, exitCode } = await execa("mytool", ["list", "--json"], { reject: false });
expect(exitCode).toBe(0);
expect(() => ListSchema.parse(JSON.parse(stdout))).not.toThrow();
```

**Verify:** Grep tests for `--json` together with a JSON parse and schema or model validation. Probe: `mytool list --json | jq -e . >/dev/null; echo $?` prints 0, also with an empty result set.

### CLI-TST-006: Test stdin input and the dash argument

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

If the tool reads files, test that it reads the same content from stdin when given `-` (and when no file is given, if documented), that output is identical to the file case, and that empty stdin is handled without hanging or crashing. Test large inputs to catch tools that buffer everything or break on partial reads.

**Verify:** Look for tests that pass `input=`/`stdin` with a `-` argument. Probe: `printf 'a\nb\n' | mytool <cmd> -` matches `mytool <cmd> file.txt` for the same content, and `mytool <cmd> - </dev/null` exits promptly.

### CLI-TST-007: Assert errors go to stderr and stdout stays clean

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Capture stdout and stderr separately (never merged) and assert both in failure tests: the error message appears on stderr, and stdout is empty or contains only valid partial data. Also assert that logs, warnings, progress and deprecation notices never appear on stdout in success cases, especially with `--json`.

**Verify:** Check that failure tests assert on stderr content and on empty stdout separately. Probe: `mytool <cmd> /nonexistent 2>/dev/null` prints nothing, and `mytool list --json 2>/dev/null | jq .` succeeds.

### CLI-TST-008: Test that non-interactive runs never prompt or hang

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

A prompt in CI blocks forever. Run every command that can prompt with stdin closed or redirected from `/dev/null`, and with `--no-input` if supported, under a hard timeout. Assert the command either proceeds using flags or defaults, or fails fast with a non-zero code and a message naming the flag that supplies the missing value. A test that times out is a failure, not a flake.

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
cmd := exec.CommandContext(ctx, bin, "delete", "proj")
cmd.Stdin = nil // reads from os.DevNull
err := cmd.Run()
if ctx.Err() != nil {
	t.Fatal("hung waiting for input")
}
if err == nil {
	t.Fatal("expected a non-zero exit when confirmation cannot be given")
}
```

**Verify:** Grep tests for timeouts combined with closed stdin or `--no-input` on commands that prompt. Probe: `timeout 10 mytool <prompting-cmd> </dev/null; echo $?` returns non-zero quickly (not 124).

### CLI-TST-009: Test interrupt handling and cleanup

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Start a long-running command as a subprocess, send SIGINT once it has begun work, and assert it exits within a deadline with status 130 (or terminates by SIGINT, which harnesses report as -2 or signal 2), prints a short message to stderr, and leaves no temp files, lock files or half-written outputs. Where the tool supports a second Ctrl-C to force exit, test that too. Skip on Windows or use console control events there.

```python
p = subprocess.Popen(["mytool", "sync"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(0.5)
p.send_signal(signal.SIGINT)
assert p.wait(timeout=5) in (130, -signal.SIGINT)
assert not list(tmp_path.glob("*.partial"))
```

**Verify:** Grep tests for `SIGINT`/`send_signal`/`Signal(os.Interrupt)`/`kill("SIGINT")`. Manually run a long command, press Ctrl-C, check `echo $?` is 130 and no stray files remain.

### CLI-TST-010: Test configuration precedence

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Set the same option in every layer the tool supports (flag, environment variable, project config, user config, system config, default) and assert the documented winner, removing one layer at a time. Point config discovery at a temporary directory (`HOME`, `XDG_CONFIG_HOME`, `APPDATA`, or a `--config` flag) so tests never read the developer's real config.

**Verify:** Find a table-driven test that sets an option in multiple layers and asserts which value is used; confirm it isolates `HOME`/`XDG_CONFIG_HOME`.

### CLI-TST-011: Isolate tests from the host environment

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Tests that inherit the developer's environment pass locally and fail in CI, or vice versa. Give each test a fresh temporary `HOME` and working directory, clear or pin variables the tool reads (`NO_COLOR`, `FORCE_COLOR`, `CI`, `TERM`, `COLUMNS`, `LANG`, tool-specific prefixes), and stub network endpoints. Never write into the repository or the real home directory.

**Verify:** Check the test helper that launches the CLI: it should set an explicit `env` and temp `HOME`/cwd rather than inheriting `os.environ` wholesale.

### CLI-TST-012: Test the built artifact, not only internal functions

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Unit tests of parsing helpers miss entry-point wiring: the shebang, `bin` mapping, packaging, exit-code propagation, and lazy imports that fail at runtime. Run at least a smoke suite (`--help`, `--version`, one real command, one failure) against the binary or installed package exactly as users get it, ideally on the release artifact in CI.

**Verify:** Confirm CI builds or installs the tool (`go build`, `cargo build`, `pip install .`, `npm pack` + install) and runs subprocess tests against the result.

### CLI-TST-013: Run the suite on every target OS in CI

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** original

Windows differs in path separators, drive letters, `\r\n` line endings, executable suffixes (`.exe`, `.cmd` shims for npm bins), quoting, console encoding, and signal delivery; macOS ships BSD variants of common tools. Run the full suite on each OS you ship to, normalize line endings and paths in snapshot comparisons, and mark platform-specific tests explicitly rather than letting them silently skip.

**Verify:** Inspect the CI configuration for a matrix covering each supported OS (for example `runs-on: [ubuntu-latest, macos-latest, windows-latest]`). Check snapshot helpers normalize `\r\n` and path separators.

### CLI-TST-014: Test interactive behavior under a pseudo-terminal

- **Level:** consider
- **Severity:** info
- **Check:** static, manual
- **Source:** original

Prompts, spinners, color and width-aware layout only activate on a TTY, so piped tests never run them. Drive representative interactive flows through a pty (see "Testing TTY behavior"): answer prompts, send Ctrl-C mid-prompt, resize `COLUMNS`, and assert the final screen text and exit code.

**Verify:** Grep tests for pty usage (`pty.openpty`, `pexpect`, `node-pty`, `creack/pty`, `expect`). Manually run the interactive flow in a real terminal and in a narrow window.
