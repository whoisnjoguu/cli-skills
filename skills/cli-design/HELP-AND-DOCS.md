# Help and documentation

How a CLI explains itself: concise and full help text, help flags and subcommands, examples, typo suggestions, and the web, terminal and man-page documentation behind them. Load this when designing or reviewing help output, usage errors, or a tool's documentation set.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

Help text gives a fast, in-context sense of what the tool is, which options exist, and how to do the common tasks. Documentation is the full reference: what the tool is for and not for, how it works, and how to do everything.

## Help text examples

The examples below use a fictional deploy tool, `shipit`.

#### Concise help

Shown when `shipit` is run without the arguments it requires. Short description, one or two examples, the key flags, and a pointer to `--help`.

```
$ shipit
shipit - deploy a build to an environment

Usage: shipit deploy <env> [flags]

Examples:
  shipit deploy staging
  shipit deploy prod --tag v1.4.2 --wait

Run 'shipit --help' for all commands and flags.
```

#### Full help

Shown for `shipit --help`, `shipit -h` and `shipit help`. Examples first, common commands before rare ones, bold-able section headings, support and docs links at the end.

```
$ shipit --help
Deploy builds to staging and production environments.

USAGE
  shipit <command> [flags]

EXAMPLES
  $ shipit deploy staging                  # deploy the latest build
  $ shipit deploy prod --tag v1.4.2 --wait # deploy a tag and wait for health checks
  $ shipit rollback prod                   # restore the previous release

COMMON COMMANDS
  deploy      Deploy a build to an environment
  status      Show what is running in each environment
  rollback    Restore the previous release

OTHER COMMANDS
  envs        List and configure environments
  login       Authenticate with the deploy service
  help        Show help for a command

FLAGS
  -t, --tag <ref>    Build tag or commit to deploy (default: latest)
  -w, --wait         Block until health checks pass
      --json         Print machine-readable output
  -q, --quiet        Suppress progress output
  -h, --help         Show this help

Docs:    https://shipit.example.dev/docs
Issues:  https://github.com/example/shipit/issues
Run 'shipit help <command>' for details on a command.
```

#### Common pitfalls

- **Help on stderr.** Explicitly requested help (`--help`, `-h`, `help`) is the program's output, so it goes to stdout. On stderr, `shipit --help | less` and `shipit --help | grep tag` silently show nothing useful.
- **Help exiting non-zero.** A user who asks for help got what they asked for: exit `0`. Some frameworks exit `1` or `2` for `--help`; override that. (Concise help shown *because required arguments were missing* is a usage error: printing it to stderr with exit `2` is reasonable, as long as it is consistent.)
- **`-h` hijacked.** Using `-h` for `--host`, `--human-readable` or `--header` means users cannot rely on `-h` for help, and appending `-h` to a long command may execute it. Reserve `-h` for help.
- **Help that needs a working environment.** `--help` must not require config, credentials, network or a valid project directory; it must not run the command.
- **Escape codes in piped help.** Bold or color headings must disappear when stdout is not a TTY or `NO_COLOR` is set.

## Help

### CLI-HLP-001: Show full help for -h and --help, including on subcommands

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** <https://clig.dev/#help>

Both `-h` and `--help` must print the complete help text for the program. Every subcommand that has its own flags or arguments must also accept `-h`/`--help` and print help specific to that subcommand. Explicitly requested help goes to stdout and exits `0`.

**Verify:** Run `mytool --help | cat; echo $?` and `mytool -h | cat; echo $?` (expect identical help on stdout, exit `0`). Repeat for each subcommand: `mytool <sub> --help | cat`. Check `mytool --help 2>/dev/null` still shows the help.

### CLI-HLP-002: Show help when -h or --help appears anywhere, ignoring other arguments

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** <https://clig.dev/#help>

A user should be able to append `-h` or `--help` to any command line, however long or invalid, and get help instead of execution or a parse error. Other flags and arguments present alongside it are ignored. This matters most for destructive commands: `mytool delete prod --help` must never delete anything.

**Verify:** In a safe sandbox, run `mytool <sub> some-arg --bogus-flag --help | cat; echo $?` and `mytool <sub> some-arg -h | cat`; expect help and exit `0`, with no side effects and no "unknown flag" error.

### CLI-HLP-003: Reserve -h for help

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#help>

Do not assign `-h` to any other meaning (host, header, human-readable, height). Users reflexively type `-h` expecting help, and overloading it turns a request for help into an execution with an unexpected value.

