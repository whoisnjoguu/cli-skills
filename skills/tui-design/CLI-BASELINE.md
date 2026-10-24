# CLI baseline for TUIs

A TUI is still a command-line program. Its flags, exit codes, help and non-interactive paths must meet the same baseline as any CLI before the full-screen experience matters. This file restates the [cli-design](https://github.com/whoisnjoguu/cli-skills/tree/main/skills/cli-design) rules that apply to every TUI, keeping their IDs, titles, levels and severities, with TUI-specific guidance. Install the `cli-design` skill for the full catalog.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Rules

### CLI-BAS-001: Parse arguments with an established library

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** <https://clig.dev/#the-basics>

Use the language's established argument parser for the program's flags and subcommands, even if the main experience is full-screen. Hand-rolled parsing breaks `--flag=value`, `--`, combined short flags and help generation.

**Verify:** Find where `argv` is read. A TUI that inspects `os.Args`/`sys.argv` by index instead of using a parser fails.

### CLI-BAS-002: Exit zero on success and non-zero on failure

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#the-basics>

Exit 0 when the user quits normally and non-zero when the app fails to start or exits on an error. Wrappers, shell `&&` chains and launchers rely on the status.

**Verify:** Run `mytui --version; echo $?` and `mytui --definitely-unknown; echo $?`. Inspect the quit and fatal-error paths for the exit status they return.

### CLI-BAS-003: Map distinct non-zero exit codes to the important failure modes

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://clig.dev/#the-basics>

Document distinct exit codes for the failure modes scripts care about (usage error, config error, cannot open a terminal), and keep them stable.

**Verify:** Look for a documented exit-code table and the constants that implement it.

### CLI-BAS-004: Send primary and machine-readable output to stdout

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#the-basics>

Non-interactive output (`--version`, `--help`, `--json`, print modes) goes to stdout. When the app runs as a picker, print the selection on stdout and draw the UI on `/dev/tty` or stderr, so `vim $(mytui pick)` works.

**Verify:** Run the non-interactive commands with stdout piped and check the payload arrives on stdout. For pickers, check the UI opens `/dev/tty` (or renders to stderr) rather than stdout.

### CLI-BAS-005: Send logs, progress, warnings and errors to stderr

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#the-basics>

Before the UI starts and after it exits, warnings and errors go to stderr. While the UI is running, nothing may write to stdout or stderr directly: route logs to a file (see [ARCHITECTURE.md](ARCHITECTURE.md)).

**Verify:** Grep for direct `print`/`fmt.Println`/`console.log` calls reachable while the UI runs, and check startup errors are written to stderr.

### CLI-HLP-001: Show full help for -h and --help, including on subcommands

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** <https://clig.dev/#help>

Every TUI still answers `-h`/`--help` with text on stdout and exits 0 without entering the alternate screen. In-app help (`?`) does not replace it.

**Verify:** Run `mytui --help | cat` and `mytui -h | cat`: help text must print, the terminal must not switch screens, and the exit status must be 0.

### CLI-HLP-003: Reserve -h for help

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#help>

Do not reuse `-h` for anything other than help (for example, height or host).

**Verify:** Read the flag definitions for a non-help `-h`.

### CLI-HLP-004: Offer a help subcommand in git-like tools

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://clig.dev/#help>

If the program has subcommands, `mytui help <command>` should print the same help as `mytui <command> --help`.

**Verify:** Run `mytui help` and compare it with `mytui --help`.

### CLI-HLP-012: Format help for scanning, without leaking escape codes

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** <https://clig.dev/#help>

Help text printed to a pipe must not contain escape codes; style it only on a TTY.

**Verify:** Run `mytui --help | cat -v` and look for `^[[`.

### CLI-HLP-015: Do not hang waiting on an interactive stdin

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#help>

A TUI started without a terminal must fail fast with a clear message instead of hanging on input that will never arrive.

**Verify:** Run `mytui </dev/null | cat` with a timeout: it must exit promptly with an explanatory error, or fall back to a non-interactive mode.

### CLI-DST-004: Provide --version output that includes build information

- **Level:** must
- **Severity:** medium
- **Check:** probe
- **Source:** original

`--version` prints the version (plus commit/build date when available) on stdout and exits 0, without starting the UI.

**Verify:** Run `mytui --version | cat; echo $?`.

### CLI-OUT-004: Support --json for structured output

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

Offer `--json` (or another machine format) on the non-interactive commands that expose the same data as the main views, so scripts never need to scrape the screen.

**Verify:** List the data views in the UI and check each has a scriptable, structured counterpart.

### CLI-OUT-014: Disable color when not on a terminal or when the user asks

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

Respect `NO_COLOR`, `TERM=dumb` and a `--no-color` flag or config option both in non-interactive output and inside the UI. [COLOR-AND-ACCESSIBILITY.md](COLOR-AND-ACCESSIBILITY.md) covers how the UI should degrade.

**Verify:** Run `NO_COLOR=1 mytui --help` under a pseudo-terminal and in the UI, and check for color escapes.

### CLI-INT-001: Prompt only when stdin is a TTY

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#interactivity>

Start the interactive UI only when stdin and stdout are terminals. Otherwise fall back to a non-interactive mode or exit with an error that names the alternative command.

**Verify:** Run `echo | mytui` and `mytui | cat` and confirm neither one draws a UI or hangs.

### CLI-ARG-010: Never require a prompt

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

Every action essential to automation must be reachable without the interactive UI, through flags, subcommands or stdin.

**Verify:** Pick the three most important UI actions and find their non-interactive equivalents.

### CLI-ARG-018: Never accept secrets as flag values

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#arguments-and-flags>

Do not take secrets as flag values. Read them from a file, stdin or the OS keychain, or prompt with echo disabled in the UI.

**Verify:** Grep flag definitions for token, password, secret and key.

### CLI-ERR-001: Catch expected errors and rewrite them for humans

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#errors>

Turn expected startup failures (missing config, terminal too small, no TTY, unreachable server) into human-readable messages that say how to fix them, printed after the terminal is restored.

**Verify:** Trigger each failure (bad config path, `TERM=dumb`, closed stdin) and read the message.

### CLI-ROB-002: Respond within 100 ms

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://clig.dev/#robustness-guidelines>

Draw the first frame or print something within about 100 ms. Load slow data in the background and show a loading state.

**Verify:** Time `mytui --help` and the startup of the UI, which should show a loading skeleton almost immediately.

### CLI-CFG-004: Store user config, cache, data, and state in XDG base directories

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#configuration>

Store config, cache, data, state and log files in XDG base directories or their platform equivalents, not in dotfiles scattered across `$HOME`.

**Verify:** Grep for the paths the app writes, and run it with a temporary `XDG_CONFIG_HOME` to confirm they are honored.

### CLI-CFG-008: Apply configuration sources in a fixed precedence order

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#configuration>

Apply flags, then environment variables, then project config, then user config, then system config. This includes theme and keybinding settings.

**Verify:** Set the same option (for example the theme) in config, env and a flag, and confirm the flag wins.

### CLI-ENV-005: Honor standard general-purpose environment variables

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#environment-variables>

Honor the general-purpose variables that matter to TUIs: `TERM`, `COLORTERM`, `NO_COLOR`, `EDITOR`/`VISUAL` for editing, `PAGER`, `LINES`/`COLUMNS` and proxy settings.

**Verify:** Grep for each variable. For example, the edit action should open `$EDITOR`.

### CLI-ENV-008: Do not accept secrets through environment variables

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#environment-variables>

Do not read secrets from environment variables by default. Prefer credential files, the OS keychain or stdin.

**Verify:** Grep for env reads of TOKEN, SECRET, PASSWORD and KEY.

### CLI-SIG-004: Exit with status 130 after SIGINT

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

On SIGINT outside the UI's own key handling, restore the terminal and exit 130. Inside the UI, Ctrl-C is treated as quit, as covered by [INPUT-AND-KEYBINDINGS.md](INPUT-AND-KEYBINDINGS.md).

**Verify:** Send `kill -INT` to the running process from another shell. The terminal must be restored and `$?` must be 130.

### CLI-ANL-001: Do not send usage or crash data without consent

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#analytics>

No telemetry, crash reports or update pings without consent. Never block the UI on such calls.

**Verify:** Grep for HTTP calls made at startup and check they are gated on an explicit setting.
