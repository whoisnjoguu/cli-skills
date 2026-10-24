# Contributing

Thanks for helping improve these skills. Issues and pull requests are welcome for new rules, corrections, framework updates, and tooling fixes.

## Setup

Requirements: Node.js 18 or newer. There are no dependencies to install.

```bash
git clone https://github.com/whoisnjoguu/cli-skills
cd cli-skills
npm run lint && npm test
```

| Command | What it does |
|---|---|
| `npm run build` | Regenerates every `checklist.json` from the rule headings. Run it after any rule edit. |
| `npm run lint` | Fails if a checklist is stale, a link or anchor is broken, a rule reference is unknown, shared files differ between skills, frontmatter is invalid, or a companion file is not linked from its `SKILL.md`. |
| `npm test` | Runs the validator, probe, parser, and lint tests. |

CI also runs the official [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) validator. To run it locally with [uv](https://docs.astral.sh/uv/):

```bash
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate skills/cli-design
```

## Writing rules

A rule is one checkable behavior. Rules live in the companion `.md` files of each skill, under a `## Rules` section (or several topic sections), in exactly this shape:

```markdown
### CLI-OUT-020: Imperative title in sentence case, no trailing period

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#output>

What to do and why, in one to three short paragraphs. Optional short code example.

**Verify:** How an auditor checks it: what to grep for, or the exact safe command to run and what to observe.
```

- **ID**: `CLI-` or `TUI-`, the file's area code, and the next free three-digit number in that area.
- **Level**: `must` breaks scripts or users when violated; `should` is clearly recommended; `consider` depends on context.
- **Severity** is the default severity when an audit finds the rule violated. `high` means it breaks automation, loses data, leaks secrets, does something destructive without confirmation, or hangs. `medium` is a significant usability or interoperability problem, `low` is polish, and `info` is optional advice.
- **Check** lists how a rule can be verified: `static` (visible in source), `probe` (observable by running safe, read-only invocations), `manual` (needs human judgment).
- **Source** is the most specific clig.dev anchor the rule derives from, or `original`.
- Titles are plain text, without backticks or emphasis, because they become anchors in `checklist.json`.
- Non-rule subsections inside a rules section use `####`, not `###`.

### Rule ID stability

Rule IDs appear in published audit reports, so they are permanent:

- Never renumber a rule or reuse an ID, even after deleting the rule.
- Rewording a rule is fine if it still checks the same behavior. If the behavior changes, add a new rule instead.
- Record added, changed, and removed rules in [CHANGELOG.md](CHANGELOG.md).

### Style

- Write dense, imperative text for agents and engineers. No marketing, no filler, no emoji.
- Paraphrase clig.dev rather than copying it; short quoted phrases are fine.
- Keep code examples short and correct, and label framework major versions where APIs differ (for example Bubble Tea v1 and v2).
- Use US English and sentence-case headings.

## Shared files

`probe-cli.cjs`, `validate-findings.cjs`, `report-schema.json`, and `LICENSE.txt` are copied into every skill so that each skill installs on its own. Edit them in one skill, then copy the file to the others; lint fails if the copies differ.

The CLI rules in `skills/tui-design/CLI-BASELINE.md` mirror rules in `cli-design`. If you change the title, level, or severity of a mirrored rule, change both; lint enforces this.

## Releases

1. Update the version in `package.json` and `metadata.version` in every `SKILL.md`; lint checks that they match.
2. Move the `Unreleased` entries in [CHANGELOG.md](CHANGELOG.md) under the new version.
3. Tag the release as `vX.Y.Z`.

## License

By contributing, you agree that documentation changes are licensed under [CC BY-SA 4.0](LICENSE-DOCS) and code changes under the [MIT License](LICENSE).
