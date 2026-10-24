# Audit workflow

Use this file only in audit mode, when the user explicitly asks to audit, review, or grade a TUI, or asks for a report. The audit grades the target against every rule in [checklist.json](checklist.json), covering the TUI rules and the [CLI baseline](CLI-BASELINE.md). The output is a validated `findings.json` and a `REPORT.md` derived from it.

## Principles

- **Evidence or it did not happen.** Every `pass` and `fail` cites source lines (`path:line`), probe output (`probe:<id>`), an observation from an approved interactive session, or documentation. Anything unproven is `needs_validation`.
- **Grade the rule, not the taste.** Visual preferences without a rule are notes in the report, not findings.
- **Frameworks carry evidence.** If the framework guarantees a behavior (for example, it restores the terminal on panic), cite the framework call that enables it and check that the app does not bypass it.
- **Not applicable is a claim.** For example, "inline prompt only, no alternate screen" makes alternate-screen rules not applicable. Say so.
- **Severity is impact.** Start from the rule's default and adjust only with a `severity_rationale` (rubric below).

## Safety rules

1. Source review is read-only. Do not run the target's commands, tests, or build without the user's permission for this audit.
2. Probe the non-interactive entry points only with [probe-cli.cjs](probe-cli.cjs), and only after the source confirms that `--help`, `-h`, and `--version` return before any side effect. Record the confirmation in `inventory.md`.
3. Interactive checks (resize, Ctrl-Z, key flows, panic restoration) need explicit user permission, a built binary, throwaway data, a temporary `HOME`/XDG directories, and no real credentials. Drive them in an isolated `tmux` session (`tmux new-session -d -x 80 -y 24`, `send-keys`, `capture-pane -p -e`, `resize-window`, `kill-session`), or record `needs_validation` with that plan.
4. Never connect the app to production services or real accounts. A rule that needs them to settle becomes `needs_validation`.

## Setup

- **Skill directory**: the absolute directory containing this file.
- **Target**: the repository root (and the built binary, if probing).
- **Output directory**: a new directory outside the target, by default `~/cli-skills-audits/<tool-name>/run-<N>`, where `<N>` is the next unused integer.
- **Source ref**: the commit hash, and whether the worktree is dirty.
- **Scope**: the full checklist by default. Narrowed audits record `scope` (for example `["TUI-TRM", "TUI-INP", "CLI-HLP-001"]`) and present themselves as partial.

The parent is the only writer of files in the output directory.

## Phase 1: Inventory

Write `inventory.md` in the output directory. It should cover:

- framework and version, app model, entry point, and the argument parser;
- startup sequence: TTY check, raw mode, alternate screen, mouse, bracketed paste, keyboard protocol, and where each is undone;
- panic, exception, and signal handlers (SIGINT, SIGTERM, SIGHUP, SIGTSTP/SIGCONT, SIGWINCH);
- the view list, the keymap (from source), the help overlay, and the key-hint bar;
- background work: how it is spawned, how results return, and cancellation;
- rendering: diffing or full redraw, frame-rate cap, width calculation, and sanitization of external text;
- color: depth detection, `NO_COLOR`, theme files, and hardcoded colors;
- logging destination, config files, environment variables, and the non-interactive commands;
- existing tests (snapshots, pty tests) and the terminals they cover;
- probe safety and whether interactive checks are permitted.

## Phase 2: Probe and observe (optional)

Non-interactive probe, when safe:

```bash
node <skill-dir>/probe-cli.cjs --out <output-dir>/probe.json -- <path-to-built-tool>
```

This informs the CLI baseline rules listed in each check's `rules` field. It does not exercise the interactive UI.

Approved interactive checks use `observation` evidence. Name the exact sequence, for example `tmux 80x24: send-keys C-c; capture-pane shows shell prompt, stty -a shows icanon echo`.

## Phase 3: Review by area

