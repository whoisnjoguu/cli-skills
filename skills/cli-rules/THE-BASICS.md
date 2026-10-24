# The basics

The non-negotiable foundations of any command-line program: parse arguments with a real library, report success and failure through exit codes, and keep primary output on stdout separate from messaging on stderr. Load this file first when starting a new CLI or auditing an existing one; violations here break scripts and pipelines outright.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Argument-parsing libraries

Prefer the standard library parser for small tools and a full framework once you have subcommands, generated help, or shell completion. The libraries below handle flag syntax, `--` termination, help generation and (often) typo suggestions correctly.

| Language | Recommended libraries | Notes |
| --- | --- | --- |
| Multi-platform | [docopt](http://docopt.org) | Help text is the spec; largely unmaintained, prefer native options below |
| Bash / POSIX sh | [argbash](https://argbash.dev), `getopts` (builtin) | `getopts` has no long options; argbash generates them |
| C / C++ | `getopt_long` (libc), [CLI11](https://github.com/CLIUtils/CLI11), [cxxopts](https://github.com/jarro2783/cxxopts) | |
| C# / .NET | [System.CommandLine](https://github.com/dotnet/command-line-api), [Spectre.Console.Cli](https://spectreconsole.net/cli/) | |
| Deno | [`@std/cli` parseArgs](https://jsr.io/@std/cli/doc/parse-args/~/parseArgs), [Cliffy](https://cliffy.io) | |
| Elixir | `OptionParser` (stdlib) | |
| Go | [Cobra](https://github.com/spf13/cobra), [urfave/cli](https://github.com/urfave/cli), [Kong](https://github.com/alecthomas/kong), `flag` (stdlib) | stdlib `flag` uses single-dash long flags; avoid for user-facing tools |
| Haskell | [optparse-applicative](https://hackage.haskell.org/package/optparse-applicative) | |
| Java | [picocli](https://picocli.info/) | Supports GraalVM native images |
| Julia | [ArgParse.jl](https://github.com/carlobaldassi/ArgParse.jl), [Comonicon.jl](https://github.com/comonicon/Comonicon.jl) | |
| Kotlin | [Clikt](https://ajalt.github.io/clikt/) | |
| Node.js / TypeScript | [oclif](https://oclif.io/), [Commander](https://github.com/tj/commander.js), [yargs](https://yargs.js.org), `util.parseArgs` (stdlib, Node ≥ 18.3) | |
| Perl | [Getopt::Long](https://metacpan.org/pod/Getopt::Long) | |
| PHP | [symfony/console](https://github.com/symfony/console), [CLImate](https://climate.thephpleague.com) | |
| Python | [argparse](https://docs.python.org/3/library/argparse.html) (stdlib), [Click](https://click.palletsprojects.com/), [Typer](https://github.com/fastapi/typer) | |
| Ruby | [TTY toolkit](https://ttytoolkit.org/), [Thor](https://github.com/rails/thor), `OptionParser` (stdlib) | |
| Rust | [clap](https://docs.rs/clap), [argh](https://github.com/google/argh), [lexopt](https://github.com/blyxxyz/lexopt) | clap derive is the de facto default |
| Swift | [swift-argument-parser](https://github.com/apple/swift-argument-parser) | |
| Zig | [zig-clap](https://github.com/Hejsil/zig-clap) | |

## Exit codes

Scripts, CI systems and `set -e` shells only see the exit status. Treat it as part of your public interface: document every code you emit and never change the meaning of an existing one.

| Code | Meaning | Who sets it |
| --- | --- | --- |
| `0` | Success | Your program |
| `1` | General / unspecified failure | Your program |
| `2` | Usage error: bad flag, missing argument, invalid value | Your program (most parsers default to this) |
| `3`–`125` | Tool-specific failure modes you define and document | Your program |
| `126` | Command found but not executable (permissions) | The shell |
| `127` | Command not found | The shell |
| `128+N` | Terminated by signal N (e.g. `137` = SIGKILL, `143` = SIGTERM) | The shell / your signal handler |
| `130` | Interrupted by Ctrl-C (SIGINT, 128+2) | Your SIGINT handler should exit with this |

Optional convention: BSD [`sysexits.h`](https://man.freebsd.org/cgi/man.cgi?query=sysexits) defines `64`–`78` (`EX_USAGE`=64, `EX_DATAERR`=65, `EX_NOINPUT`=66, `EX_UNAVAILABLE`=69, `EX_SOFTWARE`=70, `EX_CANTCREAT`=73, `EX_TEMPFAIL`=75, `EX_NOPERM`=77, `EX_CONFIG`=78). Use it if it fits, but do not mix it inconsistently with `2` for usage errors; pick one scheme. Avoid codes above 125, which collide with shell meanings, and remember only the low 8 bits survive (`exit 256` is `0`).

## Rules

### CLI-BAS-001: Parse arguments with an established library

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** <https://clig.dev/#the-basics>

Use the language's built-in parser or a well-maintained third-party one (see the table above) instead of hand-rolling `argv` handling. Libraries get the details right that hand-written parsers miss: combined short flags (`-xvf`), `--flag=value` and `--flag value`, the `--` end-of-options marker, generated help, consistent usage errors, and often "did you mean" suggestions.

Don't: loop over `sys.argv` / `os.Args` / `process.argv` with string comparisons for anything beyond a single positional argument.

**Verify:** Inspect the dependency manifest and entry point for a recognized parser (`clap`, `cobra`, `click`, `argparse`, `commander`, etc.). Grep for manual indexing such as `sys.argv[`, `os.Args[`, `process.argv.slice` driving flag logic. Probe `mytool --definitely-not-a-flag; echo $?` and `mytool -- -literal` behave sanely.

### CLI-BAS-002: Exit zero on success and non-zero on failure

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#the-basics>

The exit status is the only signal scripts reliably check. Every failure path, including caught exceptions, partial failures and failed network calls, must end with a non-zero status; every successful run must end with `0`. A tool that prints an error and exits `0` silently breaks `&&` chains, `set -e` and CI.

```python
def main() -> int:
    try:
        run()
    except UsageError as e:
        print(f"error: {e}", file=sys.stderr); return 2
    except AppError as e:
        print(f"error: {e}", file=sys.stderr); return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

**Verify:** Run a known-failing invocation (missing file, bad flag) and a successful one, checking `echo $?` after each. Grep for error handlers that log and then `return`/`exit(0)`, and for top-level `catch` blocks that swallow errors.

### CLI-BAS-003: Map distinct non-zero exit codes to the important failure modes

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://clig.dev/#the-basics>

Beyond zero/non-zero, give callers a way to distinguish the failures they would react to differently: usage error (`2`) vs. runtime error (`1`) at minimum, plus tool-specific codes for cases like "not found", "conflict" or "auth required" when scripts plausibly branch on them. Define codes as named constants in one place, document them (help or man page), and keep them stable across releases. Exit `130` on SIGINT.

**Verify:** Look for a single exit-code enum/constant block and its documentation. Probe `mytool --bogus; echo $?` (expect `2` or your documented usage code). Confirm no codes above 125 are used for application errors.

### CLI-BAS-004: Send primary and machine-readable output to stdout

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#the-basics>

The command's actual result (the data the user asked for) goes to stdout, because that is what pipes and redirections capture by default. Anything intended for machine consumption, such as JSON, CSV, IDs or paths, must go to stdout and nowhere else.

**Verify:** `mytool <cmd> 2>/dev/null` must still show the full result; `mytool <cmd> --json 2>/dev/null | jq .` must parse. Grep for results written via `stderr`, `console.error`, `eprintln!` or `log.*`.

### CLI-BAS-005: Send logs, progress, warnings and errors to stderr

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#the-basics>

Diagnostic messaging (log lines, progress indicators, warnings, errors, prompts' surrounding chatter) belongs on stderr. That way it still reaches the user's terminal when stdout is piped, but never contaminates the data flowing into the next command.

Do: `fmt.Fprintln(os.Stderr, "fetching 3 repos...")`, `eprintln!`, `console.error`, `print(..., file=sys.stderr)`, and configure logging handlers to stderr. Don't: print "Done!" or spinners to stdout in a command whose stdout is data.

**Verify:** `mytool <cmd> 2>/dev/null` shows no log/progress/error text; `mytool <cmd> 1>/dev/null` shows only messaging. Run a failing case with `mytool bad-input 2>/dev/null` and confirm stdout is empty. Check logger configuration in source targets stderr.
