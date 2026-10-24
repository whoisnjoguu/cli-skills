# Configuration and environment variables

How a CLI should accept configuration (flags, environment variables, project files, user and system config), where config files live, the order in which sources override each other, and how to name, read, and avoid misusing environment variables. Load this when designing config loading, adding env var support, choosing config file paths, or handling credentials.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Choosing a mechanism

Pick the mechanism by how often a value changes and who it belongs to.

| Kind of setting | Examples | Use |
| --- | --- | --- |
| Changes per invocation | verbosity, `--dry-run`, safe mode | Flags (env var optional) |
| Mostly stable per user or machine, may differ by project | non-default paths, color preference, HTTP proxy | Flags plus environment variables; user config file if complex |
| Stable within a project, shared by all contributors | build targets, service definitions (`Makefile`, `package.json`, `docker-compose.yml`) | Tool-specific config file committed to version control |

## Precedence

Highest wins. Each layer overrides only the keys it sets; unset keys fall through.

```
  1. Command-line flags            --region eu-west-1
  2. Environment (current shell)   MYTOOL_REGION=us-east-1
  3. Project config                ./.mytool.toml, ./.env
  4. User config                   $XDG_CONFIG_HOME/mytool/config.toml
  5. System config                 /etc/mytool/config.toml
  6. Built-in defaults
```

```python
def resolve(key, flags, env, project, user, system, defaults):
    for layer in (flags, env, project, user, system, defaults):
        if layer.get(key) is not None:
            return layer[key]
```

## Config file locations

The XDG Base Directory spec defines where per-user files go, so tools stop scattering dotfiles in `$HOME`. If the `XDG_*` variable is unset or empty, use the default shown.

| Purpose | Linux (XDG) | macOS | Windows |
| --- | --- | --- | --- |
| Config | `$XDG_CONFIG_HOME/mytool` (default `~/.config/mytool`) | `~/Library/Application Support/mytool` | `%APPDATA%\mytool` |
| Cache | `$XDG_CACHE_HOME/mytool` (default `~/.cache/mytool`) | `~/Library/Caches/mytool` | `%LOCALAPPDATA%\mytool\cache` |
| Data | `$XDG_DATA_HOME/mytool` (default `~/.local/share/mytool`) | `~/Library/Application Support/mytool` | `%LOCALAPPDATA%\mytool` (or `%APPDATA%` if it should roam) |
| State (logs, history) | `$XDG_STATE_HOME/mytool` (default `~/.local/state/mytool`) | `~/Library/Application Support/mytool` (logs: `~/Library/Logs/mytool`) | `%LOCALAPPDATA%\mytool\state` |
| System config | `$XDG_CONFIG_DIRS` (default `/etc/xdg`), commonly `/etc/mytool` | `/Library/Application Support/mytool` or `/etc/mytool` | `%PROGRAMDATA%\mytool` |

Notes:
- `%APPDATA%` is the roaming profile (follows the user across machines); `%LOCALAPPDATA%` is machine-local and is the right place for caches and large data.
- Many developer CLIs (git, gh, neovim, fish, tmux) use `~/.config/<tool>` on macOS too, and most honor `XDG_*` there when set. Honoring `XDG_CONFIG_HOME` on macOS is a safe, expected choice for developer tools.
- Libraries: Go `os.UserConfigDir()`/`os.UserCacheDir()` (platform-native), `github.com/adrg/xdg`; Rust `directories`/`etcetera`; Python `platformdirs`; Node `env-paths`.

## Standard environment variables

Conventional variables to read (never redefine) when your tool touches the related concern.

| Variable | Read it when | Expected behavior |
| --- | --- | --- |
| `NO_COLOR` | Emitting color | Any non-empty value disables color |
| `FORCE_COLOR` | Emitting color | Enable color even when not a TTY |
| `DEBUG` | Logging | Enable verbose/debug output |
| `EDITOR` (`VISUAL`) | Collecting multi-line input or editing a file | Launch it; fall back to `vi`/`notepad` |
| `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` | Making network requests | Route through proxy; skip hosts in `NO_PROXY` |
| `SHELL` | Opening an interactive shell for the user | Spawn that shell; use `/bin/sh` for scripts |
| `TERM`, `TERMINFO`, `TERMCAP` | Writing terminal escape sequences | Detect capabilities; `TERM=dumb` means none |
| `TMPDIR` | Creating temporary files | Use as temp root |
| `HOME` | Locating user config | Base for default config paths |
| `PAGER` | Paging long output | Use it; fall back to `less -FIRX` |
| `LINES`, `COLUMNS` | Laying out tables or wrapping | Override detected terminal size |
| `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` | Reading or writing per-user files | See CLI-CFG-004 |
| `CI` | Deciding on interactivity | Treat as non-interactive |

## Configuration

### CLI-CFG-001: Expose per-invocation settings as flags

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#configuration>

Settings that typically differ from one run to the next (debug level, dry run, safe mode, output format) must be available as flags. Forcing users to edit a file or export a variable to change them for one run is slow and error-prone in scripts. An env var equivalent is optional.

