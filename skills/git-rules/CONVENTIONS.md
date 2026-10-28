# Conventions reference

Reference material for the rules in this skill. It contains no rules of its own. Use it to recognize a convention a repository already follows and to produce output in that form.

## Detecting the repository's convention

| Signal | Where to look | What it tells you |
|---|---|---|
| Commit subject style | `git log --format=%s -30` | Conventional Commits (`feat:`), component prefixes (`cli:`), or plain sentences; capitalization; language |
| Enforced message rules | `.commitlintrc*`, `commitlint.config.*`, `.gitlint`, `.pre-commit-config.yaml`, `.husky/commit-msg`, `.githooks/` | Allowed types and scopes, subject length limits, required trailers |
| Message template | `git config commit.template`, `.gitmessage` | Expected sections of the body |
| Branch naming | `git branch -r`, merged pull requests | Prefix scheme, issue key placement, personal namespaces |
| Pull request shape | `.github/PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE/`, `.gitlab/merge_request_templates/` | Required sections and checklists |
| Sign-off | DCO check in CI, `CONTRIBUTING.md`, `Signed-off-by` in recent commits | Whether `git commit -s` is required |
| Signing | Branch protection "require signed commits", `commit.gpgsign`, `Verified` badges | Whether commits must be signed |
| Merge strategy | `gh repo view --json squashMergeAllowed,rebaseMergeAllowed,mergeCommitAllowed`, `git log --merges -10` | Whether history is linear and whether the PR title becomes the commit subject |
| Default branch | `gh repo view --json defaultBranchRef`, `git symbolic-ref refs/remotes/origin/HEAD` | Where to branch from and target |

When signals conflict, the enforced configuration (commitlint, hooks, CI) wins over documentation, and documentation wins over recent habit.

## Conventional Commits

Subject form: `type(scope)!: description`. The description follows the same rules as a plain subject (imperative, no trailing period, about 50 characters) but is conventionally lowercase.

| Type | Use for | Semantic version effect |
|---|---|---|
| `feat` | A new user-facing capability | minor |
| `fix` | A bug fix | patch |
| `docs` | Documentation only | none |
| `style` | Formatting, whitespace, missing semicolons; no code change | none |
| `refactor` | Code change that neither fixes a bug nor adds a feature | none |
| `perf` | Performance improvement | patch |
| `test` | Adding or correcting tests | none |
| `build` | Build system or external dependencies | none or patch |
| `ci` | CI configuration and scripts | none |
| `chore` | Maintenance that touches no source or tests | none |
| `revert` | Reverts a previous commit; body names the SHA | depends |

Breaking changes: append `!` after the type or scope (`feat(api)!: remove v1 endpoints`) and add a `BREAKING CHANGE: <description>` footer. Either marks a major version bump.

Projects may restrict or extend the type list; the commitlint configuration is authoritative. Scopes are project-defined nouns (`cli`, `parser`, `deps`), not file paths.

## Plain-style messages

Used by Git itself, the Linux kernel, and many projects without release automation.

```text
Reject unknown flags instead of ignoring them

Unknown flags were silently dropped, so a typo in a script ran the
command with defaults. Fail with exit code 2 and name the flag, which
is what every other subcommand already does.

Fixes #482
```

Some projects prefix the subject with the component and a colon (`parser: reject unknown flags`); match what you see.

## Branch name patterns

| Pattern | Example | Seen in |
|---|---|---|
| Plain description | `reject-unknown-flags` | Small projects, solo repositories |
| Type prefix | `fix/reject-unknown-flags` | Projects mirroring Conventional Commits |
| Issue key first | `482-reject-unknown-flags` | GitHub "create branch from issue" |
| Type and issue key | `fix/482-reject-unknown-flags`, `feat/PROJ-123-export-csv` | Tracker-driven teams |
| Personal namespace | `alice/reject-unknown-flags` | Large monorepos; use only when the repository does |

## Trailers

| Trailer | Meaning | When to add |
|---|---|---|
| `Signed-off-by: Name <email>` | The author certifies the Developer Certificate of Origin | Only when the project requires DCO; always in the user's identity (`git commit -s`) |
| `Co-authored-by: Name <email>` | A second human author | Pair or mob programming with another person; never for an agent or tool |
| `Reviewed-by:`, `Acked-by:`, `Tested-by:` | Review provenance, kernel style | When the project uses them |
| `Fixes #n`, `Closes #n`, `Resolves #n` | Closing keywords understood by the host | When the commit or pull request fully resolves the issue |
| `Refs #n`, `Part of #n`, `See also` | Non-closing reference | Partial work or related context |
| `BREAKING CHANGE: ...` | Incompatible change | Any change that requires user action |

## Pull request template skeleton

```markdown
## What

## Why

## How it was verified

## Breaking changes and migrations

None.

## Follow-ups

None.
```

## Useful commands

```bash
# Inspect
git status --short --branch
git log --oneline --graph -20
git log --format='%h %an <%ae> %s' origin/main..HEAD
git diff --staged
git diff --check origin/main...HEAD

# Branch
git fetch origin
git switch -c fix/482-reject-unknown-flags origin/main

# Commit
git add -p
git commit                      # editor
git commit -F /tmp/msg.txt      # message from file
git commit --fixup <sha> && git rebase -i --autosquash origin/main   # before first push only

# Check messages
git log --format='%s' origin/main..HEAD | awk 'length > 72'
git log --format='%B' origin/main..HEAD | grep -niE 'co-authored-by.*(bot|copilot|claude|gpt|assistant|noreply)|generated (by|with)'
npx commitlint --from origin/main   # if the repository uses commitlint

# Publish
git push -u origin HEAD
gh pr create --base main --title "Reject unknown flags instead of ignoring them" --body-file /tmp/pr.md
gh pr create --draft ...
gh pr view --json title,body,baseRefName,isDraft,closingIssuesReferences
gh pr checks

# Verify safety
git check-ref-format --branch <name>
git grep -nE '^(<{7}|={7}|>{7})( |$)' HEAD
git interpret-trailers --parse < /tmp/msg.txt
```
