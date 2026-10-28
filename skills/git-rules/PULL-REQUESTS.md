# Pull requests

Load this file when pushing a branch, opening or updating a pull request, or responding to review. A pull request is a request for someone else's time. Its title and description should let a reviewer decide in a minute what the change is, why it matters, and how to check it.

## Description skeleton

Use the repository's template when it has one. Otherwise:

```markdown
## What

One or two sentences naming the change, in the same terms as the commit subjects.

## Why

The problem or request this addresses, with a link to the issue if there is one.

## How it was verified

The commands run and their results, or the manual steps taken. Note anything not tested.

## Notes for reviewers

Breaking changes, migrations, follow-ups, open questions, and where to start reading.
```

`gh pr create --title "<title>" --body-file <file>` keeps the body well-formed. Write the body to a file first, exactly as with commit messages ([GIT-MSG-016](COMMIT-MESSAGES.md#git-msg-016-compose-multi-line-messages-with-an-editor-heredoc-or-file)).

## Rules

### GIT-PR-001: Push the branch with an upstream and target the correct base

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request>

Push with `git push -u origin <branch>` so later pushes and `gh` commands know the upstream, and open the pull request against the branch the change belongs on: the default branch unless the repository uses a development or release branch, or the change is part of a stack. Never open a pull request from the default branch itself.

**Verify:** `git rev-parse --abbrev-ref @{upstream}` resolves, and `gh pr view --json baseRefName,headRefName` shows the intended base and the topic branch.

### GIT-PR-002: Keep each pull request small and single-purpose

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://google.github.io/eng-practices/review/developer/small-cls.html>

A pull request should do one thing that its title can state. Small pull requests are reviewed faster and more thoroughly, merge with fewer conflicts, and revert cleanly. Split independent changes into separate pull requests, and stack dependent ones so each can be reviewed alone.

**Verify:** `gh pr view --json title,additions,deletions,changedFiles` shows a title without "and" or a list, and a diff a reviewer can read in one sitting; multiple unrelated areas in the file list indicate a split is needed.

### GIT-PR-003: Write the title like a commit subject

- **Level:** must
- **Severity:** medium
- **Check:** probe
- **Source:** <https://cbea.ms/git-commit/>

The title follows the subject rules in [COMMIT-MESSAGES.md](COMMIT-MESSAGES.md): imperative, capitalized unless the convention says otherwise, no trailing period, about 50 and at most 72 characters, and in the repository's prefix style. In repositories that squash-merge, the title becomes the commit subject on the default branch, so it must stand on its own in `git log`.

**Verify:** The title passes the same checks as a commit subject (GIT-MSG-002, GIT-MSG-003, GIT-MSG-004, GIT-MSG-007, GIT-MSG-008) and, for a single-commit pull request, matches that commit's subject.

### GIT-PR-004: Describe what changed, why, and how it was verified

- **Level:** must
- **Severity:** medium
- **Check:** probe
- **Source:** <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/best-practices-for-pull-requests>

The description gives the reviewer context the diff cannot: the problem, the chosen approach and rejected alternatives, and the exact steps or commands used to verify the change. An empty or one-word description, or one that only repeats the title, forces the reviewer to reverse-engineer the intent.

**Verify:** `gh pr view --json body` contains a statement of purpose, a rationale, and a verification section (commands, tests, or manual steps), each with real content.

### GIT-PR-005: Complete the repository's pull request template

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository>

When `.github/PULL_REQUEST_TEMPLATE.md` (or the equivalent for the host) exists, keep its structure and fill every section honestly. Tick checklist items only when they are true, write "Not applicable" with a reason rather than deleting a section, and leave no placeholder text.

**Verify:** The body contains every heading from the template, no template placeholder or HTML comment remains, and no checklist box is ticked for something the pull request did not do.

### GIT-PR-006: Link the issues the pull request addresses

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** <https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue>

Use closing keywords (`Fixes #482`, `Closes #12`) in the description for issues the pull request fully resolves, and plain references (`Refs #99`, `Part of #7`) for partial work, so the tracker links and closes correctly.

**Verify:** `gh pr view --json closingIssuesReferences` lists the resolved issues, and partially addressed issues are referenced without a closing keyword.

### GIT-PR-007: Call out breaking changes, migrations, and follow-ups

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** original

Anything that requires action from users, operators, or other contributors must be in the description under its own heading: interface changes, configuration or data migrations, dependency or runtime requirement changes, and known gaps left for a follow-up pull request. Reviewers and release managers read the description, not every commit.

**Verify:** When the diff changes public behavior, schema, configuration, or requirements, the body has an explicit breaking-change or migration section; deferred work is listed under follow-ups.

### GIT-PR-008: Keep agent attribution and self-reference out of the pull request

- **Level:** must
- **Severity:** medium
- **Check:** probe
- **Source:** original

The title, description, commits, and comments speak for the author. Do not add "Generated by", "Created with", "This PR was written by an AI", tool badges or emoji signatures, or `Co-authored-by:` lines for an assistant. Describe the change, not the process that produced it. Follow a documented repository policy on AI disclosure if one exists, in the form it specifies.

**Verify:** `gh pr view --json title,body,comments` contains no agent, assistant, or tool self-reference, and the commits pass GIT-MSG-011.

### GIT-PR-009: Open unfinished work as a draft

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests#draft-pull-requests>

If the change is not ready for review (missing tests, pending decision, red CI you are still fixing), create it with `--draft` so reviewers are not notified prematurely, and mark it ready only when every item in the description is true.

**Verify:** `gh pr view --json isDraft` is `true` while the description lists outstanding work or CI is failing, and `false` only once the pull request is complete.

### GIT-PR-010: Make CI green before requesting review

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/best-practices-for-pull-requests>

Run the checks locally first ([GIT-WRK-006](WORKFLOW.md#git-wrk-006-make-the-change-build-and-pass-tests-before-committing-it)), then watch the first CI run and fix failures on your branch. A pull request handed over with red checks wastes the reviewer's first pass. Do not disable, skip, or retry-until-green a failing check to make it pass.

**Verify:** `gh pr checks` reports every required check passing (or pending) when review is requested, and no commit on the branch disables or skips a check.

### GIT-PR-011: Respond to review with new commits and a reply per thread

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/incorporating-feedback-in-your-pull-request>

Push review fixes as additional, well-described commits so reviewers can see what changed since their last look, unless the repository asks for amended or rebased history during review. Reply to each thread with what you did or why you did not, and let the reviewer resolve their own threads where the project expects that.

**Verify:** After a review round, new commits exist on the branch with subjects describing the fix (not "address comments"), the pull request was not force-pushed mid-review unless the repository convention requires it, and each thread has a reply.

### GIT-PR-012: Update the branch with the repository's chosen strategy

- **Level:** consider
- **Severity:** low
- **Check:** probe
- **Source:** <https://git-scm.com/book/en/v2/Git-Branching-Rebasing>

When the base branch moves, bring the topic branch up to date the way the project does: `git rebase <base>` where history is kept linear, `git merge <base>` where merge commits are accepted, or the host's "update branch" button. Mixing both on one branch produces confusing history.

**Verify:** `git log --oneline --graph <base>..HEAD` shows either a linear series or merge commits from the base, not both, and the method matches recent merged pull requests.

### GIT-PR-013: Show visible changes

- **Level:** consider
- **Severity:** info
- **Check:** probe
- **Source:** original

For changes to terminal output, help text, UI, or rendered documentation, include before-and-after output, a screenshot, or a recording in the description. Reviewers should not have to build the branch to see the result.

**Verify:** Pull requests that change user-visible output include a sample of the new output or an image.

### GIT-PR-014: Merge only when asked, with checks and approvals satisfied

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges>

Merging is the user's decision unless they delegated it. When merging, use the method the repository allows or prefers (squash, rebase, or merge commit), make sure required checks have passed and required reviews are approved, and do not bypass branch protection with administrator privileges. For a squash merge, give the resulting commit a subject and body that meet the commit message rules.

**Verify:** The merge happened only after an explicit request, `gh pr view --json mergeStateStatus,reviewDecision` showed clean and approved beforehand, and the merge method matches `gh repo view --json squashMergeAllowed,rebaseMergeAllowed,mergeCommitAllowed` and recent history.