**Verify:** Run `mytool --help | cat` and confirm verbosity, dry-run, and similar per-run toggles appear as flags. In source, check that these values are not read only from a config file or env var.

### CLI-CFG-002: Accept machine- or user-specific settings via flags and environment variables

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#configuration>

Settings that are usually stable but differ per user or machine (non-default paths, color preference, proxy server) should be settable both by flag and by environment variable, so users can set them once in a shell profile or a project `.env` and still override per run. Promote them to a user config file only when they are too complex for env vars.

**Verify:** For each such setting, confirm both a flag and a documented env var exist (e.g. `mytool --help | cat` lists `--config` and mentions `MYTOOL_CONFIG`). Run `MYTOOL_X=value mytool ...` and confirm the value takes effect.

### CLI-CFG-003: Keep project-wide settings in a version-controlled, tool-specific file

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://clig.dev/#configuration>

Configuration that is the same for every contributor to a project belongs in a file with a tool-specific name (like `Makefile`, `package.json`, `docker-compose.yml`) that is committed to the repository. Discover it by walking up from the current directory to the project root. Do not put secrets or per-user values in it.

**Verify:** Check that the tool documents a project config file name, that it is found from subdirectories, and that it does not require machine-specific absolute paths or credentials.

### CLI-CFG-004: Store user config, cache, data, and state in XDG base directories

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#configuration>

Follow the XDG Base Directory spec on Linux: config in `$XDG_CONFIG_HOME/<tool>`, cache in `$XDG_CACHE_HOME/<tool>`, data in `$XDG_DATA_HOME/<tool>`, state in `$XDG_STATE_HOME/<tool>`, each falling back to its default when unset. Do not create new top-level dotfiles in `$HOME`. Use platform conventions on macOS and Windows (see the table above), and honor `XDG_*` there when set.

```go
dir := os.Getenv("XDG_CONFIG_HOME")
if dir == "" {
    home, _ := os.UserHomeDir()
    dir = filepath.Join(home, ".config")
}
cfg := filepath.Join(dir, "mytool", "config.toml")
```

**Verify:** Grep source for `HOME` joined with a dot-prefixed path (e.g. `~/.mytool`). Probe: `XDG_CONFIG_HOME=$PWD/xdgtest mytool config path` (or run a command that writes config) and confirm files land under `xdgtest/mytool`.

### CLI-CFG-005: Get consent before modifying configuration owned by other programs

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** <https://clig.dev/#configuration>

Editing another program's config (shell rc files, `/etc/crontab`, `~/.ssh/config`, git config) without asking is a surprise that can break the user's environment. Ask first, and state exactly which file will change and what will be written. Offer a non-interactive flag (e.g. `--yes`) and a way to print the change instead of applying it.

**Verify:** Grep for writes to paths outside the tool's own directories (`.bashrc`, `.zshrc`, `.profile`, `/etc/`, `.gitconfig`). Each must be preceded by a confirmation prompt or an explicit flag, and the prompt must name the file.

### CLI-CFG-006: Prefer a drop-in file over editing a shared config file

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** <https://clig.dev/#configuration>

When integrating with another program, create your own file in its include directory (`/etc/cron.d/mytool`, `/etc/sudoers.d/mytool`, `~/.ssh/config.d/mytool`) instead of appending to the shared file. A separate file is easy to inspect and remove cleanly.

**Verify:** Check integration code paths: if a `.d` directory or include mechanism exists for the target, the tool writes there rather than appending to the main file.

### CLI-CFG-007: Mark edits to shared config files with dated delimiters

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** <https://clig.dev/#configuration>

If you must append to or modify a shared or system-wide file, wrap your additions in clearly labeled comments that include the tool name and date, so humans and your own uninstaller can find and remove them. Make the edit idempotent: replace the existing block rather than appending a duplicate.

```sh
# >>> mytool (added 2026-10-24) >>>
export PATH="$HOME/.mytool/bin:$PATH"
# <<< mytool <<<
```

**Verify:** Run the install/integration step twice in a scratch `HOME` and confirm the file contains exactly one delimited, dated block.

### CLI-CFG-008: Apply configuration sources in a fixed precedence order

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#configuration>

Resolve each setting from, highest to lowest: flags, the current shell's environment variables, project-level config (including `.env`), user-level config, system-wide config, then built-in defaults. Merge per key, not per file. Document the order in help or docs.

**Verify:** Set the same key in a user config file, an env var, and a flag; run `mytool ...` with each combination and confirm the flag beats env and env beats the file. Check source for a single resolution function rather than ad hoc reads.

## Environment variables

### CLI-ENV-001: Use environment variables for context-dependent behavior

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** <https://clig.dev/#environment-variables>

Env vars suit values that depend on the context a command runs in: the terminal session, the machine, or a project checkout. They may mirror flags or config keys or be standalone. Do not use them for values that change every invocation (use flags) or for structured project settings (use a config file).

