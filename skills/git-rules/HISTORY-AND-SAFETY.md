# History and safety

Load this file before any operation that rewrites, discards, or publishes history: rebase, amend, reset, force-push, stash, clean, tag, or anything touching remotes. Git makes most mistakes recoverable from the reflog for a while, but a force-push over a shared branch or a `reset --hard` over uncommitted work is lost for someone else, and often for good.

## Safe and unsafe operations

| Safe without asking | Ask first or never |
|---|---|
| `git rebase -i` on an unpublished branch you created | Rebasing or amending commits that exist on a shared remote branch |
| `git commit --amend` on your own unpushed commit | `--amend` on a commit by someone else |
| `git push -u origin <your-topic-branch>` | `git push --force` without `--force-with-lease`, or to any branch you did not create |
| `git stash` of your own in-progress hunks | `git stash drop`, `git reset --hard`, `git checkout -- .`, `git clean -f` over the user's work |
| `git fetch --prune` | Deleting remote branches or tags you did not create |
| Reading `git log`, `git reflog`, `git diff` | Changing remotes, `user.*`, hooks, or signing configuration |

## Rules

### GIT-HST-001: Never rewrite history that has been pushed to a shared branch

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** <https://git-scm.com/book/en/v2/Git-Branching-Rebasing#_rebase_peril>

Once commits are on a branch others may have fetched (the default branch, release branches, any branch with more than one contributor), they are fixed. Fix mistakes with new commits or `git revert`. Rebasing or amending published commits forces everyone downstream to recover and silently loses their work when they do not.

**Verify:** `git log origin/<shared>` is a prefix of the local branch before every push to it; no push to a shared branch ever requires `--force`.

### GIT-HST-002: Force-push only your own topic branch, and only with a lease

- **Level:** must
- **Severity:** high
- **Check:** probe, manual
- **Source:** <https://git-scm.com/docs/git-push#Documentation/git-push.txt---force-with-leaseltrefnamegt>

After an intentional rebase of an unpublished-to-others topic branch, push with `git push --force-with-lease`, which refuses if the remote moved since your last fetch. Plain `--force` can erase commits a reviewer or CI pushed meanwhile. Never force-push a branch you did not create or during active review unless the repository convention expects rebased updates.

**Verify:** The transcript contains no `git push --force` or `-f`; any `--force-with-lease` targets a branch created for this task.

### GIT-HST-003: Do not amend, reword, or squash someone else's commits

- **Level:** must
- **Severity:** high
- **Check:** probe
- **Source:** original

Another person's commits on the branch are theirs: editing them changes authorship context and the record of who decided what. If their commit needs a fix, add a commit on top. If the branch must be squashed, let the merge do it or ask them.

**Verify:** `git log --format='%an %ae' <base>..HEAD` before and after your work shows the same author on every pre-existing commit, with unchanged SHAs for commits you did not make.

### GIT-HST-004: Confirm before discarding any uncommitted or unpushed work

- **Level:** must
- **Severity:** high
- **Check:** manual
- **Source:** original

`git reset --hard`, `git checkout -- <path>`, `git restore`, `git clean -fd`, `git stash drop`, `git branch -D`, and deleting a worktree can destroy work that exists nowhere else. Use them only on state you created in this task, or after the user explicitly agreed, and say exactly what will be lost before running them.

**Verify:** Each destructive command in the transcript is preceded by either evidence that it only affects task-created state or an explicit confirmation from the user.

### GIT-HST-005: Never commit conflict markers or half-resolved merges

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging#_basic_merge_conflicts>

After a merge or rebase conflict, resolve every file, build and test, and inspect `git diff` for `<<<<<<<`, `=======`, and `>>>>>>>` before continuing. A committed conflict marker breaks the build for everyone and shows the change was never run.

**Verify:** `git grep -nE '^(<{7}|={7}|>{7})( |$)' HEAD` returns nothing, and `git diff --check` reports no conflict markers.

### GIT-HST-006: Leave remote and repository configuration alone

- **Level:** should
- **Severity:** medium
- **Check:** probe
- **Source:** original

Do not add or rename remotes, change remote URLs, alter `user.*`, `core.hooksPath`, `commit.gpgsign`, or `push.default`, or install global hooks as part of a task. If the task genuinely needs a configuration change (for example a fork remote to open a pull request), make it minimal, local to the repository, and state it in your report.

**Verify:** `git remote -v` and `git config --list --local` are unchanged after the task, or every difference is listed in the final report with a reason.

### GIT-HST-007: Treat a committed secret as compromised

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository>

If a credential reaches a commit, removing it in a later commit does not help: it stays in history and in every clone. Tell the user immediately, so they can rotate it. Rewrite history to purge it only on an unpushed branch, or on a shared branch with the owner's explicit approval and a plan for every clone and fork.

**Verify:** When a secret is found in the branch diff, the transcript shows the user was informed before any push, and any history rewrite was approved by the repository owner.

### GIT-HST-008: Sign commits when the repository requires it, with the user's key

- **Level:** must
- **Severity:** medium
- **Check:** probe
- **Source:** <https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification>

If branch protection requires signed commits or `commit.gpgsign` is set, commits must be signed with the user's configured GPG, SSH, or S/MIME key. Never generate a new key, import a key, or disable signing to get a commit through. If signing fails, report the error and stop.

**Verify:** `git log --show-signature <base>..HEAD` shows a good signature from the user's key on every commit when the repository requires signatures; no commit was created with `--no-gpg-sign` in such a repository.

### GIT-HST-009: Use annotated tags for releases and never move a published tag

- **Level:** must
- **Severity:** medium
- **Check:** probe
- **Source:** <https://git-scm.com/book/en/v2/Git-Basics-Tagging>

Release tags are annotated (`git tag -a vX.Y.Z -m ...`) or signed so they carry a date, an author, and a message, and follow the project's version scheme. A tag that has been pushed is a promise: if it points at the wrong commit, cut a new version rather than deleting and re-pushing it, because clones and package registries have already recorded the old one.

**Verify:** `git cat-file -t <tag>` is `tag` (not `commit`) for release tags, the name matches the repository's scheme (for example `v1.4.0`), and no `git push --delete` or `--force` of a tag appears in the transcript.
