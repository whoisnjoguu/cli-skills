# Audit workflow

Use this file only in audit mode, when the user explicitly asks to audit, review, or grade a branch, a pull request, or a repository's recent history against this skill, or asks for a report. The audit grades the target against every rule in [checklist.json](checklist.json) and backs each verdict with evidence. The output is a validated `findings.json` and a `REPORT.md` derived from it.

## Principles

- **Evidence or it did not happen.** Every `pass` and `fail` cites a commit (`commit:<sha>`), a pull request (`pr:<number>`), a file and line (`path:line`), a document, or a named read-only command and its output. A guess is `needs_validation`, not a verdict.
- **Grade the rule, not the taste.** A finding is a violation of a specific rule ID. Style preferences without a rule are notes in the report, not findings.
- **The repository's convention wins.** Many rules defer to the project's own convention. Establish the convention in the inventory first, then grade against it. Deviating from this skill's defaults in favor of a documented or clearly established convention is a `pass`.
- **Not applicable is a claim.** `not_applicable` needs a concrete reason, for example "no pull request exists for this branch" or "the repository has no DCO requirement".
- **Severity is impact.** Start from the rule's default severity and adjust only with a `severity_rationale`.

## Safety rules

The audit is read-only.

1. Run only commands that read state: `git log`, `git show`, `git diff`, `git branch`, `git status`, `git config --get`, `git check-ref-format`, `git interpret-trailers --parse`, `git cat-file`, `gh pr view`, `gh pr checks`, `gh repo view`, `gh api` GET requests.
2. Never fetch, pull, check out, rebase, commit, push, comment on, or change the state of the pull request or repository as part of the audit.
3. Never run the project's build, tests, or hooks unless the user explicitly allows it for this audit. Rules whose Verify step needs them (for example GIT-CMT-002) are `needs_validation` with a plan when not allowed.
4. Treat `Check: manual` rules that depend on the transcript of the original work (for example GIT-WRK-001, GIT-CMT-005, GIT-HST-004) as `needs_validation` unless the user supplied that transcript, and say what to look for.

## Setup

Resolve before starting:

- **Skill directory**: the absolute directory containing this file.
- **Target**: the repository path, the topic branch, the base branch, and the pull request number if one exists.
- **Output directory**: a new directory outside the target, by default `~/cli-skills-audits/<repo>/<branch>/run-<N>`, where `<N>` is the next unused integer.
- **Source ref**: the branch tip SHA and the base SHA it is compared against.
- **Scope**: the full checklist by default. If the user narrows the audit (for example "just the commit messages"), record `scope` as rule areas such as `["GIT-MSG"]` and present the report as partial.

## Phase 1: Inventory

Write `inventory.md` in the output directory, covering:

- the default branch, the base branch, the topic branch name, and the pull request (number, title, draft state, base);
- the repository's conventions as detected with the table in [CONVENTIONS.md](CONVENTIONS.md): message style, enforced tooling, branch pattern, template, sign-off and signing requirements, merge strategy;
- the commit list: `git log --format='%h|%an|%ae|%s' <base>..HEAD`, plus each full message body;
- the diff summary: `git diff --stat <base>...HEAD`, and which rule areas the touched files suggest (generated files, config, secrets patterns);
- the pull request body, template headings present, linked issues, checks status, and review state, from `gh pr view`;
- identity: `git config user.name` and `user.email` compared with the commit authors.

## Phase 2: Review by area

Grade every rule in scope, following its **Verify** paragraph. For large targets, delegate one sub-agent per area (WRK, BRN, CMT, MSG, PR, HST). Give each sub-agent:

1. its role: grade the assigned rules and return only a JSON array of result objects matching [report-schema.json](report-schema.json);
2. `inventory.md` verbatim;
3. the full text of each assigned rule copied from the companion file;
4. the read-only command list from the safety rules above;
5. no permission to edit, fetch, push, or comment.

| Status | Use when | Required fields |
|---|---|---|
| `pass` | Evidence shows the rule is satisfied. | `evidence` (≥1) |
| `fail` | Evidence shows a violation. | `severity`, `summary`, `evidence`, `recommendation` (+ `severity_rationale` if not the default) |
| `not_applicable` | The rule's precondition is absent. | `reason` |
| `needs_validation` | The decisive fact needs the transcript, the test suite, or the user. | `unresolved`, `plan` |

Evidence kinds for this skill: `commit` with `commit:<sha>` or `pr:<number>`, `source` with `path:line` for files such as `.commitlintrc` or the template, `doc` for `CONTRIBUTING.md` or a URL, and `observation` naming the read-only command that was run and what it printed.

Write recommendations as the smallest concrete change: a rewritten subject, a split plan listing which hunks go where, or the exact `git` command.

## Phase 3: Assemble and validate

Merge results into `<output-dir>/findings.json`:

```json
{
  "schema_version": 1,
  "skill": "git-rules",
  "target": { "name": "cli-skills", "path": "/abs/path/to/repo", "kind": "repo", "source_ref": "git-rules-skill @ 3f2a9c1 vs master @ dd12d00" },
  "mode": "static",
  "generated_at": "2026-01-01T12:00:00Z",
  "results": [
    { "rule_id": "GIT-MSG-004", "status": "pass", "evidence": [{ "kind": "commit", "location": "commit:3f2a9c1", "detail": "subject 'Add git-rules skill' is imperative" }] },
    { "rule_id": "GIT-MSG-002", "status": "fail", "severity": "low", "summary": "One subject is 84 characters.", "evidence": [{ "kind": "commit", "location": "commit:9b1d2e0", "detail": "subject length 84" }], "recommendation": "Shorten to 'Reject unknown flags instead of ignoring them' and move the detail to the body.", "fix_example": "Reject unknown flags instead of ignoring them" }
  ]
}
```

Then validate it and fix every error until the validator exits 0:

```bash
node <skill-dir>/validate-findings.cjs <output-dir>/findings.json
```

A full-scope audit must contain exactly one result per checklist rule.

## Phase 4: Report

Derive `<output-dir>/REPORT.md` from the validated `findings.json`. Add no claims that are not in it.

```markdown
# Git workflow audit: <repo> <branch> @ <sha> (vs <base>)

<One paragraph: what was reviewed, scope, date, detected conventions.>

## Summary
| Status | Count |
| Severity | Failures |

## Top fixes
<The 3–7 highest-impact failures, one line each, with rule ID link and the fix.>

## Failures
### <RULE-ID>: <rule title> (<severity>)
<summary>
Evidence: <commit SHAs, PR number, paths>
Fix: <recommendation> (+ fix_example)

## Needs validation
<RULE-ID>: <unresolved> — Plan: <plan>

## Passing and not applicable
<Compact table: rule ID, title, status, one-line evidence or reason.>
```

Link each rule ID to its anchor in the companion file, using the `anchor` field from `checklist.json`.
