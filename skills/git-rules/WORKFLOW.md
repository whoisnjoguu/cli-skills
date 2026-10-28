# Workflow and preflight

Load this file at the start of any task that ends in a commit, a push, or a pull request. It covers what to check before touching the repository, how to discover and follow the project's conventions, and the boundaries an agent must respect when it acts on someone else's behalf.

The agent is a guest in the repository. The person who asked for the change owns it: their identity goes on the commits, their conventions win over the agent's defaults, and anything that cannot be undone needs their say-so.

## Preflight checklist

Run these read-only commands before changing anything, and keep the answers in mind for the rest of the task:

```bash
git status --short --branch          # current branch, upstream, dirty files
git log --oneline -15                # subject style, prefixes, language
git remote -v                        # where pushes go
git config user.name && git config user.email
ls .github/PULL_REQUEST_TEMPLATE* .github/pull_request_template* 2>/dev/null
ls CONTRIBUTING* .commitlintrc* commitlint.config.* .gitmessage .husky .pre-commit-config.yaml 2>/dev/null
gh repo view --json defaultBranchRef,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed 2>/dev/null
```

## Rules

### GIT-WRK-001: Inspect the repository state before making changes

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** original

Before editing, staging, or branching, learn the current branch, its upstream, whether the working tree is dirty, and which remote a push would go to. Uncommitted changes that are already there belong to the user and must not be swept into your commits or discarded.

**Verify:** The task transcript or shell history shows `git status` (or equivalent) before the first write. Any pre-existing modified files are either left untouched or explicitly discussed with the user.

### GIT-WRK-002: Discover and follow the repository's conventions

- **Level:** must
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project>

Read `CONTRIBUTING.md`, any commit message template (`.gitmessage`, `commit.template`), commitlint or husky configuration, the pull request template, and the last 15 to 30 commit subjects. Match what you find: prefix style (Conventional Commits or plain), subject case and tense, branch naming, sign-off requirements, and merge strategy. When the repository has no detectable convention, fall back to the defaults in this skill and say so in the pull request description.

**Verify:** New commits and the branch name are indistinguishable in style from recent history. Where the repository configures commitlint or a template, the new messages pass it.

### GIT-WRK-003: Never commit directly to the default or a protected branch

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/best-practices-for-pull-requests>

Work on a topic branch even for one-line fixes, even when the user is the only contributor. Direct commits on `main` or `master` bypass review and CI and cannot be opened as a pull request.

**Verify:** `git branch --show-current` is not the default branch at commit time, and `git log origin/<default>..HEAD` on the default branch is empty.

### GIT-WRK-004: Run the repository's hooks and never bypass them

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** original

Pre-commit, commit-msg, and pre-push hooks encode the project's quality bar. Do not pass `--no-verify`, set `HUSKY=0`, `SKIP=...`, or `core.hooksPath` to something else to get around them. If a hook fails, fix the cause; if a hook is broken, tell the user instead of working around it.

**Verify:** No `--no-verify`, `-n` with `git commit`, `HUSKY=0`, or hooks-path changes appear in the commands used. Hook output shows the hooks ran.

### GIT-WRK-005: Commit under the user's identity

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Commits carry the configured `user.name` and `user.email`. Never change them to an agent's or tool's name, never use `--author` to attribute the commit to anyone but the person who asked for the change, and never fabricate an identity when none is configured. If `user.name` or `user.email` is unset, ask the user for the values rather than guessing.

**Verify:** `git log --format='%an <%ae> | %cn <%ce>' origin/<base>..HEAD` shows only the user's identity, matching `git config user.name` and `user.email`.

### GIT-WRK-006: Make the change build and pass tests before committing it

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Run the smallest command that covers the change (a unit test file, a lint target, a type check) before each commit, and the fuller suite before pushing. Committing known-broken code shifts the cost to reviewers and to anyone who bisects later.

**Verify:** The transcript shows the relevant build, lint, or test command passing between the last edit and the commit, or the pull request description records how the change was verified.

### GIT-WRK-007: Push and open pull requests only when the task calls for it

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** original

A push publishes commits and a pull request notifies people. Do these when the user asked for them or when the task clearly requires them (for example "open a PR"). Otherwise stop at a local commit and report what is ready to push. Never push to a branch other than the one you created for this task.

**Verify:** Every `git push` and `gh pr create` in the transcript corresponds to an explicit request or to a stated task requirement.

### GIT-WRK-008: Leave the user's uncommitted work untouched

- **Level:** must
- **Severity:** high
- **Check:** manual
- **Source:** original

If the working tree is dirty when you start, do not stash, reset, check out over, or stage those files. Commit only the hunks you changed for this task. If the pre-existing changes block the task (for example they conflict with the files you need to edit), explain the situation and ask how to proceed.

**Verify:** `git stash list` is unchanged, no `reset --hard`, `checkout --`, `restore`, or `clean` ran against files you did not create, and the staged diff contains only task-related hunks.

### GIT-WRK-009: Start from an up-to-date base

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging>

Fetch before branching so the topic branch starts at the current tip of the base branch. Branching from a stale local default branch produces avoidable conflicts and pull requests that include commits the base already has.

**Verify:** `git merge-base <base> HEAD` equals `origin/<base>` at the time the branch was created, or the branch has since been rebased onto it; `git log HEAD..origin/<base>` is empty or short when the pull request opens.