**Verify:** Grep flag definitions for a short name `h` bound to anything but help (e.g., `short = 'h'`, `"h"` alias, `-h, --host`). Probe `mytool -h | cat` prints help.

### CLI-HLP-004: Offer a help subcommand in git-like tools

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://clig.dev/#help>

If the tool uses subcommands, `mytool help` must show top-level help and `mytool help <sub>` must show the same help as `mytool <sub> --help`. Nested subcommands follow the same pattern (`mytool help remote add`).

**Verify:** Compare `mytool help <sub> | cat` with `mytool <sub> --help | cat`; they should match. `mytool help | cat` should match `mytool --help | cat`.

### CLI-HLP-005: Show concise help when required arguments are missing

- **Level:** must
- **Severity:** medium
- **Check:** probe
- **Source:** <https://clig.dev/#help>

When `mytool` or `mytool <sub>` cannot do anything without arguments and is run with none, print concise help rather than a bare error or nothing. Programs that are interactive by default (like `npm init`) are exempt; they start their interactive flow instead. Choose consistently between stdout/exit `0` and stderr/exit `2` for this case (see pitfalls above).

**Verify:** Run `mytool; echo $?` and `mytool <sub-requiring-args>; echo $?` and confirm a short usage block appears instead of a stack trace, a terse "missing argument" line alone, or a hang.

### CLI-HLP-006: Limit concise help to a description, examples, key flags and a pointer to --help

- **Level:** should
- **Severity:** low
- **Check:** probe, manual
- **Source:** <https://clig.dev/#help>

Concise help contains only: what the program does (one line or short paragraph), one or two example invocations, flag descriptions (only if there are few), and an instruction to run `--help` for more. `jq` with no arguments is a good model: description, usage, an example, then "use jq --help".

**Verify:** Run `mytool | cat` (or `mytool 2>&1 | cat`) and check it fits on one screen, contains an example and ends with a `--help` pointer.

### CLI-HLP-007: Include a support path in top-level help

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** <https://clig.dev/#help>

Top-level help should tell users where to send feedback and report problems, typically an issue tracker URL or support site.

**Verify:** `mytool --help | grep -Ei 'issues|support|bug|feedback|https?://'` finds a support link.

### CLI-HLP-008: Link help text to web documentation

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** <https://clig.dev/#help>

Help text should link to the web documentation, and subcommand help should link directly to that subcommand's page or anchor when one exists. This is where longer explanations, background and further reading live.

**Verify:** `mytool --help | grep -E 'https?://'` and `mytool <sub> --help | grep -E 'https?://'`; open the links and confirm they resolve to the relevant page.

### CLI-HLP-009: Lead help with examples

- **Level:** should
- **Severity:** low
- **Check:** probe, manual
- **Source:** <https://clig.dev/#help>

Users reach for examples before reading flag tables, so put examples near the top of help, emphasizing common and common-but-complex uses. Show the actual output when it clarifies behavior and is short. A sequence of examples that builds from simple to advanced can teach the tool on its own.

**Verify:** `mytool --help | cat` and `mytool <sub> --help | cat` contain an examples section positioned before or immediately after usage, not buried after every flag.

### CLI-HLP-010: Move exhaustive examples and tutorials out of help

- **Level:** consider
- **Severity:** info
- **Check:** manual
- **Source:** <https://clig.dev/#help>

Exhaustive or advanced examples are valuable but bloat help. Put them in a cheat-sheet command (`mytool examples`) or a web page, and link to it. For complex scenarios, such as integrating with another tool, write a full tutorial.

**Verify:** If help exceeds a couple of screens mostly due to examples, check whether an examples command or linked page exists instead.

### CLI-HLP-011: List the most common flags and commands first

- **Level:** should
- **Severity:** low
- **Check:** probe, manual
- **Source:** <https://clig.dev/#help>

Many flags are fine, but order help so the most-used commands and flags appear first, grouped by task if useful, as `git` does with "start a working area" and "work on the current change". Alphabetical-only listings bury the essentials.

**Verify:** `mytool --help | head -40` shows the handful of commands/flags most users need; rare or advanced options appear later or in a separate group.

### CLI-HLP-012: Format help for scanning, without leaking escape codes

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** <https://clig.dev/#help>

