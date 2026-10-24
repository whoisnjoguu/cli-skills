---
name: cli-rules
description: Design, build, and review command-line tools using the Command Line Interface Guidelines (clig.dev). Use when creating a new CLI, adding commands, flags, help text, output formats, errors, config, or env vars, choosing a CLI library, making a CLI dependable for coding agents and automation, or reviewing or auditing an existing CLI for usability, scriptability, and robustness. Run the full audit workflow only when the user explicitly asks for an audit or review report.
license: CC-BY-SA-4.0 (docs) and MIT (scripts). See LICENSE.txt
metadata:
  author: whoisnjoguu
  version: "0.1.0"
  repository: https://github.com/whoisnjoguu/cli-skills
---

# CLI guidelines

Make command-line programs that are pleasant for people and dependable for scripts. This skill turns the [Command Line Interface Guidelines](https://clig.dev) into concrete rules with stable IDs, plus build and audit workflows. Every rule says what to do, why, and how to verify it.

## Operating modes

This skill is guidance by default. Loading it does not authorize scaffolding a project, running the target, or writing report files.

- **Guidance mode** (default): answer design questions, review a snippet, or fix a specific behavior. Load only the companion files that matter (see [Where to look](#where-to-look)) and cite rule IDs in your answer.
- **Build mode**: the user asks you to create a CLI or add substantial CLI surface (new commands, flag sets, output formats). Follow [Build workflow](#build-workflow).
- **Audit mode**: the user explicitly asks to audit, review, or grade a CLI, or requests a report. Follow [AUDIT.md](AUDIT.md) and produce `findings.json` and `REPORT.md`.

If a request could mean more than one mode, ask one short question before creating files.

## Platform terminology

This skill is agent-neutral:

- **Parent** is the agent that coordinates the work and owns all shared files.
- **Sub-agent** is whatever delegation mechanism the platform provides (task tool, sub-agent, background agent). Where a step says "delegate", use it if available; otherwise do the step yourself, in order.

## Where to look

| Topic | File | Rule IDs |
|---|---|---|
| Principles behind the rules and how to break ties | [PHILOSOPHY.md](PHILOSOPHY.md) | none |
| Argument parsing, exit codes, stdout vs stderr | [THE-BASICS.md](THE-BASICS.md) | CLI-BAS |
| `--help`, concise help, examples, typo suggestions, docs, man pages | [HELP-AND-DOCS.md](HELP-AND-DOCS.md) | CLI-HLP, CLI-DOC |
| TTY detection, `--json`/`--plain`, color, `NO_COLOR`, progress, pagers | [OUTPUT.md](OUTPUT.md) | CLI-OUT |
| Human-readable errors, debug output, bug reports | [ERRORS.md](ERRORS.md) | CLI-ERR |
| Flags vs args, standard flag names, `-` for stdin, secrets, confirmations | [ARGUMENTS-AND-FLAGS.md](ARGUMENTS-AND-FLAGS.md) | CLI-ARG |
| Prompts, `--no-input`, passwords, Ctrl-C escape | [INTERACTIVITY.md](INTERACTIVITY.md) | CLI-INT |
| Command trees, naming consistency, ambiguous commands | [SUBCOMMANDS.md](SUBCOMMANDS.md) | CLI-SUB |
| Validation, responsiveness, progress, timeouts, crash-only design, signals | [ROBUSTNESS.md](ROBUSTNESS.md) | CLI-ROB, CLI-SIG |
| Stability, deprecation, output contracts, no catch-alls or abbreviations | [FUTURE-PROOFING.md](FUTURE-PROOFING.md) | CLI-FUT |
| Config files, XDG, precedence, environment variables, `.env`, secrets | [CONFIGURATION-AND-ENV.md](CONFIGURATION-AND-ENV.md) | CLI-CFG, CLI-ENV |
| Naming, packaging, completions, telemetry consent | [NAMING-AND-DISTRIBUTION.md](NAMING-AND-DISTRIBUTION.md) | CLI-NAM, CLI-DST, CLI-ANL |
| Libraries and skeletons for Go, Rust, Python, TypeScript/Node | [LANGUAGE-STACKS.md](LANGUAGE-STACKS.md) | none |
| Agents and automation as callers: structured errors, retry hints, dry-run plans, idempotency, bounded output, non-interactive auth | [AGENT-READINESS.md](AGENT-READINESS.md) | CLI-AGT |
| Testing exit codes, golden help, TTY vs pipe, JSON contracts, signals | [TESTING.md](TESTING.md) | CLI-TST |
| Audit workflow, severity rubric, report template | [AUDIT.md](AUDIT.md) | none |

Machine-readable assets:

- [checklist.json](checklist.json) lists every rule with its ID, title, level, default severity, check method, and doc anchor. It is generated from the markdown, so never edit it by hand.
- [report-schema.json](report-schema.json) is the `findings.json` contract for audit mode.
- [validate-findings.cjs](validate-findings.cjs) checks `findings.json` against the schema and the checklist (Node.js, no dependencies).
- [probe-cli.cjs](probe-cli.cjs) runs a built CLI under safe, conventionally read-only invocations (`--help`, `-h`, `--version`, piped, `NO_COLOR`, `TERM=dumb`) and records evidence (Node.js, no dependencies).

Each rule has a **level**: `must` (breaks people or scripts when violated), `should` (clearly better), or `consider` (context-dependent).

## Core principles

These are condensed from [PHILOSOPHY.md](PHILOSOPHY.md). When two rules conflict, use them to decide.

1. **Humans first, scripts always.** Default output is for people. Scripts get stable exits, clean stdout, and `--json`/`--plain`. Detect the TTY to choose between them.
2. **Composable.** Data goes to stdout, messages to stderr, and exit codes carry meaning. Support stdin and `-`.
3. **Consistent.** Use the conventions people already know: standard flag names, `--help`, `--version`, `--`, and the same flag names across subcommands.
4. **Say just enough.** Be brief on success, explicit about state changes, and actionable on failure. Never leave silence for more than about 100 ms.
5. **Discoverable.** Help leads with examples, errors suggest the fix, and output suggests the next command.
6. **Robust.** Validate early, use timeouts, make operations safe to re-run, keep Ctrl-C responsive, and keep cleanup bounded.
7. **Stable.** Treat flags, exit codes, and machine output as a contract. Changes are additive and come with deprecation warnings.

## Build workflow

Use this when creating a CLI or adding significant surface to one.

1. **Clarify** the essentials if they are not given: what the tool does, who runs it (humans, scripts, CI), target platforms, language constraints, and distribution channel. Make reasonable assumptions for the rest and state them.
2. **Pick the stack** with [LANGUAGE-STACKS.md](LANGUAGE-STACKS.md). Always use an argument-parsing library ([CLI-BAS-001](THE-BASICS.md#cli-bas-001-parse-arguments-with-an-established-library)).
3. **Design the interface before writing code.** Draft the top-level `--help` text first: command tree ([SUBCOMMANDS.md](SUBCOMMANDS.md)), flags with standard names ([ARGUMENTS-AND-FLAGS.md](ARGUMENTS-AND-FLAGS.md#standard-flag-names)), examples, output formats, the exit-code table, config files, and environment variables ([CONFIGURATION-AND-ENV.md](CONFIGURATION-AND-ENV.md)). Show it to the user when the design is non-trivial.
4. **Implement the baseline.** Every new CLI must satisfy the must-level rules below from the first commit, not as a later polish pass.
   If agents, CI, or other programs will drive the tool, apply [AGENT-READINESS.md](AGENT-READINESS.md) too.
5. **Write tests** from [TESTING.md](TESTING.md): exit codes, golden help, piped (non-TTY) output, `NO_COLOR`, `--json` contract, errors on stderr, and no hang without a TTY.
6. **Self-check.** Build the tool, then run `node <skill-dir>/probe-cli.cjs -- <tool>` and fix every `fail`. Walk the must-level rules in [checklist.json](checklist.json) for the touched areas and state any you deliberately deviated from and why.

### Baseline for every new CLI

| Concern | Do this | Rules |
|---|---|---|
| Parsing | Use an established parser. Support `--flag=value`, `--flag value`, and `--`. | [CLI-BAS-001](THE-BASICS.md#cli-bas-001-parse-arguments-with-an-established-library), [CLI-ARG-017](ARGUMENTS-AND-FLAGS.md#cli-arg-017-support-standard-option-syntax---flagvalue---flag-value-and---) |
| Exit codes | 0 on success, non-zero on failure, and a documented code for usage errors. | [CLI-BAS-002](THE-BASICS.md#cli-bas-002-exit-zero-on-success-and-non-zero-on-failure), [CLI-BAS-003](THE-BASICS.md#cli-bas-003-map-distinct-non-zero-exit-codes-to-the-important-failure-modes) |
| Streams | Data to stdout. Logs, progress, warnings, and errors to stderr. | [CLI-BAS-004](THE-BASICS.md#cli-bas-004-send-primary-and-machine-readable-output-to-stdout), [CLI-BAS-005](THE-BASICS.md#cli-bas-005-send-logs-progress-warnings-and-errors-to-stderr) |
| Help | `-h`/`--help` on every command, starting with examples. Concise help when required args are missing. | [CLI-HLP-001](HELP-AND-DOCS.md#cli-hlp-001-show-full-help-for--h-and---help-including-on-subcommands), [CLI-HLP-005](HELP-AND-DOCS.md#cli-hlp-005-show-concise-help-when-required-arguments-are-missing), [CLI-HLP-009](HELP-AND-DOCS.md#cli-hlp-009-lead-help-with-examples) |
| Version | `--version` on stdout, exit 0. | [CLI-DST-004](NAMING-AND-DISTRIBUTION.md#cli-dst-004-provide---version-output-that-includes-build-information) |
| Machine output | `--json` where output is data, with a stable contract. | [CLI-OUT-004](OUTPUT.md#cli-out-004-support---json-for-structured-output), [CLI-OUT-005](OUTPUT.md#cli-out-005-treat-json-output-as-a-stable-clean-contract) |
| Color | Only on a TTY. Honor `NO_COLOR`, `TERM=dumb`, and `--no-color`. | [CLI-OUT-014](OUTPUT.md#cli-out-014-disable-color-when-not-on-a-terminal-or-when-the-user-asks) |
| Animation | Spinners and progress bars only when stderr is a TTY. | [CLI-OUT-015](OUTPUT.md#cli-out-015-show-animations-only-when-the-stream-is-a-terminal) |
| Prompts | Only when stdin is a TTY. Every prompt has a flag equivalent. `--no-input` disables all prompts. | [CLI-INT-001](INTERACTIVITY.md#cli-int-001-prompt-only-when-stdin-is-a-tty), [CLI-INT-002](INTERACTIVITY.md#cli-int-002-honor---no-input-by-disabling-all-prompts), [CLI-ARG-010](ARGUMENTS-AND-FLAGS.md#cli-arg-010-never-require-a-prompt) |
| Danger | Confirm destructive actions, with `--force` or `--confirm=<name>` for scripts and `--dry-run` where useful. | [CLI-ARG-011](ARGUMENTS-AND-FLAGS.md#cli-arg-011-confirm-before-dangerous-operations), [CLI-ARG-012](ARGUMENTS-AND-FLAGS.md#cli-arg-012-scale-confirmation-friction-to-the-level-of-danger) |
| Secrets | Never accept them as flag values or by default from env vars. Use files, stdin, or a keychain. | [CLI-ARG-018](ARGUMENTS-AND-FLAGS.md#cli-arg-018-never-accept-secrets-as-flag-values), [CLI-ENV-008](CONFIGURATION-AND-ENV.md#cli-env-008-do-not-accept-secrets-through-environment-variables) |
| Errors | Catch expected errors and rewrite them as what happened plus how to fix it. | [CLI-ERR-001](ERRORS.md#cli-err-001-catch-expected-errors-and-rewrite-them-for-humans) |
| Config | Precedence: flags > env > project > user > system. Use XDG paths. | [CLI-CFG-008](CONFIGURATION-AND-ENV.md#cli-cfg-008-apply-configuration-sources-in-a-fixed-precedence-order), [CLI-CFG-004](CONFIGURATION-AND-ENV.md#cli-cfg-004-store-user-config-cache-data-and-state-in-xdg-base-directories) |
| Signals | Ctrl-C exits promptly with bounded cleanup. Exit 130 on SIGINT. Quiet exit on a broken pipe. | [CLI-SIG-001](ROBUSTNESS.md#cli-sig-001-exit-promptly-on-ctrl-c-and-say-so-immediately), [CLI-SIG-004](ROBUSTNESS.md#cli-sig-004-exit-with-status-130-after-sigint), [CLI-SIG-006](ROBUSTNESS.md#cli-sig-006-exit-quietly-when-the-downstream-pipe-closes) |
| Network | Timeouts on every call. Validate input before doing work. | [CLI-ROB-006](ROBUSTNESS.md#cli-rob-006-put-a-timeout-on-every-network-operation), [CLI-ROB-001](ROBUSTNESS.md#cli-rob-001-validate-input-before-doing-any-work) |
| Automation | Non-interactive login. Under `--json`, errors are a JSON object on stderr. | [CLI-AGT-008](AGENT-READINESS.md#cli-agt-008-offer-a-non-interactive-way-to-authenticate), [CLI-AGT-001](AGENT-READINESS.md#cli-agt-001-emit-a-structured-error-object-on-stderr-in-json-mode) |
| Telemetry | None without consent. | [CLI-ANL-001](NAMING-AND-DISTRIBUTION.md#cli-anl-001-do-not-send-usage-or-crash-data-without-consent) |

## Guidance-mode answers

- Cite rule IDs with links (for example "[CLI-OUT-014](OUTPUT.md#cli-out-014-disable-color-when-not-on-a-terminal-or-when-the-user-asks)") so the user can read the rationale.
- Prefer showing the corrected code or help text over describing it.
- When the user's design deliberately departs from a rule, say which rule and what it costs, then respect the decision. These are guidelines, not law.

## Anti-patterns

- Printing progress, warnings, or logs to stdout, which corrupts pipes and `--json`.
- Color or spinners in CI logs or files because the TTY check was skipped.
- `--help` that exits non-zero, writes to stderr, or needs a network call.
- Prompting when stdin is not a TTY, which hangs CI forever.
- Accepting `--password`/`--token` values on the command line.
- Catch-all subcommands or prefix-matching of subcommand names, which make every future command name a breaking change.
- Exit code 0 after an error was printed, or 1 for everything including usage errors.
- Stack traces as the default error output.
- Changing `--json` field names or types without a version bump and deprecation period.
- Telemetry or update checks that are on by default, undisclosed, or block the command.

## Attribution

Rules marked with a clig.dev source are adapted from the [Command Line Interface Guidelines](https://clig.dev) by Aanand Prasad, Ben Firshman, Carl Tashian, and Eva Parish, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Rules marked `original` extend that guidance. This skill's documentation is licensed CC BY-SA 4.0 and its scripts MIT; see [LICENSE.txt](LICENSE.txt).
