# Agent readiness

How to make a CLI dependable when the caller is a coding agent, a CI job, or another program that cannot see a screen, cannot answer prompts, and decides what to do next from exit codes and structured output. Load this when building a CLI that agents or automation will drive, or when auditing one for scriptability.

These rules are original to this skill. They extend the clig.dev guidance on machine output, errors and robustness rather than replacing it.

## What changes when the caller is an agent

An agent runs your tool the way a careful script would, but it also improvises:

- **It has no terminal.** stdin is closed or a pipe, stdout is captured, and nobody is watching. Anything that waits for a key press or opens a browser stalls the run.
- **It learns from `--help` and errors.** It reads help to discover commands, then reads error output to decide the next attempt. Vague errors lead to guessing; specific errors lead to the fix.
- **It branches on structure, not prose.** Exit codes, error codes and JSON fields are what it can rely on. Message wording changes between releases; codes should not.
- **It retries.** A timeout or rate limit is often followed by the same command again, so repeated runs must be safe and must say whether retrying will help.
- **Every byte costs.** Output goes into a context window. Unbounded lists, banners and repeated progress lines crowd out the information that matters.

Most of what an agent needs is already in the baseline. Check these existing rules first:

| Need | Existing rules |
|---|---|
| Never block on input | [CLI-INT-001](INTERACTIVITY.md#cli-int-001-prompt-only-when-stdin-is-a-tty), [CLI-INT-002](INTERACTIVITY.md#cli-int-002-honor---no-input-by-disabling-all-prompts), [CLI-ARG-010](ARGUMENTS-AND-FLAGS.md#cli-arg-010-never-require-a-prompt), [CLI-HLP-015](HELP-AND-DOCS.md#cli-hlp-015-do-not-hang-waiting-on-an-interactive-stdin) |
| Clean machine output | [CLI-BAS-004](THE-BASICS.md#cli-bas-004-send-primary-and-machine-readable-output-to-stdout), [CLI-BAS-005](THE-BASICS.md#cli-bas-005-send-logs-progress-warnings-and-errors-to-stderr), [CLI-OUT-004](OUTPUT.md#cli-out-004-support---json-for-structured-output), [CLI-OUT-005](OUTPUT.md#cli-out-005-treat-json-output-as-a-stable-clean-contract) |
| Meaningful exit codes | [CLI-BAS-002](THE-BASICS.md#cli-bas-002-exit-zero-on-success-and-non-zero-on-failure), [CLI-BAS-003](THE-BASICS.md#cli-bas-003-map-distinct-non-zero-exit-codes-to-the-important-failure-modes) |
| Safe destructive actions | [CLI-ARG-011](ARGUMENTS-AND-FLAGS.md#cli-arg-011-confirm-before-dangerous-operations), [CLI-ARG-012](ARGUMENTS-AND-FLAGS.md#cli-arg-012-scale-confirmation-friction-to-the-level-of-danger) |
| Safe re-runs | [CLI-ROB-007](ROBUSTNESS.md#cli-rob-007-make-failed-operations-resumable-by-re-running-them), [CLI-ROB-008](ROBUSTNESS.md#cli-rob-008-design-for-crash-only-operation-with-atomic-writes) |
| Secrets | [CLI-ARG-018](ARGUMENTS-AND-FLAGS.md#cli-arg-018-never-accept-secrets-as-flag-values), [CLI-ARG-019](ARGUMENTS-AND-FLAGS.md#cli-arg-019-accept-secrets-through-a-file-or-stdin), [CLI-ENV-008](CONFIGURATION-AND-ENV.md#cli-env-008-do-not-accept-secrets-through-environment-variables) |

## A machine-readable error

One shape covers most needs. Document it alongside the `--json` output schema:

```json
{
  "error": {
    "code": "not_found",
    "message": "project 'api' does not exist in workspace 'acme'",
    "hint": "run 'mytool projects list' to see available projects",
    "retryable": false,
    "details": { "project": "api", "workspace": "acme" }
  }
}
```

- `code` is stable and documented ([CLI-AGT-002](#cli-agt-002-give-every-error-a-stable-machine-readable-code)).
- `message` and `hint` are for humans and may change wording.
- `retryable` answers "will the same command work if I try again?" ([CLI-AGT-003](#cli-agt-003-say-whether-a-failure-is-safe-to-retry)).
- `details` holds the values a caller would otherwise parse out of the message.

## Rules

### CLI-AGT-001: Emit a structured error object on stderr in JSON mode

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

When the caller asked for machine output (`--json`, `--output=json`, or an equivalent config setting) and the command fails, write a single JSON error object to stderr, keep stdout empty or valid JSON, and exit non-zero. This includes usage errors: parse `--json` early enough that a bad flag still produces a JSON error. Without it, a program that asked for JSON receives prose it has to pattern-match.

```go
if err != nil {
    if opts.JSON {
        json.NewEncoder(os.Stderr).Encode(map[string]any{"error": toErrorObject(err)})
    } else {
        fmt.Fprintln(os.Stderr, "error:", humanize(err))
    }
    os.Exit(exitCodeFor(err))
}
```

**Verify:** Run `mytool --bogus-flag --json; echo $?` and `mytool show does-not-exist --json 2>err.json >out.txt; echo $?`. The exit code is non-zero, `out.txt` is empty or valid JSON, and `jq -e .error.code err.json` succeeds. The probe's opt-in `json-error` check covers the usage-error case.

### CLI-AGT-002: Give every error a stable machine-readable code

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Exit codes are coarse (a handful of values) and messages are prose that gets reworded. Give each distinct failure a short, stable code such as `not_found`, `conflict`, `auth_required`, `rate_limited`, or `E1042`, and keep it in the JSON error object. Show it in human output too (`error[auth_required]: ...`) so people can search for it. Define the codes in one place, document them, and treat removing or renaming one as a breaking change, as for exit codes.

**Verify:** Find the error-code definitions in source and the matching documentation page or help section. Trigger two different failures that share an exit code and confirm their codes differ. Check the changelog treats code changes as breaking.

### CLI-AGT-003: Say whether a failure is safe to retry

- **Level:** consider
- **Severity:** low
- **Check:** static, manual
- **Source:** original

Automated callers retry. Tell them when it will help: mark transient failures (timeouts, connection resets, HTTP 429 and 503, lock contention) as retryable, and include a wait time when the server provided one (`retry_after_seconds`). Mark failures that will repeat (validation errors, missing permissions, not found) as not retryable. A dedicated exit code for "temporary failure" (for example `75`, `EX_TEMPFAIL` from sysexits) also works for shell callers.

**Verify:** Simulate a rate limit or timeout (a local mock server or a closed port) and check the error carries `retryable: true` or the documented temporary-failure exit code. Check that a validation error carries `retryable: false`.

### CLI-AGT-004: Make --dry-run report the exact planned changes

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** original

A preview that says "would update 3 resources" cannot be checked. For every command that mutates state, `--dry-run` (or `plan`, `diff`) should list each change it would make: the object, the action (create, update, delete), and for updates the fields that differ. It makes no changes, exits 0 when the plan is valid, and exits non-zero when the real run would fail validation. With `--json`, emit the plan in a documented structure so a caller can inspect it before applying. Where possible, let the caller apply exactly that plan (`apply --plan plan.json`) so nothing changes between preview and execution.

```
$ mytool sync --dry-run
~ service/api      replicas: 2 → 4
+ service/worker   (new)
- service/legacy   (will be deleted)
Plan: 1 to add, 1 to change, 1 to delete. Nothing was changed.
```

**Verify:** Run a mutating command with `--dry-run` against a disposable target and confirm nothing changed afterwards. Check each planned change is listed individually, that `--dry-run --json | jq .` parses, and that an invalid input fails the dry run.

### CLI-AGT-005: Make repeated create and apply operations converge

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

A caller that times out cannot tell whether the operation happened, so it runs the command again. Design mutations so that a second identical run is safe. Prefer declarative `apply` commands that converge on a desired state and report `unchanged` when nothing needed doing (exit 0). For imperative `create`, offer `--if-not-exists`, return the existing object, or accept a client-supplied idempotency key, rather than creating a duplicate or failing with a generic error. When a duplicate is a real conflict, fail with a specific code (`already_exists`) and the existing object's identifier.

**Verify:** Run the same create or apply command twice against a disposable target. The second run must not create a duplicate, and its result must be either `unchanged` with exit 0 or a specific `already_exists` error naming the existing object.

### CLI-AGT-006: Return identifiers for everything a command creates or changes

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

The next command usually needs the ID, name, URL or path of what the last command produced. Print it: on stdout in human mode (`Created project api (id: prj_8f2k)`), and as fields in `--json` mode. Make IDs complete and copy-pasteable, not truncated for display. For bulk operations, return one entry per affected object with its outcome.

**Verify:** Run a create or update command with `--json` and confirm the response contains the identifier needed by the related `show`, `update` and `delete` commands. Pipe that identifier into one of them and confirm it works without further parsing.

### CLI-AGT-007: Bound list output by default and say when it is truncated

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** original

A list that returns 40,000 rows floods a terminal and a context window alike. Give list and search commands a sensible default limit, a `--limit` flag, and a way to fetch the rest (`--all`, `--page`, or a `--cursor` taken from the previous response). When output is truncated, say so: on stderr in human mode (`Showing 50 of 1,204. Use --limit or --all.`) and with fields such as `has_more` and `next_cursor` in JSON mode. Never truncate silently. Offer `--fields` or similar where records are wide.

**Verify:** Run a list command against a data set larger than the default limit. Check the default output is bounded, the truncation notice appears on stderr (not stdout), and `--json` includes a continuation token or total count. Confirm `--all` or paging retrieves the rest.

### CLI-AGT-008: Offer a non-interactive way to authenticate

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** original

If the only way to log in opens a browser or prompts for a password, the tool cannot run in CI or under an agent. Provide at least one path that works with no TTY and no browser: a token read from a file or stdin (`login --token-stdin`), a credential helper, workload identity in cloud CI, or a device-code flow that prints a URL and code and polls without needing input. Keep the secret-handling rules ([CLI-ARG-018](ARGUMENTS-AND-FLAGS.md#cli-arg-018-never-accept-secrets-as-flag-values), [CLI-ENV-008](CONFIGURATION-AND-ENV.md#cli-env-008-do-not-accept-secrets-through-environment-variables)). When credentials are missing in a non-interactive run, fail fast with an `auth_required` error that names the non-interactive option, instead of waiting for a browser or prompt.

**Verify:** In a clean environment with stdin at EOF and no browser, run a command that needs authentication: it must exit promptly with an error naming the non-interactive login option. Then authenticate with that option and confirm the command succeeds.

### CLI-AGT-009: Expose the command tree in a machine-readable form

- **Level:** consider
- **Severity:** info
- **Check:** static, probe
- **Source:** original

Agents discover a tool by walking `--help` for each subcommand, which is slow and depends on parsing formatted text. For tools with many commands, offer a single machine-readable description of the command tree, flags, argument types, defaults and exit codes, for example `mytool help --json` or a generated reference file shipped with the release. Generate it from the same definitions as `--help` so the two never disagree.

**Verify:** Run the documented command (for example `mytool help --json | jq .`) and confirm it lists every subcommand and flag that appears in `--help`. In source, confirm it is generated from the parser definitions, not maintained by hand.

### CLI-AGT-010: Keep machine output deterministic

- **Level:** consider
- **Severity:** low
- **Check:** static, probe
- **Source:** original

Callers diff, cache and compare output. For the same input and state, produce the same bytes: sort lists by a stable key, sort object keys or keep a fixed field order, and use RFC 3339 timestamps in UTC. Keep run-specific values such as durations, request IDs and progress out of stdout, or put them in clearly named fields that callers can ignore.

**Verify:** Run the same read-only `--json` command twice and `diff` the outputs. Any difference must come from real state changes or from documented volatile fields.
