# Arguments and flags

How a CLI should accept input on the command line: positional arguments versus flags, naming, defaults, prompting, confirmation of dangerous actions, stdin/stdout conventions, ordering, and secrets. Load this when designing a command's parameters, reviewing a parser definition, or auditing how a tool takes input.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Terminology

- **Arguments (args)** are positional parameters. Position carries meaning: `cp a b` and `cp b a` do different things.
- **Flags** are named parameters: a single hyphen with one letter (`-r`) or a double hyphen with a word (`--recursive`). A flag may take a value (`--file foo.txt` or `--file=foo.txt`). Flag order normally does not change semantics.
- **`--`** marks the end of options. Everything after it is a positional argument, even if it starts with `-` (`mytool rm -- -weird-filename`).

Use an established argument-parsing library (Go: cobra/pflag or urfave/cli; Rust: clap; Python: argparse, click or typer; Node: commander, yargs or `util.parseArgs`). Hand-rolled parsers routinely get `--`, `--flag=value` versus `--flag value`, combined short flags (`-xvf`), and error messages wrong.

## Standard flag names

Reuse these meanings when your tool has the matching concept. Rows marked "common convention" are not in clig.dev's list but are widespread in modern tools.

| Flag | Short | Meaning |
| --- | --- | --- |
| `--all` | `-a` | Include everything (as in `ps -a`, `fetchmail -a`). |
| `--debug` | `-d` | Print debugging output. |
| `--force` | `-f` | Proceed without the usual safety checks or confirmation (as in `rm -f`); the scripted way to approve a destructive action. |
| `--json` | | Emit JSON instead of human-formatted output. |
| `--help` | `-h` | Show help. Never give `-h` any other meaning. |
| `--dry-run` | `-n` | Do nothing; describe what would change (as in `rsync -n`, `git add -n`). |
| `--no-input` | | Never prompt; fail with instructions if input is missing. |
| `--output` | `-o` | Output file (as in `sort -o`, `gcc -o`). |
| `--port` | `-p` | Port number (as in `psql -p`, `ssh -p`). |
| `--quiet` | `-q` | Reduce output; useful for hiding human-oriented chatter in scripts. |
| `--user` | `-u` | User (as in `ps -u`, `ssh` user selection). |
| `--version` | | Print the version. |
| `--verbose` / `--version` | `-v` | Ambiguous: tools use `-v` for either. Pick one deliberately and document it, or leave `-v` unassigned; clig.dev suggests `-d` for verbosity and `-v` for version if you assign it at all. |
| `--no-color` | | Disable colored output (common convention; pairs with the `NO_COLOR` environment variable). |
| `--format` | | Select an output format, e.g. `--format=json\|yaml\|table` (common convention). |
| `--config` | `-c` | Path to a configuration file (common convention). |
| `--yes` | `-y` | Answer yes to confirmation prompts (common convention, as in `apt-get -y`); keep separate from `--force` if forcing also bypasses safety checks. |

## Rules

### CLI-ARG-001: Prefer flags over positional arguments

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

Named flags make invocations self-describing and leave room to evolve. With positional arguments, adding a new input later often forces ambiguity or a breaking change in position meaning. The extra typing is worth it.

- Do: `mytool deploy --env staging --region eu-west-1`
- Don't: `mytool deploy staging eu-west-1`

**Verify:** Read the parser definitions and `mytool <cmd> --help | cat`. Flag any command that takes two or more positional arguments that are not interchangeable items of the same kind (see CLI-ARG-005) and are not a well-known idiom like `<source> <destination>`.

### CLI-ARG-002: Provide a long form for every flag

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

Every short flag must have a `--long-name` equivalent (`-h` and `--help`, `-o` and `--output`). Scripts should be able to spell out intent so readers do not have to look up what `-x` means. Long-only flags are fine; short-only flags are not.

**Verify:** In `mytool --help | cat` and each `mytool <cmd> --help | cat`, every listed `-x` has a `--word` partner. In source, grep flag definitions for entries with a short name and an empty long name.

### CLI-ARG-003: Reserve one-letter flags for frequently used options

- **Level:** should
- **Severity:** low
- **Check:** static, manual
- **Source:** <https://clig.dev/#arguments-and-flags>

The short-flag namespace has only ~52 letters and is shared by every global flag. Spending letters on rarely used options forces later, more important flags into awkward letters or case tricks. Be especially sparing at the top level of a tool with subcommands, where global short flags shadow every subcommand.

**Verify:** List all short flags (top-level and per subcommand). Each should correspond to an option users type often or to a standard name from the table above. Flag obscure options that hold a short letter, and global short flags that collide with a subcommand's.

### CLI-ARG-004: Accept multiple arguments for the same action on many items

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

When a command performs a simple action on files or items, accept any number of them (`rm a.txt b.txt c.txt`). This makes shell globbing work (`mytool fmt *.go`) and avoids loops in scripts. Decide and document behavior when some items fail: process the rest, report each failure on stderr, exit non-zero.

