# Errors

How to turn failures into guidance: rewriting errors for humans, keeping error output scannable, handling unexpected crashes, and making bug reports easy. Load this when writing error handling, reviewing failure output, or auditing how a CLI behaves when things go wrong.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

People reach for documentation most often when something has failed. An error message that already explains the fix is documentation delivered at exactly the right moment.

## Error message anatomy

A good error answers four questions, in roughly this order, and stays short:

1. **What happened**: the operation that failed and the object it failed on (`Can't write to ./out/report.csv`).
2. **Why**: the underlying cause in plain words (`permission denied`, `file is read-only`), not an errno or class name.
3. **How to fix**: a concrete next step, ideally a copy-pasteable command (`Run 'chmod u+w ./out/report.csv' or pass --output to choose another path`).
4. **Where to get more detail**: a flag, log path or URL (`Re-run with --verbose`, `see ~/.cache/mytool/debug.log`, `https://mytool.dev/e/E1042`).

Put the fix last, since that is where the eye lands (see CLI-ERR-003). Prefix with the tool name or `error:` so it is identifiable in mixed output, and write to stderr.

#### Before and after

Before: the raw exception leaks through.

```
Traceback (most recent call last):
  File "/usr/lib/python3/site-packages/mytool/export.py", line 88, in write
    with open(path, "w") as fh:
PermissionError: [Errno 13] Permission denied: 'out/report.csv'
```

After: caught, explained, actionable.

```
error: can't write the report to out/report.csv (permission denied)
  The file exists and is read-only for your user.
  Fix: run 'chmod u+w out/report.csv', or choose another path with --output.
```

```python
try:
    with open(path, "w") as fh:
        write_report(fh, rows)
except PermissionError:
    die(f"can't write the report to {path} (permission denied)",
        fix=f"run 'chmod u+w {path}', or choose another path with --output.")
```

## Rules

### CLI-ERR-001: Catch expected errors and rewrite them for humans

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#errors>

For every failure you can anticipate (missing file, permission denied, network unreachable, invalid config, auth expired, conflicting flags), catch it and replace the low-level message with one that reads like guidance: what went wrong and what to do next. Treat it as a conversation in which the user made a misstep and the program steers them back. Raw stack traces, errno names, and library exception text are not acceptable for expected conditions.

Example: `Can't write to file.txt. Make it writable with 'chmod +w file.txt'.` instead of `EACCES: permission denied, open 'file.txt'`.

**Verify:** Probe common failure paths safely: `mytool read /nonexistent`, `mytool --config /dev/null`, run with network disabled or an invalid token. No stack trace or bare exception name should appear; each message should name the object and suggest a fix. In source, look for broad `except Exception: raise`/`panic`/`unwrap()`/`expect()` on user-reachable paths.

### CLI-ERR-002: Keep error output high signal and group repeated errors

- **Level:** should
- **Severity:** low
- **Check:** probe, manual
- **Source:** <https://clig.dev/#errors>

Every irrelevant line makes the real problem slower to find. Print the error once, without surrounding noise (repeated context, duplicate log lines, full config dumps). When the same kind of error occurs many times, such as 40 files failing validation for the same reason, print one explanatory header followed by a compact list or a count, rather than 40 near-identical lines.

```
error: 3 files are missing a required 'title' field:
  docs/intro.md
  docs/setup.md
  docs/usage.md
```

**Verify:** Trigger a multi-item failure (e.g., validate a directory with several bad inputs) and check the output is grouped. Check single failures produce one concise message, not the same error logged at several layers.

### CLI-ERR-003: Put the most important information where the user looks first

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** <https://clig.dev/#errors>

Users read the bottom of terminal output first, because that is where the cursor is. End error output with the key fact or the fix, not with a stack frame or a generic "exiting". Red draws the eye, so reserve it for the actual error line; coloring whole blocks red, or coloring warnings and errors alike, dilutes it. Respect `NO_COLOR` and non-TTY output when coloring.

**Verify:** Trigger an error in a terminal and confirm the last lines contain the cause and fix. Check red/bold is applied only to the error label or summary line, and absent under `NO_COLOR=1 mytool <failing-cmd>` or `mytool <failing-cmd> 2>&1 | cat`.

### CLI-ERR-004: Give debug detail and bug-report instructions for unexpected errors

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#errors>

When an error is truly unexpected (a bug, an unhandled exception, a panic), tell the user it is a bug, show enough detail to diagnose it, and say how to report it. Balance this against signal-to-noise: install a top-level handler that prints a short summary plus where the full traceback lives, write the full trace and context to a debug log file, and show the complete trace inline only with `--verbose`/`--debug` or an env var like `MYTOOL_DEBUG=1`.

```
error: unexpected internal error (this is a bug in mytool 2.4.1)
  KeyError: 'region'
  Full details written to ~/.cache/mytool/crash-2026-10-24T22-15-03.log
  Please report it: https://github.com/acme/mytool/issues/new
```

**Verify:** In source, find the top-level panic/exception hook (`sys.excepthook`, `process.on('uncaughtException')`, `std::panic::set_hook`, a `recover` in `main`). Confirm it prints a bug-report path, writes or offers full detail, and still exits non-zero.

### CLI-ERR-005: Make submitting a bug report effortless

- **Level:** consider
- **Severity:** info
- **Check:** static, manual
- **Source:** <https://clig.dev/#errors>

Lower the cost of reporting: print a URL that opens a new issue with the title, tool version, OS, architecture, command (with secrets redacted) and error summary already filled in, for example via GitHub's `issues/new?title=...&body=...` query parameters. Alternatively offer a `mytool bug-report` command that collects the same diagnostics. Never include tokens, credentials or private file contents in the pre-filled data.

```go
q := url.Values{}
q.Set("title", "crash: "+summary)
q.Set("body", fmt.Sprintf("version: %s\nos: %s/%s\ncommand: %s\n\n%s",
    version, runtime.GOOS, runtime.GOARCH, redact(os.Args), errText))
fmt.Fprintf(os.Stderr, "Report it: https://github.com/acme/mytool/issues/new?%s\n", q.Encode())
```

**Verify:** Inspect the crash handler or `bug-report` command for a pre-filled URL or diagnostic bundle; confirm values are URL-encoded and that secrets (tokens, env vars, auth headers) are redacted.