Grade every rule in scope. For large targets, delegate one sub-agent per group: CLI baseline, ARC, LAY, INP, CLR+ACC, TRM+TST. Give each sub-agent:

1. its role: grade the assigned rules and return only a JSON array of result objects matching [report-schema.json](report-schema.json);
2. `inventory.md` verbatim;
3. the full text of each assigned rule (heading, metadata, body, and Verify paragraph);
4. the relevant probe checks and observations;
5. the evidence rules and severity rubric from this file;
6. read-only instructions.

| Status | Use when | Required fields |
|---|---|---|
| `pass` | Evidence shows the rule is satisfied. | `evidence` (≥1) |
| `fail` | Evidence shows a violation. | `severity`, `summary`, `evidence`, `recommendation` (+ `severity_rationale` if not the default) |
| `not_applicable` | The rule's precondition is absent. | `reason` |
| `needs_validation` | The decisive fact needs an unapproved interactive check, a specific terminal, or external state. | `unresolved`, `plan` |

## Phase 4: Assemble and validate

Write `<output-dir>/findings.json` following [report-schema.json](report-schema.json):

```json
{
  "schema_version": 1,
  "skill": "tui-design",
  "target": { "name": "mytui", "path": "/abs/path/to/repo", "kind": "tui", "source_ref": "abc1234 (clean)", "language": "Rust", "framework": "ratatui", "entrypoint": "src/main.rs" },
  "mode": "static+probe",
  "generated_at": "2026-01-01T12:00:00Z",
  "probe_file": "probe.json",
  "results": [
    { "rule_id": "TUI-TRM-002", "status": "fail", "severity": "high", "summary": "Panics print while raw mode and the alternate screen are active.", "evidence": [{ "kind": "source", "location": "src/main.rs:14-40", "detail": "no panic hook; terminal restored only on the normal quit path" }], "recommendation": "Install a panic hook that calls ratatui::restore() before the default hook." },
    { "rule_id": "TUI-LAY-004", "status": "needs_validation", "unresolved": "Behavior below 40x10 is computed at runtime by a layout solver.", "plan": "Run in tmux at 30x8 and capture the pane." }
  ]
}
```

Validate it and fix every error until the validator exits 0:

```bash
node <skill-dir>/validate-findings.cjs <output-dir>/findings.json
```

A full-scope audit needs exactly one result per checklist rule.

## Phase 5: Verify failures

A fresh sub-agent that did not produce the result tries to disprove every `high` failure and every failure backed only by static evidence. It confirms, corrects, or downgrades each one. Re-validate after every change.

## Phase 6: Report

Derive `<output-dir>/REPORT.md` from the validated findings only:

```markdown
# TUI audit: <tool> @ <source ref>

<What was reviewed, framework, mode (static / static+probe / with approved interactive checks), scope, date.>

## Summary
<Counts by status; failures by severity.>

## Top fixes
<3–7 highest-impact failures. Terminal-restore and hang failures come first.>

## Failures
### <RULE-ID>: <title> (<severity>)
<summary> · Evidence: <locations> · Fix: <recommendation> (+ fix_example)

## Needs validation
<RULE-ID>: <unresolved> — Plan: <plan>

## Passing and not applicable
<Compact table.>

## Method
<Inventory highlights, probe command, interactive sequences run (or not run, and why), terminals used.>
```

## Severity rubric

| Severity | Meaning | Typical examples |
|---|---|---|
| `high` | Leaves the terminal broken, hangs, loses data, leaks secrets, enables terminal injection, or blocks automation. | No restore on panic, UI started without a TTY, unsanitized escape sequences from untrusted data, destructive key without confirmation |
| `medium` | A significant usability, compatibility, or accessibility problem most users hit. | No resize handling, color-only status, no help overlay, frozen UI during network calls, unreadable on light backgrounds |
| `low` | Polish. | No vim keys, missing empty states in minor views, unconfigurable theme |
| `info` | Optional improvements at `consider` level. | OSC 8 links, kitty keyboard protocol |
