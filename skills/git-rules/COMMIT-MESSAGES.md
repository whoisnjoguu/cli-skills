# Commit messages

Load this file when writing or reviewing a commit message. The message is the only part of a commit a future reader sees before the diff. `git log`, `git blame`, bisect output, release notes, and code review all start from it.

## Shape of a message

```text
Summarize the change in 50 characters or fewer

Explain what the change does and, above all, why it is needed, in
prose wrapped at 72 columns. Describe the problem, the approach, and
any alternative that was rejected. Do not describe how the code works;
the diff does that.

Fixes #482
```

The subject is a complete, imperative sentence without a trailing period, written so that "If applied, this commit will ..." reads correctly in front of it. When the repository uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), the subject becomes `type(scope): description` and the same rules apply to the description part; see [CONVENTIONS.md](CONVENTIONS.md) for the type table.

Write the message with the editor, a heredoc, or `git commit -F <file>`. A single `-m` with a paragraph crammed into it produces a subject line that is far too long.

## Rules

### GIT-MSG-001: Separate the subject from the body with a blank line

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** <https://cbea.ms/git-commit/#separate>

Git treats the first line as the subject and everything after the first blank line as the body. Without the blank line, `git log --oneline`, `git shortlog`, and hosts show the whole message as one run-on subject.

**Verify:** `git log --format='%B' <base>..HEAD` shows every message with either a single line, or a subject, an empty line, and then the body.

### GIT-MSG-002: Keep the subject at 50 characters, never more than 72

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** <https://cbea.ms/git-commit/#limit-50>

Fifty characters keeps the subject readable in `git log --oneline`, in host UIs that truncate, and in email. If you cannot fit the summary in 72, the commit is probably doing too much.

**Verify:** `git log --format='%s' <base>..HEAD | awk 'length > 72'` prints nothing, and subjects over 50 are rare and justified.

### GIT-MSG-003: Capitalize the subject and omit the trailing period

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** <https://cbea.ms/git-commit/#capitalize>

Begin the subject with a capital letter, as a sentence, and do not end it with a period. Trailing punctuation wastes space and reads oddly in lists. When a Conventional Commits prefix is used, the convention's own lowercase type and description style takes precedence; match the repository.

**Verify:** `git log --format='%s' <base>..HEAD` shows subjects that start with a capital letter (or a conventional type) and do not end with `.`.

### GIT-MSG-004: Write the subject in the imperative mood

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** <https://cbea.ms/git-commit/#imperative>

"Add", "Fix", "Remove", "Rename", not "Added", "Fixes", "Adding", "Removed". Git's own generated messages (merge, revert) use the imperative, and the test "If applied, this commit will <subject>" must read as a sentence.

**Verify:** Each subject completes "If applied, this commit will ..." grammatically; none begins with a past-tense or gerund verb or with a noun phrase such as "Bug fix".

### GIT-MSG-005: Wrap the body at 72 columns

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** <https://cbea.ms/git-commit/#wrap-72>

Git does not wrap text. Bodies wrapped at 72 stay readable in an 80-column terminal with `git log` indentation. Code blocks, URLs, and quoted error output may exceed the limit when wrapping would break them.

**Verify:** `git log --format='%b' <base>..HEAD | awk 'length > 72'` prints only URLs, code, or quoted output.

### GIT-MSG-006: Explain what changed and why, not how

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** <https://cbea.ms/git-commit/#why-not-how>

The diff shows how. The body should cover what the reader cannot get from the diff: the problem, the reason this approach was chosen, side effects, and anything a future maintainer would otherwise have to rediscover. Trivial changes may have no body; non-trivial ones need one.

**Verify:** For each commit with a non-trivial diff, the body states the motivation or the problem being solved, and does not narrate the code line by line.

### GIT-MSG-007: Make the subject meaningful on its own

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** original

A subject must identify the change in a `git log --oneline` list among hundreds of others. "Fix", "Update", "Changes", "WIP", "Misc", "Address comments", "Fix tests", and a bare file or ticket name do not.

**Verify:** No subject in `git log --format='%s' <base>..HEAD` is a single generic word, a bare filename, or a bare ticket key, and each one tells a reader which change it is without opening the diff.

### GIT-MSG-008: Use Conventional Commits only when the repository does

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://www.conventionalcommits.org/en/v1.0.0/>

If recent history or a commitlint configuration shows `type(scope): description` subjects, follow the specification exactly: a type from the project's allowed set, an optional scope, a `!` or `BREAKING CHANGE:` footer for breaking changes, and the same case the project uses. If the repository does not use the convention, do not introduce it; a `feat:` prefix in a plain-style history is as out of place as the reverse.