Use headings (bold when the terminal supports it), consistent indentation and aligned columns so help is easy to scan. Formatting must be terminal-independent: emit ANSI styling only when stdout is a TTY and `NO_COLOR`/`TERM=dumb` are not set, so piped help and pagers show clean text.

**Verify:** `mytool --help | cat -v | grep -F '^['` must return nothing. `NO_COLOR=1 mytool --help` shows no styling. In a TTY, headings are visually distinct.

### CLI-HLP-013: Suggest a correction when input is probably a typo

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** <https://clig.dev/#help>

If the user's input is invalid but you can guess the intent, such as a misspelled subcommand or flag, or a known wrong-command pattern like `brew update jq` meaning `brew upgrade jq`, say what they probably meant. You may offer to run the suggestion with a prompt, but never force it. Most parser libraries provide edit-distance suggestions; turn them on.

```
$ mytool stauts
error: unknown command "stauts"
Did you mean "status"?
```

**Verify:** `mytool stauts; echo $?` and `mytool --verbsoe; echo $?` print a suggestion and exit non-zero.

### CLI-HLP-014: Do not silently execute a guessed correction

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#help>

Running the corrected command as if the user had typed it is risky: invalid input may reflect a logic error or a mis-expanded shell variable rather than a typo, and guessing wrong on a state-changing command can cause damage. It also hides the correct syntax from the user. Auto-correction, if offered at all, must require confirmation in an interactive terminal and must never apply to destructive or state-changing operations in non-interactive use.

If you deliberately accept an alternate spelling or syntax, treat it as a permanent, supported part of the interface and document both forms.

**Verify:** `mytool delet <target> < /dev/null` must not delete; it should error with a suggestion. In source, check that fuzzy-match results are only printed or prompted for, never dispatched directly. Check that any accepted aliases appear in help/docs.

### CLI-HLP-015: Do not hang waiting on an interactive stdin

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#help>

If the command expects input piped to it and stdin is an interactive terminal, don't sit silently waiting the way `cat` does. Either print help and exit immediately, or print a message to stderr explaining what it is waiting for (e.g., "Reading from stdin; press Ctrl-D to finish").

```go
if term.IsTerminal(int(os.Stdin.Fd())) && len(args) == 0 {
    fmt.Fprintln(os.Stderr, "error: no input; pipe data in or pass a file. See 'mytool --help'.")
    os.Exit(2)
}
```

**Verify:** In an interactive terminal, run the stdin-consuming command with no input or file argument: it must exit with help or print a stderr hint immediately. In source, look for an `isatty(stdin)` check before reading stdin.

## Documentation

### CLI-DOC-001: Provide web-based documentation

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#documentation>

Publish documentation on the web. It is searchable, linkable to specific sections, and accessible to the widest range of users and tools. Give each command and important concept a stable URL or anchor so help text and error messages can link to it.

**Verify:** Locate the docs URL (from help, README or package metadata), confirm it loads, and check per-command pages or anchors exist.

### CLI-DOC-002: Provide documentation in the terminal

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://clig.dev/#documentation>

Ship documentation with the tool so it is available in the terminal: fast to reach, matched to the installed version, and usable offline. Detailed per-command help, a `help <topic>` command, or bundled man pages all qualify; the content must come from the installed binary or package, not fetched at runtime.

**Verify:** With networking disabled, run `mytool help <sub> | cat` or `man mytool` and confirm detailed docs appear. Compare `mytool --version` with any version shown in the docs.

### CLI-DOC-003: Consider shipping man pages

- **Level:** consider
- **Severity:** info
- **Check:** probe, static
- **Source:** <https://clig.dev/#documentation>

Many users instinctively try `man mytool` first. Generate man pages from the same source as your web docs or your parser definitions (e.g., ronn, pandoc, `clap_mangen`, Cobra's `doc.GenManTree`, `click-man`) and install them with the package so they never drift from the binary.

**Verify:** `man -w mytool` finds a page after installation; the build or packaging config (Makefile, goreleaser, Homebrew formula, deb/rpm spec) generates and installs it.

### CLI-DOC-004: Make terminal docs reachable through the tool itself

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** <https://clig.dev/#documentation>

`man` is unknown to some users and unavailable on some platforms (notably Windows), so don't make man pages the only route. Expose the same content through the tool, as `git help <cmd>` and `npm help ls` do (the latter being equivalent to `man npm-ls`).

**Verify:** `mytool help <sub> | cat` shows the full documentation for that subcommand without requiring `man` to be installed.
