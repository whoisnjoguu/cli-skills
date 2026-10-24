# Subcommands

How to structure a CLI as a tree of subcommands: when to use them, how to name them, and how to keep flags, output and help consistent across the tree. Load this when designing a multi-command tool (`tool noun verb`), adding a subcommand, or auditing consistency across an existing command tree.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Command-tree design

Subcommands reduce the surface a user must hold in mind at once: a complex tool becomes a set of smaller commands, and several closely related tools can become one discoverable command (Git replacing the separate RCS programs). They also give you one place for shared machinery: global flags, help text, configuration, credentials and storage.

A typical two-level tree, noun then verb:

```text
mytool
├── app      create | list | get | delete
├── db       create | list | get | delete | backup
└── config   get | set | list
global flags: --help --json --quiet --no-color --no-input --config
```

Guidelines for the tree:

- Keep depth to two levels (`group action`) unless a third level is clearly needed; deeper trees are hard to discover.
- Top-level shortcuts for very common actions (`mytool deploy`) are fine if they are explicit, documented aliases, never a fallback for unknown names (see FUTURE-PROOFING.md).
- `mytool` with no arguments, `mytool --help` and `mytool help` should all list the groups. `mytool help app` and `mytool app --help` should print the same text.
- Most frameworks (cobra, clap, click, oclif, commander) generate the help subcommand, unknown-command errors and "did you mean" suggestions; use them rather than reimplementing.

## Rules

### CLI-SUB-001: Use subcommands to tame complex or closely related functionality

- **Level:** consider
- **Severity:** info
- **Check:** manual
- **Source:** <https://clig.dev/#subcommands>

When a tool has many distinct operations, or you ship several closely related tools, organize them as subcommands of one command. Each subcommand stays small and focused, and users discover the rest through one entry point. Do not introduce subcommands for a tool that does one thing; a flat command is simpler.

**Verify:** Review the command surface. A single command with many mutually exclusive mode flags (`--create`, `--delete`, `--list`) is a candidate for subcommands; a family of separate binaries with shared config is a candidate for merging.

### CLI-SUB-002: Share global flags, configuration and help machinery across subcommands

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#subcommands>

Define cross-cutting options once at the root (`--help`, `--json`, `--quiet`, `--no-color`, `--no-input`, `--config`, `--debug`) and have every subcommand honor them. Load configuration, credentials and state through one shared code path so subcommands cannot drift. Make global flags work on either side of the subcommand name (see CLI-ARG-016 in ARGUMENTS-AND-FLAGS.md).

**Verify:** Run `mytool <cmd> --help | cat` for several subcommands; the same global flags should appear in each. In source, check globals are defined once (cobra `PersistentFlags`, clap `global = true`, a shared argparse parent parser) rather than copied per command.

### CLI-SUB-003: Use the same flag names for the same concepts in every subcommand

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#subcommands>

If one subcommand calls it `--output`, none may call it `--out` or `--file`. The same applies to short letters and to value formats (durations, sizes, timestamps, IDs). Inconsistency forces users to check help for every command and breaks muscle memory and scripts.

**Verify:** Dump flags for every subcommand (`for c in $(mytool --help | ...); do mytool $c --help; done | cat`) and look for synonyms for the same concept (`--out`/`--output`, `--name`/`--title`, `--yes`/`--force`) or one short letter with two meanings.

### CLI-SUB-004: Keep output formatting consistent across subcommands

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://clig.dev/#subcommands>

List commands should share a table style, column naming and sort conventions; detail commands should share a layout; errors should share a format. Machine output must be uniform too: if one subcommand supports `--json`, all data-producing subcommands should, using consistent field names and casing for the same entities.

**Verify:** Run `mytool app list | cat` and `mytool db list | cat`, then the same with `--json`. Compare headers, casing, timestamp format and JSON key style; the same entity (e.g. `id`, `created_at`) must use the same name everywhere.

### CLI-SUB-005: Pick one word order for nested subcommands and apply it everywhere

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#subcommands>

For tools with many object types and operations, use two levels: one a noun, one a verb, as in `docker container create`. Either `noun verb` or `verb noun` works, but choose one and never mix them; `noun verb` is the more common choice and groups related operations under one help page.

- Do: `mytool app create`, `mytool db create`, `mytool db delete`
- Don't: `mytool app create`, `mytool create-db`, `mytool delete db`

**Verify:** List the full command tree from help output. Every leaf command should follow the same order; flag any mixed forms or hyphenated `verb-noun` top-level commands alongside `noun verb` groups.

### CLI-SUB-006: Reuse the same verbs across object types

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#subcommands>

The same operation should have the same verb on every noun: if apps use `list`, `get`, `create`, `delete`, databases should not use `ls`, `show`, `add`, `rm`. Aliases for alternative spellings are fine if declared explicitly, but the canonical verb set should be uniform.

**Verify:** Tabulate verbs per noun from `mytool <noun> --help | cat`. Flag synonyms for the same action across nouns (`delete`/`remove`/`destroy`, `list`/`ls`, `get`/`show`/`describe`) used as canonical names.

### CLI-SUB-007: Avoid ambiguous or similarly named subcommands

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://clig.dev/#subcommands>

Two commands whose names are near-synonyms or near-homographs, such as `update` and `upgrade`, make users guess which one they need and invite costly mistakes. Choose clearly distinct words, or disambiguate with an extra word (`update-index` versus `upgrade-packages`), and say in each one's help what it does not do.

**Verify:** Review sibling command names for synonyms or edit-distance-1/2 pairs (`update`/`upgrade`, `start`/`restart` with different semantics, `sync`/`async`). Each must have a one-line help description that clearly distinguishes it.

### CLI-SUB-008: Make help <subcommand> and <subcommand> --help equivalent

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** original

Users try both forms. `mytool help app create`, `mytool app create --help` and `mytool app create -h` should print the same help to stdout and exit 0. A group invoked with no action (`mytool app`) should show the group's help listing its actions.

**Verify:** `diff <(mytool help app create) <(mytool app create --help)` shows no difference; `mytool app create --help >/dev/null; echo $?` prints `0`; `mytool app | cat` lists the group's subcommands.

### CLI-SUB-009: Reject unknown subcommands with a suggestion

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** original

An unrecognized subcommand must produce an error on stderr and a non-zero exit, ideally with a "did you mean" suggestion and a pointer to help. It must never be silently treated as an argument to a default command or expanded as a prefix (see CLI-FUT-007 and CLI-FUT-008 in FUTURE-PROOFING.md).

```text
$ mytool aplpy
error: unknown command "aplpy" for "mytool"
Did you mean this?
    apply
Run 'mytool --help' for usage.
```

**Verify:** `mytool definitely-not-a-command; echo $?` prints an error to stderr and a non-zero code, and runs nothing.
