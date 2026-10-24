# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Rule IDs are permanent; see [CONTRIBUTING.md](CONTRIBUTING.md#rule-id-stability).

## Unreleased

### Added

- Bundled `LICENSE.txt` in each skill, plus `license` and `metadata` frontmatter.
- CONTRIBUTING.md and this changelog.
- Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) with `cli-rules` and `tui-rules` plugins; lint keeps it in sync with the skills.
- CI runs the official skills-ref validator and a macOS job.

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
