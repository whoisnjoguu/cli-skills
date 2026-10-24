# Naming, distribution, and analytics

How to name a CLI command, package and ship it so it installs, upgrades, and uninstalls cleanly, and how to handle usage metrics and telemetry without violating user trust. Load this when choosing a command name, setting up release and packaging, or adding any network reporting of usage or crashes.

Adapted from the [Command Line Interface Guidelines](https://clig.dev) (CC BY-SA 4.0).

## Release checklist

| Artifact | Purpose | Rule |
| --- | --- | --- |
| Single static binary per OS/arch | Install by copying one file | CLI-DST-001 |
| Native packages (Homebrew, deb/rpm, winget/scoop) or language registry | Install, upgrade, uninstall with familiar tools | CLI-DST-002, CLI-DST-005 |
| Uninstall instructions next to install instructions | Clean removal | CLI-DST-003 |
| `--version` with commit and build date | Bug reports, support | CLI-DST-004 |
| `SHA256SUMS` plus signature or provenance | Integrity and authenticity | CLI-DST-006 |
| Shell completions for bash, zsh, fish, PowerShell | Discoverability, typing speed | CLI-DST-007 |
| Man page or offline help installed with the package | Docs without network | CLI-DST-008 |

## Naming

### CLI-NAM-001: Choose a simple, memorable, distinctive word

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#naming>

Users type the name constantly, so it should be one easy-to-remember word. Avoid generic words that other tools already use or that collide with OS commands; ImageMagick and Windows both shipping `convert` is the classic clash. Before committing, check `command -v <name>`, common package registries (Homebrew, Debian, npm, PyPI, crates.io), and shell builtins.

**Verify:** Run `command -v <name>; type <name>` on a typical Linux, macOS, and Windows install and search major package indexes; any existing command or package with that name is a finding.

### CLI-NAM-002: Use only lowercase letters, with dashes only when necessary

- **Level:** should
- **Severity:** low
- **Check:** static
- **Source:** <https://clig.dev/#naming>

Command names should be lowercase; avoid capitals, underscores, and camelCase (`curl`, not `DownloadURL`). Use a dash only if a single word will not work. Case-insensitive filesystems on macOS and Windows make mixed-case names behave inconsistently.

**Verify:** Check the binary name in build config (`go build -o`, `[[bin]]` in `Cargo.toml`, `bin` in `package.json`, `[project.scripts]` in `pyproject.toml`) matches `^[a-z][a-z0-9-]*$`.

### CLI-NAM-003: Keep the name short but not reserved-utility short

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** <https://clig.dev/#naming>

Shorter names are faster to type, but one- and two-letter names belong to ubiquitous utilities (`cd`, `ls`, `ps`) and are likely to clash. Aim for roughly 3 to 8 characters. If the canonical name is long, do not rely on users creating aliases; pick a shorter name.

**Verify:** Count characters in the binary name: two or fewer, or more than about 12, needs justification.

### CLI-NAM-004: Make the name easy to type

- **Level:** consider
- **Severity:** info
- **Check:** manual
- **Source:** <https://clig.dev/#naming>

Prefer names whose letters flow across both hands and avoid awkward reaches or same-finger sequences. Docker Compose was briefly `plum`, an awkward one-handed sequence, and was renamed `fig` almost immediately.

**Verify:** Type the name several times on a QWERTY keyboard; awkward stretches, repeated same-finger keys, or frequent typos are findings.

## Distribution

### CLI-DST-001: Distribute as a single self-contained binary where possible

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://clig.dev/#distribution>

A single executable with no runtime dependencies is the easiest thing to install, move, and remove. Compiled languages (Go, Rust) do this natively; for interpreted languages consider bundlers such as PyInstaller, `bun build --compile`, or Node single-executable applications. Exception: tools tied to a language ecosystem (linters, formatters, test runners) can assume that language's runtime and ship through its registry.

**Verify:** Inspect release artifacts: each OS/arch should have one executable (optionally in an archive) that runs on a clean machine, e.g. `ldd ./mytool` shows static or only libc. Language-specific tools are exempt.

### CLI-DST-002: Use the platform package manager when a single binary is not possible

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#distribution>

If the tool needs multiple files (runtime, data, plugins), install it via the platform's native installer so every file is tracked and removable. Do not scatter files across the disk with a custom script that cannot undo itself. Tread lightly on the user's machine.

**Verify:** Install via the documented method on a clean system, then list files written outside the package manager's records (e.g. compare filesystem before and after); untracked files are findings.

### CLI-DST-003: Make uninstall easy and document it beside install instructions

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#distribution>

People often want to remove software right after trying it. If uninstalling takes more than the package manager's remove command, put the steps at the end of the install instructions, including where config, cache, and data live and how to remove shell integration lines.

**Verify:** Open the install docs and confirm an uninstall section follows them; follow it on a test machine and confirm no binaries, services, PATH edits, or shell rc blocks remain.

### CLI-DST-004: Provide --version output that includes build information

- **Level:** must
- **Severity:** medium
- **Check:** probe
- **Source:** original

`mytool --version` must print the version and exit 0 without network access or config. Include the semantic version and, ideally, the commit hash, build date, and target OS/arch so bug reports are actionable. Keep the first line stable and parseable (`mytool 1.4.2`); put extra detail after it or behind `version --verbose`/`--json`.

```
$ mytool --version
mytool 1.4.2 (a1b2c3d 2026-10-20, linux/amd64)
```

**Verify:** Run `mytool --version; echo $?` with networking disabled and an empty `HOME`; expect a version string, a commit or build identifier, and exit status 0.

### CLI-DST-005: Publish through the package managers your users already use

- **Level:** should
- **Severity:** low
- **Check:** manual
- **Source:** original

Beyond direct downloads, publish to native channels: Homebrew (macOS/Linux), deb/rpm repositories or distro packages, winget and/or Scoop (Windows), and the language registry (cargo, pip/pipx, npm, `go install`) when the audience is that ecosystem. This gives users updates and uninstall for free. Avoid `curl | sh` as the only install path.

**Verify:** Check the install docs list at least one native package manager per supported OS, and that `brew install`/`winget install`/etc. actually resolve to the current release.

### CLI-DST-006: Publish checksums and signatures for release artifacts

- **Level:** should
- **Severity:** high
- **Check:** probe
- **Source:** original

Every release must ship a checksum file (e.g. `SHA256SUMS`) covering all artifacts, and the checksums or artifacts should be signed (Sigstore/cosign, minisign, or GPG) or carry build provenance (SLSA, GitHub artifact attestations). Document how to verify. Any install script must verify checksums before executing what it downloads.

**Verify:** Download a release and run `sha256sum -c SHA256SUMS --ignore-missing`, then verify the signature using the documented command (e.g. `cosign verify-blob` or `gh attestation verify`). Missing checksums or verification steps are findings.

### CLI-DST-007: Ship shell completions for bash, zsh, fish, and PowerShell

- **Level:** should
- **Severity:** low
- **Check:** probe
- **Source:** original

Provide tab completion for subcommands, flags, and where practical dynamic values. Generate scripts with a `completion <shell>` subcommand (most frameworks do this: cobra, clap_complete, click, oclif) and install them automatically through packages (Homebrew and deb/rpm have standard completion directories).

**Verify:** Run `mytool completion bash | head`, `mytool completion zsh | head`, `mytool completion fish | head`, and `mytool completion powershell | head`; each should print a non-empty script and exit 0.

### CLI-DST-008: Install a man page or offline help with the package

- **Level:** consider
- **Severity:** info
- **Check:** probe
- **Source:** original

Docs should be available without a network connection. Install a man page (`man mytool`, generated from the same source as `--help`) on Unix packages, or provide a `mytool help <topic>` command that renders full documentation locally.

**Verify:** After a package install, run `man mytool | head` or `mytool help | cat`; expect full documentation without network access.

## Analytics and telemetry

### CLI-ANL-001: Do not send usage or crash data without consent

- **Level:** must
- **Severity:** high
- **Check:** static, probe
- **Source:** <https://clig.dev/#analytics>

CLI users expect full control of their environment; background network reporting that they did not agree to destroys trust. No analytics, crash reports, or "phone home" pings may be sent until the user has consented (opt-in) or been clearly informed under an opt-out scheme (CLI-ANL-003). Update checks that send identifying data count as telemetry.

**Verify:** On a fresh install with an empty config, run several commands under a network monitor (e.g. `strace -f -e trace=connect mytool --help` or a proxy with `HTTPS_PROXY`) and confirm no telemetry hosts are contacted before consent is recorded. Grep source for analytics SDKs and endpoints.

### CLI-ANL-002: Prefer explicit opt-in for telemetry

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://clig.dev/#analytics>

Ask users whether they want to share data, defaulting to no. Ask only in interactive sessions; in non-interactive runs (no TTY, `CI` set) treat the answer as no and do not prompt. Store the answer in user config and provide `mytool telemetry enable|disable|status`.

**Verify:** Run the first command with stdin not a TTY (`mytool list < /dev/null | cat`) and confirm no prompt appears and nothing is sent; in a TTY confirm the prompt defaults to no.

### CLI-ANL-003: If telemetry is on by default, announce it and make disabling easy

- **Level:** must
- **Severity:** high
- **Check:** probe, manual
- **Source:** <https://clig.dev/#analytics>

An opt-out scheme requires a clear notice on first run (on stderr) and on the website, before any data is sent, and a one-step way to turn it off: a command, a config key, and an env var (`MYTOOL_TELEMETRY=0`). Also honor `DO_NOT_TRACK=1`, the de facto cross-tool convention, as a full opt-out.

```go
func telemetryEnabled(cfg Config) bool {
    if v := os.Getenv("DO_NOT_TRACK"); v != "" && v != "0" {
        return false
    }
    if os.Getenv("MYTOOL_TELEMETRY") == "0" {
        return false
    }
    return cfg.Telemetry.Enabled
}
```

**Verify:** On a fresh install, run `mytool list` and confirm a telemetry notice on stderr before any network call. Then run `DO_NOT_TRACK=1 mytool list` and `MYTOOL_TELEMETRY=0 mytool list` under a network monitor and confirm nothing is sent.

### CLI-ANL-004: Disclose exactly what is collected, why, and for how long

- **Level:** must
- **Severity:** medium
- **Check:** manual
- **Source:** <https://clig.dev/#analytics>

Publish a telemetry page linked from help and the first-run notice that states which fields are collected, the purpose, how data is anonymized and how anonymous it really is, and the retention period. Never collect arguments, file paths, environment contents, or other potentially sensitive values. Homebrew's analytics FAQ and Next.js's telemetry page are good models. Consider a `--debug-telemetry` or `telemetry status` mode that prints the payload instead of sending it.

**Verify:** Locate the disclosure page from `mytool --help` or the notice; check it covers fields, purpose, anonymization, and retention, and compare it against the payload built in source.

### CLI-ANL-005: Consider alternatives to collecting analytics

- **Level:** consider
- **Severity:** info
- **Check:** manual
- **Source:** <https://clig.dev/#analytics>

Often you can learn enough without in-tool telemetry: instrument web docs (track which use-case pages are read and what people search for), instrument downloads (rough volume and OS mix), and talk to users directly (invite feedback and feature requests in docs and repos, and ask follow-up questions for context).

**Verify:** Review whether the project already uses docs analytics, download statistics, or user feedback channels before adding telemetry; if telemetry exists, its stated purpose should not be answerable by those sources alone.