**Verify:** When a commitlint config or a majority of recent subjects use conventional prefixes, every new subject passes `commitlint` or matches `^(type)(\([a-z0-9-]+\))?!?: `; otherwise no new subject carries a type prefix.

### GIT-MSG-009: Reference issues and pull requests in the footer

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** <https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue>

Put `Fixes #482`, `Closes org/repo#12`, or `Refs PROJ-123` on its own line at the end of the body, using the host's keywords so the issue is linked and, when merged, closed. Do not put the ticket key in the subject unless the repository convention requires it.

**Verify:** Commits that resolve a tracked issue carry a recognized closing keyword and reference in the footer; references are not the only content of the subject.

### GIT-MSG-010: Use git trailers for structured metadata

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** <https://git-scm.com/docs/git-interpret-trailers>

Metadata such as `Signed-off-by:`, `Co-authored-by:` for a human pair author, `Reviewed-by:`, and `Refs:` goes in `Key: value` trailer lines at the end of the message, separated from the body by a blank line, so tools can parse them. Do not scatter metadata through the prose.

**Verify:** `git interpret-trailers --parse` on each message returns the intended trailers, and no metadata appears outside the trailer block.

### GIT-MSG-011: Never attribute the commit to an AI agent or tool

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** original

The person who requested and reviewed the change is its author. Do not add `Co-authored-by:` trailers naming an assistant, "Generated by", "Created with", or "via <tool>" lines, tool emoji or signature lines, or any other mention of the agent in the subject, body, or trailers. The same applies to pull request titles and descriptions ([PULL-REQUESTS.md](PULL-REQUESTS.md)). The only exception is a documented repository or organization policy that explicitly requires an AI-use disclosure, in the exact form it specifies.

**Verify:** `git log --format='%B' <base>..HEAD` contains no `Co-authored-by:` line naming a bot, assistant, or `noreply` tool account, and no "generated", "created with", or tool-name self-reference, unless `CONTRIBUTING.md` or an equivalent policy requires one.

### GIT-MSG-012: Add a Signed-off-by trailer only when the project requires it

- **Level:** must
- **Severity:** medium
- **Check:** static
- **Source:** <https://developercertificate.org/>

Projects that enforce the Developer Certificate of Origin require `Signed-off-by: Name <email>` on every commit, produced with `git commit -s` in the user's configured identity. The sign-off is the user's legal statement, not a courtesy: add it when a DCO check or `CONTRIBUTING.md` requires it, in the user's name, and otherwise leave it out.

**Verify:** When the repository has a DCO check or documents the requirement, every commit carries a `Signed-off-by:` trailer matching `git config user.name` and `user.email`; otherwise no sign-off is present.

### GIT-MSG-013: Match the repository's language and style

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** original

Read the last 20 to 30 subjects. Match the language, the use or absence of scopes, how components are named ("cli:", "docs:", "[ci]"), and whether subjects are sentence case or lowercase. Consistency makes history scannable.

**Verify:** New subjects placed in `git log --oneline -30` are indistinguishable in form from their neighbors.

### GIT-MSG-014: Do not paste diffs, file lists, or tool output into the message

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** original

Listing every changed file, pasting the diff, or dumping test output duplicates information git already stores and buries the explanation. Quote only the specific line of an error message or output that motivates the change.

**Verify:** No body enumerates changed files or contains more than a few quoted lines of output.

### GIT-MSG-015: Flag breaking changes explicitly

- **Level:** must
- **Severity:** high
- **Check:** static
- **Source:** <https://www.conventionalcommits.org/en/v1.0.0/#specification>

A change that alters a public interface, removes a flag, changes a default, or requires a migration must say so where release tooling and readers will find it: a `BREAKING CHANGE:` footer (and `!` after the type under Conventional Commits), or a clearly labeled paragraph in the body for plain-style repositories, naming what breaks and how to migrate.

**Verify:** Every commit whose diff removes or changes public behavior carries a breaking-change marker in the message; commits without such a marker make no incompatible changes.

### GIT-MSG-016: Compose multi-line messages with an editor, heredoc, or file

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** original

A single `-m "..."` cannot hold a well-formed subject, blank line, and wrapped body without shell gymnastics, and multiple `-m` flags are easy to misorder. Use `git commit` with the editor, `git commit -F <file>`, or a quoted heredoc, and reread the result with `git log -1 --format=%B` before pushing.

**Verify:** The transcript shows messages written via editor, `-F`, or heredoc, and `git log -1 --format=%B` after each commit shows the intended shape.
