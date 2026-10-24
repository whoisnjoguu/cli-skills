# Future-proofing

How to evolve a CLI without breaking the people and scripts that depend on it: additive change, deprecation, stable machine output, and design choices that block future growth. Load this when changing or removing flags, subcommands or output, planning a release, or auditing a tool for latent compatibility traps.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## What counts as the interface

Anything a user or script can depend on is a public interface and needs a deprecation process before it changes:

| Surface | Examples |
| --- | --- |
| Commands | Subcommand names, aliases, nesting |
| Arguments and flags | Names, short letters, defaults, accepted values, positional order |
| Machine output | `--json` schema, `--plain` columns, field names and types |
| Exit codes | Meaning of each non-zero code |
| Configuration | File locations, keys, formats, precedence |
| Environment variables | Names and accepted values |

Human-formatted output is the deliberate exception (see CLI-FUT-006).

## Versioning the interface

Version the CLI by its contract, using [semantic versioning](https://semver.org/):

| Change | Bump |
| --- | --- |
| New subcommand, new flag, new optional JSON field, new exit code for a previously impossible condition | Minor |
| Bug fix that restores documented behavior; human output wording or layout | Patch |
| Removed or renamed flag/subcommand, changed default, changed meaning of an exit code, removed/renamed/retyped JSON field | Major, after a deprecation period |

Semver labels change; it does not excuse it. A tool shipping a major bump every month is effectively unstable. Batch breaking changes, ship them rarely, and list them with migration steps in the changelog. Consider including a schema version in JSON output (`"schema_version": 1`) so consumers can detect changes.

## Rules

### CLI-FUT-001: Treat every user-facing surface as a stable interface

- **Level:** must
- **Severity:** high
- **Check:** manual
- **Source:** <https://clig.dev/#future-proofing>

Subcommands, arguments, flags, configuration files, environment variables, exit codes and machine-readable output are commitments. Do not change them without a lengthy, documented deprecation process. Shipping a release with a breaking change and no prior warning breaks scripts silently.

**Verify:** Diff the command tree, flags, env vars and config keys between the previous release and the candidate (e.g. compare `mytool --help` output for every subcommand across versions). Every removal or semantic change must have had a deprecation warning in a previous release and a changelog entry.

### CLI-FUT-002: Prefer additive changes

- **Level:** should
- **Severity:** high
- **Check:** manual
- **Source:** <https://clig.dev/#future-proofing>

Instead of changing what an existing flag does in an incompatible way, add a new flag (or new value) for the new behavior and leave the old one working, as long as the interface does not bloat. Flags make this easy, which is one reason to prefer them over positional arguments (see CLI-ARG-001 in ARGUMENTS-AND-FLAGS.md).

- Do: add `--format=json` while keeping `--json` working as an alias.
- Don't: change `--output` from "file path" to "format name" in a minor release.

**Verify:** For each changed flag in a release diff, confirm old invocations still parse and behave as before; new behavior is reached only via new names or values.

### CLI-FUT-003: Warn in the program before making a non-additive change

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#future-proofing>

When a breaking change is unavoidable, warn users at the moment they use the affected flag, command or behavior, at least one release before the change ships. Release notes alone are not enough; scripts and their authors do not read them. Write the warning to stderr so stdout stays parseable, and say what changes, when, and exactly what to do now.

```text
$ mytool deploy --env prod
warning: --env is deprecated and will be removed in v3.0.
  Use --environment instead: mytool deploy --environment prod
  Set MYTOOL_SILENCE_DEPRECATIONS=1 to hide this warning.
```

**Verify:** Run a command using a deprecated flag: `mytool deploy --env prod --dry-run 2>&1 >/dev/null`. A warning naming the replacement must appear on stderr, and stdout (and `--json` output) must be unchanged.

### CLI-FUT-004: Offer a future-proof form today and stop warning once users adopt it

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://clig.dev/#future-proofing>

Every deprecation must come with a replacement that works now, so users can migrate before the break. When their invocation already uses the new form (or explicitly opts into the new behavior), suppress the warning; then the eventual switch is invisible to them. If the change is a default flip, provide a flag to opt into the new default early and one to keep the old behavior temporarily.

**Verify:** Run the replacement invocation, e.g. `mytool deploy --environment prod --dry-run 2>&1 | grep -i deprecat`; it must produce no warning and the same result as the deprecated form.

### CLI-FUT-005: Treat machine-readable output as a versioned contract

- **Level:** must
- **Severity:** high
- **Check:** probe, manual
- **Source:** <https://clig.dev/#future-proofing>

Output from `--json`, `--plain` and similar modes is what scripts parse. Only add fields; never remove, rename, retype or reorder (for positional formats) without the full deprecation process and a major version. Document the schema, and keep exit codes equally stable.

**Verify:** Capture `mytool list --json` from the previous and candidate versions and compare keys and types (e.g. with `jq 'paths' | sort`). Any removed or retyped path is a violation unless announced as a breaking change.

### CLI-FUT-006: Let human-readable output evolve and point scripts at stable formats

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://clig.dev/#future-proofing>

Human output needs to improve over time; if it were frozen as an interface, the tool could never get easier to use. Make that explicit: document that default output may change, and tell script authors to use `--json` or `--plain`. Help text and docs for scripting should show the stable forms.

**Verify:** Check `mytool --help | cat` and the docs mention `--json`/`--plain` for scripting. Confirm machine formats exist for every command whose output is likely to be parsed.

### CLI-FUT-007: Do not use a catch-all default subcommand

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#future-proofing>

It is tempting to let users omit the most common subcommand, so that `mytool echo hi` means `mytool run echo hi` whenever `echo` is not a known subcommand. That permanently blocks adding new subcommands: once a script relies on `mytool echo`, adding an `echo` (or any other) subcommand silently changes what it does. Require the explicit subcommand and error on unknown names.

**Verify:** `mytool some-unknown-word; echo $?` must print an unknown-command error and exit non-zero without executing anything. In source, look for fallback logic that dispatches unrecognized first arguments to a default command.

### CLI-FUT-008: Do not accept arbitrary abbreviations of subcommands or flags

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#future-proofing>

If any unambiguous prefix works (`mytool i` for `install`), scripts will come to depend on it, and you can never add another command starting with that prefix. Aliases are good, but declare them explicitly and keep them stable. Watch library defaults: Python argparse accepts abbreviated long flags unless you pass `allow_abbrev=False`; cobra's `EnablePrefixMatching` must stay off.

**Verify:** For a subcommand like `install`, run `mytool inst --help; echo $?` and expect an unknown-command error unless `inst` is a documented alias. Run `mytool --verb` for a flag `--verbose` and expect an unknown-flag error. grep source for `EnablePrefixMatching`, `allow_abbrev`, or custom prefix-matching code.

### CLI-FUT-009: Do not build in time bombs

- **Level:** should
- **Severity:** high
- **Check:** static, manual
- **Source:** <https://clig.dev/#future-proofing>

Ask whether the tool will still work in 20 years. Core functionality must not depend on an external service, URL, API version or hosted file that may change or vanish; the server most likely to disappear is your own. Hard-coded expiry dates, embedded certificates without rotation, and mandatory online checks are all time bombs. Where a network dependency is inherent, make the endpoint configurable and fail with a clear error.

**Verify:** Run core offline-capable commands with networking disabled (e.g. `unshare -rn mytool --version` or in a sandbox without network) and confirm they work. grep source for hard-coded URLs and date comparisons and check each is configurable or non-essential.

### CLI-FUT-010: Never block on telemetry, update checks or analytics

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#future-proofing>

Calls to analytics, crash reporting or version-check endpoints must not sit on the critical path. Make them asynchronous with a short timeout, skip them when offline, and let failures pass silently, so the tool does not hang or fail when the endpoint changes, slows down or disappears.

**Verify:** With networking blocked or the endpoint unreachable, time a trivial command (`time mytool --version`); it should complete in well under a second and exit 0. In source, confirm such calls have timeouts and are not awaited before the main work.

### CLI-FUT-011: Version releases by the CLI contract with semantic versioning

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#future-proofing>

Apply semver to the interface defined above: additions are minor, removals and semantic changes are major and follow a deprecation period. A major bump does not make breaking changes free; frequent majors make the version number meaningless. Expose the version via `mytool --version` and record breaking changes with migration steps in the changelog.

**Verify:** `mytool --version | cat` prints a semver version. Check the changelog: every removed or renamed flag, subcommand, env var, exit code or JSON field appears under a major version with migration guidance and was deprecated in an earlier release.
