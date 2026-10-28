# Branches

Load this file when creating a branch or reviewing branch names. A branch name is read in `git branch`, in pull request headers, in CI logs, and in URLs, so it must say what the change is in a few words and be safe to type and paste.

## Defaults when the repository has no convention

- Lowercase kebab-case: `add-retry-to-uploader`.
- An optional type prefix separated by a slash, if the repository already uses one: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`, `ci/`.
- An optional issue key placed after the prefix: `fix/482-timeout-on-empty-body` or `feat/PROJ-123-export-csv`.
- Two to five words that name the change, not the file or the process: `rename-config-flag`, not `update-files` or `work-in-progress`.

## Rules

### GIT-BRN-001: Create a topic branch for every change

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows>

Each unit of work gets its own branch created from the base branch. Reusing an old branch, or piling a second task onto a branch that already has a pull request open, mixes unrelated history and blocks independent review and revert.

**Verify:** `git log --oneline <base>..HEAD` contains only commits for this task; the branch did not exist before the task started or was empty relative to the base.

### GIT-BRN-002: Use lowercase kebab-case names

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** original

Lowercase letters, digits, and hyphens, with slashes only as prefix separators. Mixed case causes collisions on case-insensitive filesystems and in hosts that lowercase refs, and underscores and camelCase read worse in URLs.

**Verify:** The name matches `^[a-z0-9]+(?:[-/][a-z0-9]+)*$`, allowing an uppercase issue key such as `PROJ-123` only when the tracker uses one.

### GIT-BRN-003: Match the repository's prefix convention

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** original

Look at `git branch -r` and recent merged pull requests. If branches use `feat/`, `fix/`, `user/name/`, or ticket keys, do the same. If they use plain descriptive names, do not introduce prefixes. The point of a convention is uniformity, not any particular scheme.

**Verify:** The new branch name follows the same shape as the majority of recent remote branches, or the repository documents the scheme the name uses.

### GIT-BRN-004: Describe the change, not the author, tool, or date

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** original

A branch name says what will land when it merges. Names such as `alice-stuff`, `copilot/fix-1`, `agent-patch-2`, `monday-fixes`, or `tmp` carry no information and age badly. The author is already in the commit metadata; the tool that helped is irrelevant to the history.

**Verify:** The name contains no personal names, agent or tool names, dates, or placeholder words (`tmp`, `test`, `wip`, `stuff`, `misc`, `patch`, `changes`), unless the repository's own convention requires a `user/<name>/` namespace.

### GIT-BRN-005: Keep names short and specific

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** original

Aim for two to five words and at most about 50 characters after any prefix. Drop articles and filler (`the`, `a`, `some`, `various`), and avoid names so generic that two branches could share them (`fix-bug`, `update-readme`, `refactor`).

**Verify:** The name is 50 characters or fewer after the prefix, and a reader can tell from the name alone which change it holds.

### GIT-BRN-006: Reference the issue or ticket when work is tracker-driven

- **Level:** consider
- **Severity:** info
- **Check:** static
- **Source:** <https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-a-branch-for-an-issue>

When the change closes a tracked issue, include its key (`482-`, `PROJ-123-`) so hosts and trackers link the branch and pull request automatically. Keep the description after the key; a bare key is not a name.

**Verify:** Branches for tracked issues contain the key, followed by a description, in the position the repository's other branches use.

### GIT-BRN-007: Use only characters that every shell and host accepts

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://git-scm.com/docs/git-check-ref-format>

Avoid spaces, `~`, `^`, `:`, `?`, `*`, `[`, `\`, `@{`, consecutive or trailing slashes, a trailing dot or `.lock`, and names that begin with a dash. These are rejected by `git check-ref-format`, break shell completion, or need quoting in CI.

**Verify:** `git check-ref-format --branch <name>` exits 0 and the name needs no quoting on the command line.

### GIT-BRN-008: Keep one unit of work per branch

- **Level:** should
- **Severity:** medium
- **Check:** static
- **Source:** <https://google.github.io/eng-practices/review/developer/small-cls.html>

If a task grows a second independent change (a drive-by refactor, a dependency bump, a fix in an unrelated module), put it on its own branch and pull request. A branch that does several things is reviewed less carefully and cannot be reverted cleanly.

**Verify:** The pull request title describes all commits on the branch without needing "and"; `git diff --stat <base>...HEAD` touches only areas the title implies.

### GIT-BRN-009: Delete topic branches after they merge

- **Level:** consider
- **Severity:** info
- **Check:** probe
- **Source:** original

Merged branches are noise in `git branch -r` and in pull request pickers. Delete the remote branch on merge (or enable automatic deletion in the host) and prune locally with `git fetch --prune`.

**Verify:** `git branch -r --merged origin/<base>` lists no stale topic branches owned by the author, or the repository has delete-on-merge enabled.
