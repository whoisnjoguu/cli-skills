# Audit workflow

Use this file only in audit mode, when the user explicitly asks to audit, review, or grade a CLI, or asks for a report. The audit grades the target against every rule in [checklist.json](checklist.json) and backs each verdict with evidence. The output is a validated `findings.json` and a `REPORT.md` derived from it.

## Principles

- **Evidence or it did not happen.** Every `pass` and `fail` cites source lines (`path:line`), probe output (`probe:<id>`), or documentation. A guess is `needs_validation`, not a verdict.
- **Grade the rule, not the taste.** A finding is a violation of a specific rule ID. Style preferences without a rule are notes in the report, not findings.
- **Respect deliberate deviations.** If the project documents a reason for departing from a rule, record `fail` with the documented reason in `summary` and lower the severity with a `severity_rationale`, or `not_applicable` when the rule truly does not apply.
- **Not applicable is a claim.** `not_applicable` needs a concrete reason, for example "no subcommands" or "no network access".
- **Severity is impact.** Start from the rule's default severity and adjust only with a `severity_rationale`, using the rubric below.

## Safety rules

Source review is read-only. Running the target is optional and limited:

1. Never run the target's subcommands, defaults, install scripts, build hooks, or tests unless the user explicitly allows it for this audit.
2. Probe only with [probe-cli.cjs](probe-cli.cjs), and only after reading the source and confirming that `--help`, `-h`, and `--version` are handled before any side effect (config writes, network calls, migrations, telemetry). Record that confirmation in `inventory.md`.
3. Add the opt-in probes (`--include unknown-flag,no-args,help-subcommand`) only when the source shows those invocations cannot trigger a default action with side effects.
4. Use an existing build of the tool. Build it only when the user allows it, and never install dependencies or fetch from the network to do so.
5. `probe-cli.cjs` isolates HOME/XDG, closes stdin, points proxy variables at a closed port, and enforces a timeout. It is not an OS sandbox. If the target could still do harm, skip probing and use `mode: "static"`.
6. Never use real credentials, accounts, or production endpoints. If a rule can only be settled that way, record `needs_validation` with a safe plan for the owner.

## Setup

Resolve before starting:

- **Skill directory**: the absolute directory containing this file.
- **Target**: the repository root (and the built binary, if probing).
- **Output directory**: a new directory outside the target, by default `~/cli-skills-audits/<tool-name>/run-<N>`, where `<N>` is the next unused integer. Write inside the target only if the user asks and version control ignores that path.
- **Source ref**: the commit hash, and whether the worktree is dirty.
- **Scope**: the full checklist by default. If the user narrows the audit (for example "just output and errors"), record `scope` as rule areas such as `["CLI-OUT", "CLI-ERR"]`, and present the report as partial.

The parent is the only writer of files in the output directory.

## Phase 1: Inventory

Read the code and write `inventory.md` in the output directory. It should cover:

- language, argument-parsing library, entry point, and how the binary is built and distributed;
- the command tree, listing every command and subcommand with its flags (from source, not only from help text);
- where stdout and stderr are written, every color or styling call, and any TTY detection;
- prompts and confirmations, and how each behaves without a TTY;
- config files, environment variables read, and their precedence;
- network calls, timeouts, telemetry and update checks;
- signal handling, cleanup, temp files, and lock files;
- the test suite and which behaviors it covers;
- probe safety: whether `--help`/`-h`/`--version` are side-effect free (cite lines) and whether probing is allowed.

## Phase 2: Probe (optional)

If probing is allowed and safe:

```bash
node <skill-dir>/probe-cli.cjs --out <output-dir>/probe.json -- <path-to-built-tool> [fixed prefix args]
```

Each derived check in `probe.json` lists the rule IDs it informs. A probe `fail` is strong evidence. A probe `pass` is evidence for that invocation only (for example, help on the root command, not every subcommand). `inconclusive` is a lead for static review, never a verdict. Set `mode: "static+probe"` and `probe_file` in `findings.json`.

## Phase 3: Review by area

Grade every rule in scope. For large targets, delegate one sub-agent per rule area group (for example BAS+HLP+DOC, OUT+ERR, ARG+INT+SUB, ROB+SIG+FUT, CFG+ENV, NAM+DST+ANL+TST). Give each sub-agent:

1. its role: grade the assigned rules against the target and return only a JSON array of result objects matching [report-schema.json](report-schema.json);
2. `inventory.md` verbatim;
3. the full text of each assigned rule copied from the companion file (heading, metadata, body, and Verify paragraph), not just the IDs;
4. the relevant probe checks from `probe.json`, if any;
5. the evidence rules from this file and the severity rubric below;
6. read-only instructions: no edits, no execution beyond reading files.

For each rule, follow its **Verify** paragraph. Then record one of these results:

| Status | Use when | Required fields |
|---|---|---|
| `pass` | Evidence shows the rule is satisfied on the paths that matter. | `evidence` (≥1) |
| `fail` | Evidence shows a violation. | `severity`, `summary`, `evidence`, `recommendation` (+ `severity_rationale` if not the default) |
| `not_applicable` | The rule's precondition is absent. | `reason` |
| `needs_validation` | The decisive fact is outside the source and safe probes. | `unresolved`, `plan` |

Write recommendations as the smallest concrete change, with a `fix_example` (code or help text) when it helps.

## Phase 4: Assemble and validate

The parent merges results into `<output-dir>/findings.json`:

```json
{
  "schema_version": 1,
  "skill": "cli-rules",
  "target": { "name": "mytool", "path": "/abs/path/to/repo", "kind": "cli", "source_ref": "abc1234 (clean)", "language": "Go", "framework": "cobra", "entrypoint": "cmd/mytool/main.go" },
  "mode": "static+probe",
  "generated_at": "2026-01-01T12:00:00Z",
  "probe_file": "probe.json",
  "results": [
    { "rule_id": "CLI-BAS-004", "status": "pass", "evidence": [{ "kind": "source", "location": "internal/out/print.go:12-30", "detail": "results written via cmd.OutOrStdout()" }] },
    { "rule_id": "CLI-OUT-014", "status": "fail", "severity": "medium", "summary": "Color is forced on when stdout is piped.", "evidence": [{ "kind": "probe", "location": "probe:help_long", "detail": "SGR color codes on piped stdout" }, { "kind": "source", "location": "internal/ui/color.go:8", "detail": "color.NoColor = false" }], "recommendation": "Remove the override and let the color library detect TTY and NO_COLOR." }
  ]
}
```

Then validate it and fix every error until the validator exits 0:

```bash
node <skill-dir>/validate-findings.cjs <output-dir>/findings.json
```

A full-scope audit must contain exactly one result per checklist rule. The validator reports missing rule IDs.

## Phase 5: Verify failures

Have a fresh sub-agent that did not produce the result try to disprove every `high` failure and every `fail` whose only evidence is static. Give it the rule text, the result, and read access to the target. It confirms the result, corrects the evidence, or downgrades the result to `pass` or `needs_validation`. Re-run the validator after every change.

## Phase 6: Report

Derive `<output-dir>/REPORT.md` from the validated `findings.json`. Add no claims that are not in it.

```markdown
# CLI audit: <tool> @ <source ref>

<One paragraph: what was reviewed, mode (static or static+probe), scope (full or partial), date.>

## Summary
| Status | Count |   ...pass / fail / not applicable / needs validation
| Severity | Failures | ...high / medium / low / info

## Top fixes
<The 3–7 highest-impact failures, ordered by severity and then by how many users or scripts they affect. One line each, with rule ID link and the fix.>

## Failures
### <RULE-ID>: <rule title> (<severity>)
<summary>
Evidence: <locations>
Fix: <recommendation> (+ fix_example)

## Needs validation
<RULE-ID>: <unresolved> — Plan: <plan>

## Passing and not applicable
<Compact table: rule ID, title, status, one-line evidence or reason.>

## Method
<Inventory highlights, probe command and environment, what was not executed and why.>
```

Rule links in the report point to the companion file anchors (the `anchor` field in [checklist.json](checklist.json)).

## Severity rubric

| Severity | Meaning | Typical examples |
|---|---|---|
| `high` | Breaks automation, loses or corrupts data, leaks secrets, destroys without confirmation, or hangs. | Exit 0 on failure, prompt without a TTY, secrets as flags, data on stderr or logs on stdout under `--json`, no timeout on network calls |
| `medium` | A significant usability or interoperability problem that most users will hit. | No `--json` for data commands, color in pipes, help unreachable from subcommands, unclear errors for common mistakes |
| `low` | Polish that experienced users notice. | Help not example-led, no typo suggestions, verbose success output |
| `info` | Optional improvements at `consider` level. | Man pages, `.env` support, emoji choices |

Raise a severity when the tool runs in CI, handles credentials, or is called by other programs. Lower it when the affected path is rare and documented.