**Verify:** Review the list of env vars the tool reads; each should map to a setting that varies by session, machine, or project, and be documented in help or docs.

### CLI-ENV-002: Name environment variables with uppercase letters, digits, and underscores only

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** <https://clig.dev/#environment-variables>

For portability across shells, names must match `^[A-Z_][A-Z0-9_]*$`: no lowercase, dashes, or dots, and no leading digit. Prefix with the tool name (`MYTOOL_TOKEN_FILE`) to avoid collisions.

**Verify:** Grep source for `getenv`/`os.environ`/`process.env`/`env::var` and check every name against `^[A-Z_][A-Z0-9_]*$`.

### CLI-ENV-003: Keep environment variable values single-line

- **Level:** should
- **Severity:** low
- **Check:** static, manual
- **Source:** <https://clig.dev/#environment-variables>

Multi-line values work but break `env` output, many `.env` parsers, and CI secret masking. Use delimited lists (`a,b,c` or `:`-separated paths) or point the variable at a file instead.

**Verify:** Check documented env vars for any that expect multi-line content (certificates, JSON blobs, scripts); each should have a file-path alternative.

### CLI-ENV-004: Do not repurpose widely used environment variable names

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** <https://clig.dev/#environment-variables>

Do not give your own meaning to names other software relies on, such as the POSIX-standard variables (`PATH`, `HOME`, `USER`, `LANG`, `TZ`, `PWD`) or common conventions (`DEBUG`, `CI`, `TOKEN`). Read them for their standard meaning only; namespace everything else.

**Verify:** List env vars the tool reads; any unprefixed name must be a standard one used with its standard meaning (see the standard environment variables table above).

### CLI-ENV-005: Honor standard general-purpose environment variables

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#environment-variables>

Where a feature touches the concern, read the conventional variable instead of inventing a new one: `NO_COLOR`/`FORCE_COLOR` for color, `DEBUG` for verbosity, `EDITOR` for multi-line input, the proxy variables for networking, `SHELL` for interactive shells (but run scripts with an explicit interpreter like `/bin/sh`), `TERM`/`TERMINFO`/`TERMCAP` for escape sequences, `TMPDIR` for temp files, `HOME` for locating config, `PAGER` for paging, and `LINES`/`COLUMNS` for size-dependent output. Many HTTP libraries already honor proxy variables; confirm yours does.

**Verify:** Probe the relevant ones: `NO_COLOR=1 mytool list | cat -v` shows no escape codes; `EDITOR=cat mytool edit ...` invokes `cat`; `PAGER=cat mytool log` does not block; `TMPDIR=$PWD/t mytool ...` puts temp files in `t`; `HTTPS_PROXY=http://127.0.0.1:9 mytool fetch` fails with a proxy connection error.

### CLI-ENV-006: Read project-scoped environment variables from a local .env file

- **Level:** consider
- **Severity:** info
- **Check:** static, probe
- **Source:** <https://clig.dev/#environment-variables>

If the tool reads env vars that stay constant while working in one directory, also load them from a `.env` in the project so users can configure per project without exporting each time. Real environment variables must override `.env` values. Use an established parser (`dotenv` for Node/Ruby, `dotenvy` for Rust, `python-dotenv`, `godotenv`).

**Verify:** In a scratch directory create `.env` with `MYTOOL_X=fromfile`, run the tool and confirm it applies; then run `MYTOOL_X=fromshell mytool ...` and confirm the shell value wins.

### CLI-ENV-007: Do not use .env as a substitute for a real config file

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** <https://clig.dev/#environment-variables>

`.env` files are usually not committed (so no history), hold only strings, drift into disorganization, invite encoding bugs, and often accumulate credentials. If configuration is structured, typed, shared, or security-sensitive, provide a dedicated config file (TOML, YAML, JSON) instead.

**Verify:** Check whether the tool requires `.env` for nested, list-valued, typed, or team-shared settings; if so, a proper config file is missing.

### CLI-ENV-008: Do not accept secrets through environment variables

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#environment-variables>

Env vars leak: they are inherited by every child process and end up in logs and crash reports; values expanded into command lines (`curl -H "Authorization: Bearer $TOKEN"`) are visible in `ps` and `/proc`; container env is shown by `docker inspect`; systemd unit env is readable via `systemctl show`. Accept secrets only via a credential file with restrictive permissions, stdin or a pipe, an `AF_UNIX` socket, the OS keychain or a secret manager, or another IPC channel. Never accept secrets as flag values either; offer `--token-file` or `--token-stdin` (like curl's `-H @file`).

```sh
mytool login --token-stdin < ~/.secrets/mytool-token
pass show mytool | mytool login --token-stdin
```

**Verify:** Grep env reads for names containing `TOKEN`, `SECRET`, `PASSWORD`, `KEY`, `CREDENTIAL`; each is a finding unless it points to a file path. Check that a file or stdin option exists for every secret, and that child processes are spawned without inheriting secret values.
