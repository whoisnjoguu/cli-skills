# Robustness and signals

Rules for making a CLI behave well when input is bad, networks are slow, operations are long or interrupted, and users press Ctrl-C. Load this file when implementing long-running, networked, concurrent, or state-changing commands, or when auditing signal and failure handling.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Robustness

### CLI-ROB-001: Validate input before doing any work

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#robustness-guidelines>

Every place that accepts user data (arguments, flags, environment variables, config files, stdin) will eventually receive garbage. Parse and validate all of it up front, before any network call, file write, or other side effect, and fail with an understandable error (see ERRORS.md) rather than failing halfway through and leaving partial state.

- Do: check flag types, ranges, mutually exclusive flags, file existence, and required config at startup.
- Don't: discover an invalid `--region` after uploading 2 GB.

**Verify:** Run the command with an invalid value for each flag (e.g. `mytool deploy --replicas=-1 --dry-run`) and confirm it exits non-zero with a clear message and no side effects. In source, confirm validation happens before the first I/O call.

### CLI-ROB-002: Respond within 100 ms

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://clig.dev/#robustness-guidelines>

Feeling responsive matters more than raw speed. Print something within about 100 ms of starting. Before a network request or other potentially slow step, print what you are about to do (on stderr, so stdout stays clean) so the program never sits silent and looks hung. Avoid slow startup work such as eager loading of large modules, update checks, or network calls before the first output.

**Verify:** Time to first output: `time mytool sync 2>&1 | head -1` against a slow or unreachable endpoint; the first line should appear almost immediately. `time mytool --help` should complete well under a second.

### CLI-ROB-003: Show progress for long operations

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** <https://clig.dev/#robustness-guidelines>

A program that prints nothing for a while looks broken; a good spinner or progress bar makes it seem faster. Progress indicators should visibly move even when the underlying work stalls (an animated element, elapsed time, or estimated time remaining) so a stuck bar is never mistaken for a crash. Use an established library rather than hand-rolling one: tqdm or rich (Python), schollz/progressbar or mpb (Go), indicatif (Rust), cli-progress or ora (Node.js).

Draw progress on stderr, and only when stderr is a TTY; in non-interactive contexts, print occasional plain log lines instead of carriage-return animations.

**Verify:** Run a long operation in a terminal and confirm a moving indicator appears. Run `mytool sync 2>&1 | cat` and confirm no spinner control sequences or `\r` spam end up in the output.

### CLI-ROB-004: Keep parallel work and its output coherent

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** <https://clig.dev/#robustness-guidelines>

Run independent work concurrently where it helps (downloads, per-item API calls); parallelism can be a big usability win, as `docker pull`'s per-layer progress bars show. But reporting progress for parallel tasks is much harder than for one, so make it robust: never let lines from different workers interleave mid-line or garble each other. Use a library that supports multiple bars natively (tqdm with `position=`, mpb, indicatif `MultiProgress`) or funnel all output through a single writer. Bound concurrency so the tool does not exhaust file descriptors or trip rate limits.

**Verify:** Run a parallel operation with many items, both in a terminal and piped (`mytool pull --all 2>&1 | cat`), and confirm each output line is intact and attributable to its task. In source, confirm writes go through a shared, synchronized writer or progress library and that a concurrency limit exists.

### CLI-ROB-005: Print the hidden logs when an operation fails

- **Level:** must
- **Severity:** medium
- **Check:** probe, manual
- **Source:** <https://clig.dev/#robustness-guidelines>

Hiding detailed logs behind a progress bar makes successful runs easy to follow. When something fails, though, the user needs that detail: on error, print the relevant buffered logs (or the path to a log file) along with the error, otherwise the failure is nearly impossible to debug.

**Verify:** Force a failure partway through a progress-bar operation (e.g. point it at an invalid endpoint) and confirm the output includes the underlying log lines or a pointer to them, not just "failed".

### CLI-ROB-006: Put a timeout on every network operation

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#robustness-guidelines>

Nothing that touches the network should be able to hang forever. Set reasonable default timeouts for connect and total request time, and let users change them with a flag, environment variable, or config key (e.g. `--timeout 30s`). Many HTTP clients have no timeout by default: Go's `http.DefaultClient` and Python's `requests` both wait indefinitely.

```go
client := &http.Client{Timeout: cfg.Timeout} // e.g. default 30 * time.Second
```

```python
resp = requests.get(url, timeout=(5, args.timeout))  # (connect, read) seconds
```

**Verify:** grep for HTTP/DB/socket client construction and confirm a timeout is set (`http.DefaultClient`, `http.Get(`, and `requests.get(` without `timeout=` are red flags). Probe with an unroutable address, e.g. `mytool --endpoint http://10.255.255.1 status`, and confirm it fails within the documented timeout.

### CLI-ROB-007: Make failed operations resumable by re-running them

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#robustness-guidelines>

When a run fails for a transient reason (dropped connection, laptop sleep), the user should be able to press Up and Enter and have the command pick up where it left off rather than starting over or failing on leftover state. Make steps idempotent, skip work that is already done (checksums, existing completed files, server-side state), and resume partial downloads where the protocol allows.

