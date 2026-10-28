# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Rule IDs are permanent; see [CONTRIBUTING.md](CONTRIBUTING.md#rule-id-stability).

## Unreleased

### Added

- `git-rules`: new skill with 69 rules (GIT-WRK, GIT-BRN, GIT-CMT, GIT-MSG, GIT-PR, GIT-HST) for turning finished work into a branch, focused commits, and a pull request: preflight and convention detection, branch naming, commit splitting, commit messages including Conventional Commits, trailers, DCO, and no agent attribution, pull request titles, descriptions, templates, review, and merging, and history-rewriting safety. Includes a conventions reference and an audit workflow for branches and pull requests.
- Tooling: `GIT-` rule prefix; `probe-cli.cjs` is optional per skill; each skill bundles its own `LICENSE.txt`; the findings schema gains a `repo` target kind and a `commit` evidence kind (`commit:<sha>` or `pr:<number>`).
- `cli-rules`: new AGENT-READINESS.md with 10 rules (CLI-AGT-001 to CLI-AGT-010) for CLIs driven by coding agents and automation: structured JSON errors, stable error codes, retry hints, dry-run plans, idempotent mutations, returned identifiers, bounded list output, non-interactive authentication, a machine-readable command tree, and deterministic output.
- `tui-rules`: CLI-AGT-001 and CLI-AGT-008 added to the CLI baseline.
- `probe-cli.cjs`: opt-in `json-error` probe that checks usage errors under `--json` (CLI-AGT-001).
- Bundled `LICENSE.txt` in each skill, plus `license` and `metadata` frontmatter.
- CONTRIBUTING.md and this changelog.
- Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) with `cli-rules` and `tui-rules` plugins; lint keeps it in sync with the skills.
- CI runs the official skills-ref validator and a macOS job.
- `tui-rules`: new EXEMPLARS.md with case studies of lazygit, k9s, btop, fzf, htop and Helix, plus list-detail, dashboard, log viewer, inline picker, and modal layout patterns, each mapped to rule IDs.

### Changed

- **Breaking:** renamed the skills `cli-design` to `cli-rules` and `tui-design` to `tui-rules`, so they can be installed alongside other skills with the old names. Reinstall with the new names; rule IDs are unchanged.
- Bubble Tea guidance now covers both the v1 and v2 APIs.
- `npm test` no longer depends on shell glob expansion.

### Fixed

- CI now runs on pushes to the default branch.
- Fixed the CLI baseline link to the `cli-rules` skill.

## 0.1.0

### Added

- `cli-design` skill with 156 rules covering the Command Line Interface Guidelines, plus build and audit workflows.
- `tui-design` skill with 117 rules, including a 24-rule CLI baseline.
- `probe-cli.cjs`, `validate-findings.cjs`, and the findings report schema.
- Checklist generator, repository lint, tests, and CI.