**Verify:** Run a read-only command with several inputs, e.g. `mytool lint a.txt b.txt; echo $?`. Both should be processed. With one nonexistent path among valid ones, the valid items should still be handled and the exit code non-zero.

### CLI-ARG-005: Avoid multiple positional arguments with different roles

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://clig.dev/#arguments-and-flags>

If a command needs two or more positional arguments that mean different things, that is usually a design smell; make all but at most one of them flags. The exception is a very common primary action whose shape users will memorize, such as `cp <source> <destination>`.

**Verify:** In usage strings, flag signatures like `mytool cmd <a> <b> <c>` where the positions have distinct meanings and the command is not the tool's core, frequently used operation.

### CLI-ARG-006: Use standard flag names where a convention exists

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

If a widely used tool already has a flag for the concept, use the same name and short letter (see the table above). Users can then guess flags without reading help, and do not have to remember per-tool variants. Never repurpose a standard name for an unrelated meaning (for example `-h` for `--host`, `-n` for `--name`, or `-f` for `--file` in a tool that also needs a force flag).

**Verify:** Compare `mytool --help | cat` against the standard table. Flag synonyms for standard concepts (`--simulate` instead of `--dry-run`, `--silent` without `--quiet`, `--out` without `--output`) and any standard short letter bound to a different meaning, especially `-h`.

### CLI-ARG-007: Do not make -v ambiguous

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

`-v` means verbose in some tools and version in others. Choose one meaning, apply it consistently across every subcommand, and document it; or leave `-v` unbound and require `--verbose`/`--version`. Never let `-v` mean version at the top level and verbose in a subcommand.

**Verify:** Run `mytool -v | cat` and `mytool <cmd> --help | cat` for several subcommands; `-v` must have the same meaning everywhere it appears.

### CLI-ARG-008: Make the default behavior right for most users

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#arguments-and-flags>

Configuration is useful, but most users never discover a flag or forget to pass it every time. If the better behavior is behind a flag, most users get the worse experience. Choose defaults for the common case today, not for historical reasons; `ls` would likely default to something like `ls -lhF` if designed now. Keep script-friendliness through explicit machine-output flags (`--json`, `--plain`) rather than by making the human default terse.

**Verify:** Review the flags most commonly passed in docs, examples, and issue reports. If nearly every example passes the same flag, that behavior should probably be the default.

### CLI-ARG-009: Prompt for missing input when running interactively

- **Level:** should
- **Severity:** low
- **Check:** static, manual
- **Source:** <https://clig.dev/#arguments-and-flags>

If a required argument or flag is missing and stdin is a TTY, ask for it instead of failing. Show what is being requested, offer a default where sensible, and accept the same values the flag accepts. Never prompt for a secret with echo on (see the interactivity guidance).

**Verify:** In a real terminal, run a command that needs input without supplying it, e.g. `mytool init`. It should prompt. Confirm the source checks `isatty(stdin)` before prompting.

### CLI-ARG-010: Never require a prompt

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

Everything a prompt can collect must also be passable as a flag or argument. When stdin is not an interactive terminal, or `--no-input` is set, do not prompt: fail fast with a non-zero exit and a message naming the flag to pass. A prompt in CI or a pipe hangs forever or reads garbage.

```python
import sys

def get_name(args):
    if args.name:
        return args.name
    if sys.stdin.isatty() and not args.no_input:
        return input("Project name: ")
    sys.exit("error: missing project name; pass --name NAME")
```

**Verify:** Run with stdin detached, e.g. `mytool init </dev/null; echo $?` and `mytool init --no-input; echo $?`. Each must exit promptly with a non-zero code and an error naming the required flag, never block.

### CLI-ARG-011: Confirm before dangerous operations

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

Before a destructive or hard-to-reverse action, ask for confirmation when interactive (`y`/`yes`), and when not interactive require an explicit `--force` (or `--yes`) instead of proceeding silently. Without a TTY and without the flag, refuse and explain which flag approves the action.

**Verify:** Against a disposable or nonexistent target, run `mytool delete thing </dev/null; echo $?`. It must refuse with a non-zero exit and mention `--force`/`--yes`, not delete. In source, confirm destructive paths are gated by a prompt or the force flag.

### CLI-ARG-012: Scale confirmation friction to the level of danger

- **Level:** should
- **Severity:** high
- **Check:** manual
- **Source:** <https://clig.dev/#arguments-and-flags>

"Dangerous" is a spectrum. Match the safeguard to the risk:

| Level | Examples | Safeguard |
| --- | --- | --- |
| Mild | Deleting one local file | Optional prompt; skip it if the user literally ran a `delete` command. |
| Moderate | Deleting a directory, deleting a remote resource, bulk changes that are hard to undo | Prompt for confirmation; offer `--dry-run` to preview. |
| Severe | Deleting an entire remote app, server, database or account | Make accidental confirmation hard: require typing the resource name. Offer `--confirm=<name>` so scripts can still do it. |

