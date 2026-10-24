# Philosophy

The principles behind every rule in this skill. Load this file when designing a new CLI from scratch, when a situation is not covered by a specific rule, or when two rules pull in opposite directions and you need a reason to pick one.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Scope

The guidance applies to command-line programs of any language or framework: one-shot commands, multi-command tools with subcommands, and interactive prompts. Full-screen terminal applications (editors, games, dashboards) are mostly out of scope, though the principles about signals, output streams, and robustness still apply to them. It is not guidance for GUI programs.

The guidance favors concrete practice over theory. When in doubt, follow the rule files; return here to understand why a rule exists or to resolve a conflict.

## Human-first design

Classic UNIX tools were written as if their main caller were another program, so they behave more like library functions than like interfaces for people. Many modern CLIs are run mostly by humans yet still inherit that terse, machine-oriented interaction style. If people are the primary users, design for people first, and add machine-friendly modes on top rather than the other way around.

**In practice:**

- Print readable, formatted output to a terminal by default and offer `--json` / `--plain` for scripts; see [OUTPUT.md](OUTPUT.md).
- Rewrite raw errors into plain-language explanations with a suggested fix; see [ERRORS.md](ERRORS.md).
- Make help reachable with no arguments, `-h`, and `--help`, and lead with examples; see [HELP-AND-DOCS.md](HELP-AND-DOCS.md).
- Prompt for missing input only when stdin is a TTY, never in scripts; see [INTERACTIVITY.md](INTERACTIVITY.md).

## Simple parts that work together

The UNIX tradition builds large systems from small programs with clean interfaces rather than from ever-growing monoliths. Pipes and shell scripts are still common, and CI/CD, orchestration, and configuration management have made automated composition more important, not less. Standard streams, exit codes, signals, line-oriented text, and JSON are the shared contracts that let programs snap together. Your tool will end up inside a larger system no matter what; the only choice is whether it behaves well there. Composability and human-first design are compatible, and most rules aim to achieve both.

**In practice:**

- Return zero on success and non-zero on failure, and keep primary output on stdout and diagnostics on stderr; see [THE-BASICS.md](THE-BASICS.md).
- Emit stable line-based or JSON output on request and detect when stdout is not a TTY; see [OUTPUT.md](OUTPUT.md).
- Accept `-` for stdin/stdout and read input from pipes; see [ARGUMENTS-AND-FLAGS.md](ARGUMENTS-AND-FLAGS.md).
- Handle SIGINT, SIGTERM, and SIGPIPE so the tool behaves inside pipelines and supervisors; see [ROBUSTNESS.md](ROBUSTNESS.md).

## Consistency across programs

Terminal conventions live in muscle memory: users paid once to learn flag syntax, environment variables, and common idioms, and that investment only pays off if new tools follow the same patterns. Following existing conventions makes a CLI guessable and its users fast. Convention sometimes hurts usability, though (for example, classic commands that print nothing on success can leave newcomers unsure what happened). Break a convention only deliberately, when following it would clearly harm users.

**In practice:**

- Use standard flag names (`-h`, `--help`, `-v`/`--version`, `-q`, `-f`, `-n`/`--dry-run`, `--json`) before inventing new ones; see [ARGUMENTS-AND-FLAGS.md](ARGUMENTS-AND-FLAGS.md).
- Keep subcommand verbs, flag names, and output formats uniform across the whole tool; see [SUBCOMMANDS.md](SUBCOMMANDS.md).
- Honor standard environment variables (`NO_COLOR`, `PAGER`, `EDITOR`, `XDG_CONFIG_HOME`, `HTTP_PROXY`); see [CONFIGURATION-AND-ENV.md](CONFIGURATION-AND-ENV.md).
- Follow platform conventions for names, install paths, and uninstall; see [NAMING-AND-DISTRIBUTION.md](NAMING-AND-DISTRIBUTION.md).

## Saying (just) enough

In a terminal, information is the interface, and it is easy to give too much or too little. Too little looks like a command that sits silent for minutes until the user wonders if it crashed; too much looks like pages of debug output that bury the one line that matters. Both leave the user confused. Getting the amount right is hard and essential.

**In practice:**

- Confirm state changes briefly on success and stay quiet about internals unless `--verbose` / `--debug` is set; see [OUTPUT.md](OUTPUT.md).
- Print something within 100 ms and show progress for long operations; see [ROBUSTNESS.md](ROBUSTNESS.md).
- Put the most important information at the end of error output and collapse repeated errors; see [ERRORS.md](ERRORS.md).
- Provide `-q` / `--quiet` for scripts that want silence; see [ARGUMENTS-AND-FLAGS.md](ARGUMENTS-AND-FLAGS.md).

## Ease of discovery

GUIs put every option on screen, so users can find features without memorizing anything. CLIs are assumed to be the opposite, as if "see-and-point" and "remember-and-type" were mutually exclusive. They need not be: the CLI's speed comes from remembered commands, but the commands themselves can teach. Discoverable CLIs ship thorough help with many examples, suggest the next command, and say what to do after an error.

**In practice:**