**Verify:** Interrupt a long multi-step operation midway (Ctrl-C or drop the network), re-run the identical command, and confirm it completes without redoing finished work or erroring on partial state.

### CLI-ROB-008: Design for crash-only operation with atomic writes

- **Level:** should
- **Severity:** high
- **Check:** static, manual
- **Source:** <https://clig.dev/#robustness-guidelines>

Crash-only design goes one step beyond idempotence: if no cleanup is required after an operation, or cleanup can be deferred to the next run, the program can exit immediately on any failure or interruption, which makes it both more robust and more responsive. The key technique is never leaving a file half-written: write to a temporary file in the same directory, flush it, then atomically rename it over the target. Readers see either the old or the new file, never a torn one.

```go
tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
if err != nil { return err }
defer os.Remove(tmp.Name()) // no-op after successful rename
if _, err := tmp.Write(data); err != nil { tmp.Close(); return err }
if err := tmp.Sync(); err != nil { tmp.Close(); return err }
if err := tmp.Close(); err != nil { return err }
return os.Rename(tmp.Name(), path)
```

```python
with tempfile.NamedTemporaryFile("wb", dir=os.path.dirname(path) or ".", delete=False) as f:
    f.write(data); f.flush(); os.fsync(f.fileno())
os.replace(f.name, path)  # atomic on POSIX and Windows
```

The temp file must be on the same filesystem as the target (same directory is the simple way), or the rename is not atomic.

**Verify:** grep for writes to config, state, cache, and output files (`os.WriteFile`, `open(..., "w")`, `fs.writeFileSync`) and confirm important ones go through temp-then-rename. Kill the process with `kill -9` during a write and confirm the target is either intact or fully updated.

### CLI-ROB-009: Stay safe when many instances run at once

- **Level:** should
- **Severity:** high
- **Check:** static, manual
- **Source:** <https://clig.dev/#robustness-guidelines>

Users and scripts will run many copies of your tool simultaneously (parallel CI jobs, `xargs -P`, two terminals). Shared state such as caches, config, lock files, and databases must tolerate this: use atomic writes, file locks (`flock`, `O_EXCL` creation) or SQLite with proper locking, and unique temp file names. A lock that can go stale must be detectable and recoverable (record the PID and check it is alive).

**Verify:** Run several instances concurrently, e.g. `seq 8 | xargs -P8 -I{} mytool cache refresh`, and confirm none fail, deadlock, or corrupt shared state. In source, look for fixed temp file names and unguarded read-modify-write of shared files.

### CLI-ROB-010: Expect to be scripted, run on bad networks, and used in untested environments

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** <https://clig.dev/#robustness-guidelines>

People will misuse the program: wrap it in scripts, run it over flaky connections, and run it in environments you never tested, each with its own quirks. Prepare for that:

- Retry idempotent network calls on transient errors with capped exponential backoff and jitter; never retry non-idempotent ones blindly.
- Do not assume a TTY, a writable `$HOME`, a UTF-8 locale, a particular shell, or a fixed `PATH`.
- Remember that default macOS (APFS) and Windows filesystems are case-insensitive but case-preserving: `Config.yml` and `config.yml` are the same file, so do not create files differing only by case or rely on case to distinguish names.
- Handle paths with spaces, Unicode, and leading dashes.

**Verify:** Run with `</dev/null`, piped stdout, `HOME=` unset or read-only, `LANG=C`, and a path containing spaces; confirm sane behavior. On a case-insensitive filesystem, check for files or keys that differ only in case. Inject packet loss or a flaky proxy and confirm transient failures are retried and reported clearly.

## Signals and control characters

#### Two-stage Ctrl-C handler

The pattern used by `docker compose up`: the first Ctrl-C announces shutdown and starts bounded cleanup; the second skips cleanup and exits immediately.

```go
ctx, cancel := context.WithCancel(context.Background())
sigs := make(chan os.Signal, 2)
signal.Notify(sigs, os.Interrupt, syscall.SIGTERM)
go func() {
	<-sigs
	fmt.Fprintln(os.Stderr, "Stopping... (press Ctrl+C again to force)")
	cancel() // work observes ctx and stops; main then runs cleanup with a timeout
	<-sigs
	fmt.Fprintln(os.Stderr, "Forced exit; cleanup skipped")
	os.Exit(130)
}()
err := run(ctx)
cctx, done := context.WithTimeout(context.Background(), 5*time.Second)
defer done()
cleanup(cctx)
```

```python
import os, signal, sys

def force(signum, frame):
    print("Forced exit; cleanup skipped", file=sys.stderr)
    os._exit(130)

try:
    run()
except KeyboardInterrupt:
    print("Stopping... (press Ctrl+C again to force)", file=sys.stderr)
    signal.signal(signal.SIGINT, force)
    cleanup(timeout=5)
    sys.exit(130)
```

### CLI-SIG-001: Exit promptly on Ctrl-C and say so immediately

- **Level:** must
- **Severity:** high
- **Check:** probe, manual
- **Source:** <https://clig.dev/#signals>