```text
$ mytool app destroy prod-api
This permanently deletes app "prod-api" and all its data.
Type the app name to confirm: prod-api
```

**Verify:** For each destructive command, classify its level and check the safeguard matches. Severe operations must not be confirmable by a bare `y` and must accept `--confirm=<name>` (or equivalent) for non-interactive use.

### CLI-ARG-013: Treat indirect destruction as severe

- **Level:** should
- **Severity:** high
- **Check:** manual
- **Source:** <https://clig.dev/#arguments-and-flags>

Look for non-obvious paths to data loss: lowering a replica count from 10 to 1 in a config file implicitly deletes nine things. Such changes deserve the same friction as an explicit severe delete: show what will be removed, and require explicit confirmation or a confirm flag.

**Verify:** Review commands that apply or sync declarative state (`apply`, `sync`, `scale`, `prune`). Check that the plan of implied deletions is shown and confirmation is required before they happen; a `--dry-run` should list them.

### CLI-ARG-014: Accept - for stdin and stdout wherever a file is expected

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

When an input or output is a file path, treat `-` as stdin (for input) or stdout (for output). This lets the tool sit in a pipeline without temporary files, e.g. `curl -sL https://example.com/x.tar.gz | tar xvf -`.

```python
import sys

def open_input(path):
    return sys.stdin if path == "-" else open(path)

def open_output(path):
    return sys.stdout if path == "-" else open(path, "w")
```

**Verify:** `printf 'data\n' | mytool convert --input - --output - | cat` should process stdin and write to stdout without creating a file named `-`.

### CLI-ARG-015: Use a sentinel word such as none for optional flag values

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

If a flag's value can be "nothing" (no config file, no proxy, no limit), accept an explicit word like `none` (as `ssh -F none` does). Do not rely on an empty string or on a flag whose value may be omitted; that makes it ambiguous whether the next token is the flag's value or a positional argument.

**Verify:** Run e.g. `mytool --config none status | cat`; it should run with no config file rather than looking for a file named `none` or erroring. In source, check for optional-value flags (`nargs='?'`, `NoOptDefVal`) that swallow the next token.

### CLI-ARG-016: Make flags and subcommands order-independent

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

Users fix a failing command by pressing the up arrow and appending a flag. If global flags only work before the subcommand, that habit fails with "unknown flag". Accept global flags anywhere where your parser allows it.

- Go/cobra: define globals on the root's `PersistentFlags()`.
- Rust/clap: mark globals with `#[arg(global = true)]`.
- Python/argparse: add globals to a parent parser passed via `parents=[...]` to every subparser. click options on a group must precede the subcommand, so repeat shared options on subcommands if order-independence matters.

**Verify:** For each global flag, run both orders, e.g. `mytool --json list | cat` and `mytool list --json | cat`. Both must succeed with the same result.

### CLI-ARG-017: Support standard option syntax: --flag=value, --flag value and --

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Users and scripts write both `--output=out.txt` and `--output out.txt`; both must work. `--` must end option parsing so arguments beginning with `-` can be passed through (`mytool grep -- -pattern`), which is essential for wrappers that forward arguments to another program. Get this from a mainstream parsing library rather than custom code.

**Verify:** Run `mytool cmd --output=a.txt` and `mytool cmd --output a.txt` (with `--dry-run` if available) and confirm identical behavior. Run `mytool cmd -- -x` and confirm `-x` is treated as a positional argument, not an unknown flag.

### CLI-ARG-018: Never accept secrets as flag values

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

A secret passed as `--password hunter2` or `--token abc` is visible to other users via `ps` and `/proc/<pid>/cmdline`, and lands in shell history and CI logs. Such flags also nudge users toward exporting secrets in environment variables, which leak through child processes, debug dumps and logs. Wrapping a file read in the flag (`--password "$(< pw.txt)"`) has exactly the same exposure.

**Verify:** grep flag definitions for `password`, `passwd`, `secret`, `token`, `api-key`, `apikey`, `credential`, `private-key`. Any such flag that takes the secret value itself is a violation; flags taking a path (`--password-file`) are fine. Check `mytool --help | cat` for the same.

### CLI-ARG-019: Accept secrets through a file or stdin

- **Level:** should
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

Provide a `--<name>-file <path>` flag (works with files, mounted secrets, and process substitution like `<(pass show x)`), a `--<name>-stdin` mode, or an interactive no-echo prompt when on a TTY. Strip a single trailing newline from file contents, and never echo the secret back in output, errors or debug logs.

```go
func readSecret(path string) (string, error) {
	var b []byte
	var err error
	if path == "-" {
		b, err = io.ReadAll(os.Stdin)
	} else {
		b, err = os.ReadFile(path)
	}
	return strings.TrimRight(string(b), "\r\n"), err
}
```

**Verify:** `printf 's3cret\n' | mytool login --password-stdin` (or `--password-file -`) authenticates or fails with an auth error, not a usage error. Run with `--debug` and confirm the secret value never appears in output.
