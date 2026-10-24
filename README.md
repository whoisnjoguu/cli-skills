# cli-skills

[![CI](https://github.com/whoisnjoguu/cli-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/whoisnjoguu/cli-skills/actions/workflows/ci.yml)

Agent skills for designing, building, and auditing **command-line tools** and **terminal user interfaces (TUIs)**. They are based on the [Command Line Interface Guidelines](https://clig.dev).

The guidelines are written as numbered rules. Each rule has a stable ID, a level (`must` / `should` / `consider`), a default severity, a link to its clig.dev source, and a **Verify** step. A coding agent can follow the rules while building a tool, cite them when answering questions, and grade a codebase against them in an evidence-backed audit.

## Skills

| Skill | Use it for | Rules |
|---|---|---|
| [`cli-rules`](skills/cli-rules/SKILL.md) | Designing, building, or reviewing a CLI: arguments and flags, help text, output and `--json`, errors and exit codes, interactivity, subcommands, config and env vars, signals, robustness, naming, distribution, and testing. | 156 |
| [`tui-rules`](skills/tui-rules/SKILL.md) | Full-screen or inline interactive terminal apps (Bubble Tea, Ratatui, Textual, Ink, tview, prompt libraries): architecture, layout and rendering, keybindings, color and accessibility, terminal compatibility and restore, and testing. Includes a 24-rule CLI baseline, because a TUI is a CLI first. | 117 |

Each skill is self-contained, so you can install either one without the other.

## What a skill does

Each skill has three modes:

- **Guidance (default).** Answers design questions ("what exit code for a usage error?", "how should Ctrl-C behave in my TUI?") and cites rule IDs. It does not run anything or write files.
- **Build.** When you ask the agent to create or change a tool, it follows the skill's build workflow. The workflow covers the parsing library, help, stream separation, TTY and color detection, exit codes, signals, config precedence and tests, checked against the relevant rules.
- **Audit.** Runs only when you explicitly ask for an audit or review report:
  1. Inventory the code.
  2. Optionally run a sandboxed probe of the built binary.
  3. Review the code area by area against every rule.
  4. Write `findings.json`, validated against a JSON schema and the checklist.
  5. Write a `REPORT.md` with the failures ranked by severity.

## Installation

With the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
# Install both skills into the current project
npx skills add https://github.com/whoisnjoguu/cli-skills

# Or pick one, globally
npx skills add https://github.com/whoisnjoguu/cli-skills --skill cli-rules --global
npx skills add https://github.com/whoisnjoguu/cli-skills --skill tui-rules --global
```

As a Claude Code plugin:

```bash
claude plugin marketplace add whoisnjoguu/cli-skills
claude plugin install cli-rules@cli-skills
claude plugin install tui-rules@cli-skills
```

Inside a session, `/plugin marketplace add whoisnjoguu/cli-skills` does the same, and `/plugin` lists both plugins.

Manually, copy a skill directory to wherever your agent loads skills from:

```bash
git clone https://github.com/whoisnjoguu/cli-skills
cp -r cli-skills/skills/cli-rules ~/.claude/skills/        # Claude Code
cp -r cli-skills/skills/cli-rules ~/.copilot/skills/       # GitHub Copilot CLI
cp -r cli-skills/skills/cli-rules .agents/skills/          # project-local, other agents
```

## Usage

Example prompts:

```text
Build a CLI in Go called `notes` that adds, lists, and searches notes. Follow the cli-rules skill.
What should `mytool deploy` do when stdin isn't a TTY and it needs confirmation?
Add a --json flag to the `list` command.
Make a Ratatui log viewer with a filter box, vim-style keys, and a help overlay.
Why is my terminal broken after my Textual app crashes?
Audit this CLI against the cli-rules skill and write a report.
Review just output and error handling in this tool (partial audit).
Audit this TUI for accessibility and terminal compatibility.
```

### Audit output

An audit writes to a new directory outside the target, by default `~/cli-skills-audits/<tool>/run-<N>/`:

| File | Contents |
|---|---|
| `inventory.md` | Command tree, streams, config and env, network and signals, and probe-safety notes with line citations. |
| `probe.json` | Optional output from `probe-cli.cjs`: help and version behavior, color when piped, `NO_COLOR`, `TERM=dumb`, no-TTY hangs, unknown flags. |
| `findings.json` | One result per rule (`pass`, `fail`, `not_applicable`, `needs_validation`), each with evidence. Must pass `validate-findings.cjs`. |
| `REPORT.md` | A summary, failures by severity, open questions, and an appendix of passing rules. |

## Repository layout

```
skills/
  cli-rules/
    SKILL.md                   entry point: modes, routing table, build workflow
    AUDIT.md                   audit workflow
    PHILOSOPHY.md              clig.dev principles (no rules)
    THE-BASICS.md              CLI-BAS  parsing library, exit codes, streams
    HELP-AND-DOCS.md           CLI-HLP, CLI-DOC
    OUTPUT.md                  CLI-OUT  TTY detection, --json, color, paging
    ERRORS.md                  CLI-ERR
    ARGUMENTS-AND-FLAGS.md     CLI-ARG  plus standard flag names
    INTERACTIVITY.md           CLI-INT
    SUBCOMMANDS.md             CLI-SUB
    ROBUSTNESS.md              CLI-ROB, CLI-SIG
    FUTURE-PROOFING.md         CLI-FUT
    CONFIGURATION-AND-ENV.md   CLI-CFG, CLI-ENV
    NAMING-AND-DISTRIBUTION.md CLI-NAM, CLI-DST, CLI-ANL
    LANGUAGE-STACKS.md         per-language libraries and idioms (no rules)
    TESTING.md                 CLI-TST
    checklist.json             generated rule index
    report-schema.json         findings contract
    validate-findings.cjs      findings validator
    probe-cli.cjs              safe behavior probe
    LICENSE.txt                bundled license notices
  tui-rules/
    SKILL.md, AUDIT.md
    CLI-BASELINE.md            24 CLI rules every TUI must also meet
    ARCHITECTURE.md            TUI-ARC
    LAYOUT-AND-RENDERING.md    TUI-LAY
    INPUT-AND-KEYBINDINGS.md   TUI-INP  plus conventional keymap
    COLOR-AND-ACCESSIBILITY.md TUI-CLR, TUI-ACC
    TERMINAL-COMPAT.md         TUI-TRM
    FRAMEWORKS.md              framework notes (no rules)
    TESTING.md                 TUI-TST
    checklist.json, report-schema.json, validate-findings.cjs, probe-cli.cjs, LICENSE.txt
.claude-plugin/
  marketplace.json             Claude Code plugin marketplace (one plugin per skill)
scripts/
  build-checklist.cjs          regenerates checklist.json from the rule headings
  lint-skills.cjs              consistency checks
  run-tests.cjs                cross-platform test runner
test/                          node:test suites and probe fixtures
```

## Tools

All tools use plain Node.js 18+ with no dependencies, and follow the guidelines they enforce: help on `-h`/`--help`, data on stdout, errors on stderr, exit code 2 for usage errors.

```bash
# Probe a built CLI (isolated HOME/XDG, closed stdin, timeouts, no network proxy)
node skills/cli-rules/probe-cli.cjs -- ./bin/mytool
node skills/cli-rules/probe-cli.cjs --include all --out probe.json -- ./bin/mytool

# Validate an audit's findings
node skills/cli-rules/validate-findings.cjs path/to/findings.json
```

## Design principles

- **Rules, not essays.** Each piece of guidance is a rule you can check and cite by ID. Background lives in prose around the rules.
- **Faithful to the source.** Rules derived from clig.dev link to the section they come from. Rules marked `original` cover areas clig.dev does not, such as TUIs and testing.
- **Evidence-backed audits.** Every verdict cites `path:line` or a probe result. Anything uncertain is recorded as `needs_validation` with a plan, never guessed.
- **Safe by default.** Guidance mode never executes anything. Audits read source first and probe only invocations that the source shows are side-effect free.
- **Self-contained skills.** Shared tooling is duplicated and lint keeps the copies byte-identical, so each skill installs on its own.

## Development

```bash
npm run build   # regenerate checklist.json files after editing rules
npm run lint    # checklists fresh, links and anchors resolve, rule refs exist, frontmatter valid
npm test        # validator, probe, parser, and lint tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rule format, the rule ID stability policy, and the release steps, and [CHANGELOG.md](CHANGELOG.md) for changes.

## Acknowledgements

Built on the [Command Line Interface Guidelines](https://clig.dev) by Aanand Prasad, Ben Firshman, Carl Tashian, and Eva Parish.

## License

- Code (`*.cjs`, `*.json`): [MIT](LICENSE).
- Documentation (`*.md`), adapted from clig.dev: [CC BY-SA 4.0](LICENSE-DOCS).

Each skill bundles both notices in its own `LICENSE.txt`, so a skill installed on its own keeps its license.