When the user presses Ctrl-C (SIGINT), stop as soon as possible. Print a short acknowledgment to stderr right away, before starting any cleanup, so the user knows the keypress registered. Do not swallow SIGINT, and do not let blocking calls (network reads, subprocess waits, sleeps) ignore cancellation: propagate it through a context, cancellation token, or by letting `KeyboardInterrupt` unwind.

**Verify:** Start a long operation (`mytool sync`), press Ctrl-C, and confirm a message appears immediately and the process exits within a second or two. Non-interactively: `mytool sync & sleep 2; kill -INT $!; wait $!`.

### CLI-SIG-002: Bound cleanup with a timeout

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#signals>

Cleanup after an interrupt (flushing state, removing temp files, closing remote sessions) must not be able to hang forever. Give it a deadline (a few seconds is typical) and exit when it expires, telling the user what was left undone.

**Verify:** In source, confirm cleanup paths run under a timeout (`context.WithTimeout`, `asyncio.wait_for`, `AbortSignal.timeout`). Probe by interrupting while the remote endpoint is unreachable and confirm the process still exits within the bound.

### CLI-SIG-003: Let a second Ctrl-C skip cleanup and explain what that does

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** <https://clig.dev/#signals>

If cleanup may take a while, a second Ctrl-C should abandon it and exit at once. Tell the user about this option when the first Ctrl-C arrives, and spell out the consequence if skipping cleanup is destructive (e.g. "press Ctrl+C again to force-stop containers without a graceful shutdown"). See the handler snippets above.

**Verify:** Start an operation with slow cleanup, press Ctrl-C once and confirm the message mentions a second Ctrl-C; press it again and confirm immediate exit.

### CLI-SIG-004: Exit with status 130 after SIGINT

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

By shell convention, a process terminated by signal N reports status 128+N, so an interrupted CLI should exit 130 (128+2), and 143 after SIGTERM. Scripts and shells (`bash` loops, `make`, CI runners) use this to tell "user aborted" apart from "command failed" and to stop the enclosing loop. Never exit 0 after an interrupt. Alternatively, after cleanup, reset the handler to default and re-raise the signal so the parent sees a true signal death.

**Verify:** `mytool sync & sleep 2; kill -INT $!; wait $!; echo $?` prints `130`. grep for SIGINT/KeyboardInterrupt handlers and confirm they do not end in `exit(0)` or fall through to a normal return.

### CLI-SIG-005: Treat SIGTERM as a request for graceful shutdown

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Process supervisors, container runtimes (`docker stop`, Kubernetes), CI cancellation, and `timeout(1)` send SIGTERM, not SIGINT, and follow up with SIGKILL after a grace period (often 10 to 30 seconds). Handle SIGTERM through the same shutdown path as the first Ctrl-C, finishing well within that grace period. Python does not convert SIGTERM to an exception by default, so register a handler explicitly.

**Verify:** `mytool sync & sleep 2; kill -TERM $!; wait $!; echo $?` shows a prompt and clean exit with status 143 (or another documented non-zero code). In source, confirm SIGTERM is registered alongside SIGINT.

### CLI-SIG-006: Exit quietly when the downstream pipe closes

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

When output is piped to a command that stops reading early (`mytool list | head`, `| grep -m1`, `| less` then `q`), the next write fails with SIGPIPE/EPIPE. The tool should stop silently, without a stack trace or "broken pipe" error. Runtime defaults differ:

- C and Go: the default SIGPIPE action terminates the process silently. Go applies this to writes on stdout/stderr unless you `signal.Notify` for SIGPIPE.
- Python: raises `BrokenPipeError`. Catch it at the top level, point stdout at `os.devnull` (to avoid a second error at interpreter shutdown), and exit; or restore `signal.signal(signal.SIGPIPE, signal.SIG_DFL)` early in a pure CLI.
- Rust: ignores SIGPIPE, so `println!` panics. Use `writeln!` and treat `ErrorKind::BrokenPipe` as a clean exit.
- Node.js: handle `process.stdout.on("error", e => { if (e.code === "EPIPE") process.exit(0); })`.

**Verify:** `mytool list --all | head -1; echo "${PIPESTATUS[0]}"`. Stderr must be empty (no traceback or "broken pipe"), and the process must not keep running after `head` exits. A status of 141 (SIGPIPE) or 0 is acceptable.

### CLI-SIG-007: Start correctly when a previous run skipped cleanup

- **Level:** must
- **Severity:** high
- **Check:** manual
- **Source:** <https://clig.dev/#signals>

Because users force-quit, machines crash, and SIGKILL cannot be caught, assume any run may begin where an earlier one never cleaned up. On startup, detect and recover from stale lock files (check whether the recorded PID is alive), orphaned temp files, half-applied migrations, and partial downloads, instead of refusing to run or corrupting data. This is the other half of crash-only design (CLI-ROB-008).

**Verify:** Run a state-changing operation, `kill -9` it midway, then run the same and other commands again; they must succeed or give an actionable message, never a permanent "already running" or a corrupted-state error.