- Show concise help when run with no required arguments, and full help with examples on `--help`; see [HELP-AND-DOCS.md](HELP-AND-DOCS.md).
- Suggest the next command after a step completes, and the corrected command after a typo; see [OUTPUT.md](OUTPUT.md) and [ERRORS.md](ERRORS.md).
- Make `mytool help <subcommand>` and `mytool <subcommand> --help` both work; see [SUBCOMMANDS.md](SUBCOMMANDS.md).
- Provide shell completion and web docs; see [HELP-AND-DOCS.md](HELP-AND-DOCS.md) and [NAMING-AND-DISTRIBUTION.md](NAMING-AND-DISTRIBUTION.md).

## Conversation as the norm

CLI use is an accidental conversation: the user runs a command, gets an error, adjusts, and tries again until it works. Other conversational patterns include running setup and then learning what to do next, staging several commands before a final one (`git add` then `git commit`), exploring a system (`cd`/`ls`, `git log`/`git show`), and dry-running a risky operation before running it for real. Treating the interaction as a dialogue lets you suggest corrections, make intermediate state visible, and confirm before something dangerous. The conversation can leave users feeling stupid or leave them faster and more knowledgeable; design for the latter.

**In practice:**

- On invalid input, suggest the likely intended command or flag (and ask before running it); see [ERRORS.md](ERRORS.md).
- Show current state in multi-step workflows (like `git status`) and tell the user what changed; see [OUTPUT.md](OUTPUT.md).
- Offer `--dry-run` and confirm destructive actions, with `--force` / `--confirm=<name>` for scripts; see [INTERACTIVITY.md](INTERACTIVITY.md) and [ARGUMENTS-AND-FLAGS.md](ARGUMENTS-AND-FLAGS.md).

## Robustness

Robustness is both objective and subjective. The program should actually handle unexpected input gracefully and be idempotent where it can, and it should also feel solid: immediate and responsive, like a heavy mechanical switch rather than a flimsy one. Feeling robust comes from many small details: keeping the user informed, explaining common errors, and never dumping alarming stack traces. Simplicity helps too; piles of special cases make code fragile.

**In practice:**

- Validate input up front, add timeouts, make operations resumable, and design crash-only; see [ROBUSTNESS.md](ROBUSTNESS.md).
- Catch expected errors and rewrite them; reserve stack traces for `--debug`; see [ERRORS.md](ERRORS.md).
- Never change an interface silently, so scripts keep working across upgrades; see [FUTURE-PROOFING.md](FUTURE-PROOFING.md).
- Prefer fewer modes and flags over clever special cases; see [THE-BASICS.md](THE-BASICS.md).

## Empathy

CLIs are a programmer's creative toolkit and should be pleasant to use. That does not mean gamification or decoration; it means making users feel that the tool is on their side and that its authors thought about their problems. No checklist guarantees this, but exceeding expectations consistently starts with empathy for the person at the keyboard.

**In practice:**

- Write help, errors, and prompts as if for a capable colleague who is in a hurry; see [HELP-AND-DOCS.md](HELP-AND-DOCS.md) and [ERRORS.md](ERRORS.md).
- Make bug reporting easy: include a version, debug info, and a link or command in unexpected-error output; see [ERRORS.md](ERRORS.md).
- Protect users from irreversible mistakes with confirmations scaled to the danger; see [INTERACTIVITY.md](INTERACTIVITY.md).
- Be transparent and opt-in about telemetry and network use; see [CONFIGURATION-AND-ENV.md](CONFIGURATION-AND-ENV.md).

## Chaos

The terminal is full of inconsistencies that slow users down, yet its lack of constraints is also why so much invention has happened there. These guidelines both ask you to follow existing patterns and, in places, contradict long tradition. You may need to break rules too; when you do, do it deliberately and with a clear reason. In Jef Raskin's words, abandon a standard "when it is demonstrably harmful to productivity or user satisfaction."

**In practice:**

- Document any deliberate deviation from convention in help text or docs, with the reason; see [HELP-AND-DOCS.md](HELP-AND-DOCS.md).
- Never break a script-facing interface (flags, exit codes, `--json` output) without a deprecation path; see [FUTURE-PROOFING.md](FUTURE-PROOFING.md).
- Treat human-readable output as free to evolve, and machine output as a contract; see [OUTPUT.md](OUTPUT.md).

## Using these principles to break ties

When two rules conflict, resolve it in this order:

1. **Do not break automation or lose data.** Exit codes, stdout/stderr separation, machine-readable formats, non-interactive behavior, and safety confirmations win over convenience or polish.
2. **Detect the audience instead of choosing one.** Most human-first versus machine-readable conflicts disappear when behavior depends on context: rich output and prompts when stdin/stdout is a TTY, plain stable output and no prompts when it is not, with `--json`, `--plain`, `--no-input`, and `NO_COLOR` as explicit overrides.
3. **Default to the human, opt in to the machine.** If context detection is impossible, make the human-friendly behavior the default and provide a flag for scripts, unless the command exists mainly for scripting.
4. **Prefer convention over novelty**, unless the convention is demonstrably harmful to users (Chaos); then break it explicitly and document why.
5. **Prefer additive changes.** If a better behavior would break existing usage, add a new flag or subcommand and deprecate the old one rather than changing it in place.
6. **Prefer the simpler design.** If two options are otherwise equal, choose the one with fewer modes, flags, and special cases.
