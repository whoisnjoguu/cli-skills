# Language stacks

Load this file in build mode to pick an implementation language and libraries, then scaffold a tool that is well-behaved from the first commit.
It contains no rules; the libraries below are chosen because they make the rules in the other files cheap to follow.

## Choosing a language

| Situation | Pick | Why |
| --- | --- | --- |
| Single static binary, fast startup, easy cross-compilation | Go | `GOOS`/`GOARCH` cross-builds, ~10 ms startup, mature CLI ecosystem (cobra, goreleaser) |
| Single static binary, maximum performance or safety, rich typed parsing | Rust | clap derive gives help, completions and man pages from one struct; startup in single-digit ms |
| Scripting, data processing, glue around Python libraries, internal tools | Python | Fastest to write; best data/ML ecosystem; distribute with `pipx` or `uv tool install` |
| JS/TS ecosystem, npm distribution, tooling for web projects | TypeScript on Node | Users already have Node/npm; `npx` zero-install runs |
| JS/TS but a self-contained binary is wanted | Bun (`bun build --compile`) or Deno (`deno compile`) | Ships one executable with the runtime embedded (tens of MB) |
| Tool already lives inside a project's language | That language | Contributors can maintain it; shared code and types |

Startup-time caveats:

- Python: interpreter start is ~20–50 ms, but heavy imports (pandas, requests, rich) can push `--help` past 300 ms. Import heavy modules inside the subcommand that needs them, and measure with `python -X importtime -m mytool --help 2> imports.txt`.
- Node: runtime start is ~40–80 ms; large dependency trees add more. Lazy-load subcommand modules with dynamic `import()`, bundle with esbuild/tsup to cut module resolution, and avoid work at module top level.
- Shell completion and prompts call the tool repeatedly; anything over ~100 ms per call feels laggy. Prefer Go or Rust when the tool is invoked in tight loops or from completion scripts.
- Go and Rust binaries need no runtime on the target machine; Python and Node tools require a compatible interpreter unless bundled.

## Go

| Concern | Recommended |
| --- | --- |
| Argument parsing and subcommands | `github.com/spf13/cobra` (uses `spf13/pflag` for GNU-style flags); alternatives `github.com/urfave/cli/v2`/`v3`, `github.com/alecthomas/kong` (struct tags) |
| Help, completions, man pages | cobra generates help and a `completion` subcommand (bash, zsh, fish, PowerShell); `github.com/spf13/cobra/doc` for man pages and Markdown |
| Color and TTY detection | `golang.org/x/term` (`term.IsTerminal`), `github.com/mattn/go-isatty` (also detects Cygwin/MSYS terminals); styling with `github.com/fatih/color` or `github.com/charmbracelet/lipgloss` |
| NO_COLOR handling | `fatih/color` honors `NO_COLOR` and disables itself when stdout is not a TTY; lipgloss (via termenv) degrades to no color; still check `TERM=dumb` and a `--no-color` flag yourself |
| Progress and spinners | `github.com/schollz/progressbar/v3`, `github.com/briandowns/spinner`; `github.com/charmbracelet/bubbles` inside Bubble Tea apps |
| Prompts | `github.com/charmbracelet/huh` (forms, confirm, select); gate on TTY and `--no-input` |
| Config files | `github.com/spf13/viper` (integrates with cobra flags and env) or `github.com/knadh/koanf` (lighter, composable); locate with `os.UserConfigDir()` |
| Structured output | `encoding/json` (`json.NewEncoder(os.Stdout)`), `text/tabwriter` for aligned human tables |
| Logging to stderr | `log/slog` with `slog.NewTextHandler(os.Stderr, nil)` |
| Testing | `os/exec` against the built binary, `github.com/rogpeppe/go-internal/testscript`, golden files under `testdata/` |
| Packaging and release | GoReleaser (cross-builds, archives, checksums, Homebrew/Scoop/nfpm packages); `go install module@version` |

Minimal skeleton (`go get github.com/spf13/cobra golang.org/x/term`):

```go
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

var version = "dev" // set with -ldflags "-X main.version=1.2.3"

func main() {
	var asJSON bool
	root := &cobra.Command{
		Use: "mytool [name]", Short: "Greet someone", Version: version,
		Args: cobra.MaximumNArgs(1), SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			name := "world"
			if len(args) == 1 {
				name = args[0]
			}
			if asJSON {
				return json.NewEncoder(os.Stdout).Encode(map[string]string{"greeting": "hello " + name})
			}
			format := "hello %s\n"
			if term.IsTerminal(int(os.Stdout.Fd())) && os.Getenv("NO_COLOR") == "" && os.Getenv("TERM") != "dumb" {
				format = "\x1b[1mhello %s\x1b[0m\n"
			}
			_, err := fmt.Printf(format, name)
			return err
		},
	}
	root.Flags().BoolVar(&asJSON, "json", false, "print machine-readable JSON")
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "mytool:", err)
		os.Exit(1)
	}
}
```

## Rust

| Concern | Recommended |
| --- | --- |
| Argument parsing and subcommands | `clap` with the `derive` feature (`#[derive(Parser, Subcommand)]`); `argh` or `lexopt` when binary size matters |
| Help, completions, man pages | clap generates help; `clap_complete` for shell completions; `clap_mangen` for man pages (usually from `build.rs` or an `xtask`) |
| Color and TTY detection | `std::io::IsTerminal` (stable since 1.70); styling with `anstyle` + `anstream` (what clap uses) or `owo-colors` |
| NO_COLOR handling | `anstream` strips styles automatically when `NO_COLOR` is set, `TERM=dumb`, or the stream is not a terminal; `owo-colors` with the `supports-colors` feature (`if_supports_color`) |
| Progress and spinners | `indicatif` (draws to stderr, hides itself when not a terminal) |
| Prompts | `dialoguer` or `inquire`; gate on `stdin().is_terminal()` and `--no-input` |
| Config files | `serde` + `toml`; locate with `directories` (`ProjectDirs`) or `etcetera` (XDG on all platforms); layered config with `figment` or `config` |
| Structured output | `serde` + `serde_json` (`serde_json::to_writer(stdout, &value)`) |
| Logging to stderr | `tracing` + `tracing-subscriber` (`.with_writer(std::io::stderr)`), or `log` + `env_logger` (stderr by default) |
| Testing | `assert_cmd` + `predicates` for process-level tests; `trycmd`/`snapbox` for file-driven CLI snapshots; `insta` for snapshots |
| Packaging and release | `dist` (formerly cargo-dist) for installers and GitHub releases; `cargo install`; `cargo-binstall` metadata |

Minimal skeleton (`cargo add clap --features derive` and `cargo add serde_json`):

```rust
use clap::Parser;
use std::io::{self, IsTerminal, Write};
use std::process::ExitCode;

/// Greet someone.
#[derive(Parser)]
#[command(version, about)]
struct Cli {
    #[arg(default_value = "world", help = "Name to greet")]
    name: String,
    /// Print machine-readable JSON
    #[arg(long)]
    json: bool,
}

fn run(cli: &Cli) -> io::Result<()> {
    let mut out = io::stdout().lock();
    if cli.json {
        return writeln!(out, "{}", serde_json::json!({ "greeting": format!("hello {}", cli.name) }));
    }
    let color = io::stdout().is_terminal()
        && std::env::var_os("NO_COLOR").map_or(true, |v| v.is_empty())
        && std::env::var("TERM").map_or(true, |t| t != "dumb");
    if color {
        writeln!(out, "\x1b[1mhello {}\x1b[0m", cli.name)
    } else {
        writeln!(out, "hello {}", cli.name)
    }
}

fn main() -> ExitCode {
    let cli = Cli::parse(); // --help/--version exit 0; usage errors print to stderr and exit 2
    match run(&cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("mytool: {e}");
            ExitCode::FAILURE
        }
    }
}
```

## Python

| Concern | Recommended |
| --- | --- |
| Argument parsing and subcommands | `argparse` (stdlib, zero dependencies, `add_subparsers`); `click` (decorators, composable groups); `typer` (type hints on top of click) |
| Help, completions, man pages | argparse help is built in, completions via `argcomplete` or `shtab`; click and typer ship shell completion (`typer` adds `--install-completion`) |
| Color and TTY detection | `sys.stdout.isatty()`; `rich` (`Console` detects terminals and width); `click.style`/`click.echo` strip ANSI when not a TTY |
| NO_COLOR handling | `rich` honors `NO_COLOR` and `TERM=dumb`; with plain ANSI check `os.environ.get("NO_COLOR")` yourself |
| Progress and spinners | `rich.progress`, `rich.status` (spinner), or `tqdm` (writes to stderr) |
| Prompts | `questionary`, `rich.prompt`, `click.prompt`/`click.confirm`; gate on `sys.stdin.isatty()` and `--no-input` |
| Config files | `tomllib` (stdlib, Python 3.11+, read-only) or `tomli`; locate with `platformdirs` (`user_config_dir`) |
| Structured output | `json` (stdlib); `pydantic` or `dataclasses` + `json` for stable schemas |
| Logging to stderr | `logging` (`StreamHandler` defaults to stderr); `rich.logging.RichHandler` for human output |
| Testing | `pytest` + `click.testing.CliRunner` / `typer.testing.CliRunner`; `subprocess.run` against the installed entry point |
| Packaging and release | `[project.scripts]` entry point in `pyproject.toml`; users install with `pipx install` or `uv tool install`; PyInstaller or Nuitka for standalone binaries |

Keep `--help` fast: import heavy libraries inside the function that needs them, not at module top level.

Minimal skeleton (stdlib only; expose as `mytool = "mytool.cli:main"` under `[project.scripts]`):

```python
import argparse, json, os, sys

__version__ = "0.1.0"

def use_color(stream) -> bool:
    return stream.isatty() and not os.environ.get("NO_COLOR") and os.environ.get("TERM") != "dumb"

def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="mytool", description="Greet someone.")
    p.add_argument("name", nargs="?", default="world", help="name to greet")
    p.add_argument("--json", action="store_true", help="print machine-readable JSON")
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    args = p.parse_args(argv)  # usage errors go to stderr with exit 2
    try:
        if args.json:
            print(json.dumps({"greeting": f"hello {args.name}"}))
        elif use_color(sys.stdout):
            print(f"\033[1mhello {args.name}\033[0m")
        else:
            print(f"hello {args.name}")
    except KeyboardInterrupt:
        return 130
    except OSError as e:
        print(f"mytool: {e}", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

## TypeScript/Node

| Concern | Recommended |
| --- | --- |
| Argument parsing and subcommands | `commander` (small, popular); `yargs` (rich validation); `oclif` (framework for large multi-command CLIs with plugins); `citty` or `clipanion` (typed, lightweight); `node:util` `parseArgs` for tiny tools |
| Help, completions, man pages | All of the above generate help; `yargs` has `.completion()`; oclif has `@oclif/plugin-autocomplete`; commander needs a third-party or hand-written completion script |
| Color and TTY detection | `process.stdout.isTTY`, `stream.hasColors()`; styling with `picocolors` (tiny) or `chalk`; `util.styleText` in recent Node versions |
| NO_COLOR handling | `picocolors` and Node's `hasColors()`/`getColorDepth()` honor `NO_COLOR`, `FORCE_COLOR` and `TERM=dumb`; with chalk, test `NO_COLOR=1` explicitly rather than assuming |
| Progress and spinners | `ora` (spinners, stays quiet when not a TTY), `cli-progress` |
| Prompts | `@inquirer/prompts` or `@clack/prompts`; gate on `process.stdin.isTTY` and `--no-input` |
| Config files | `env-paths` for OS-correct config/cache dirs; `cosmiconfig` or `lilconfig` for project-level config discovery |
| Structured output | `JSON.stringify` to stdout; validate shapes with `zod` |
| Logging to stderr | `console.error`; `pino` with `pino.destination(2)` for structured logs |
| Testing | `vitest` (snapshots) + `execa` to run the built CLI as a subprocess |
| Packaging and release | `"bin"` in `package.json` (users run `npm i -g` or `npx`); single binaries via `bun build --compile`, `deno compile`, or Node single executable applications; `pkg` (vercel) is archived, avoid it for new tools |

Minimal skeleton (`npm i commander`; ESM, so `"type": "module"` in `package.json`):

```ts
#!/usr/bin/env node
import { Command } from "commander";

const useColor = (s: NodeJS.WriteStream): boolean =>
  Boolean(s.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const program = new Command()
  .name("mytool")
  .description("Greet someone")
  .version("0.1.0")
  .argument("[name]", "name to greet", "world")
  .option("--json", "print machine-readable JSON")
  .action((name: string, opts: { json?: boolean }) => {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ greeting: `hello ${name}` }) + "\n");
    } else if (useColor(process.stdout)) {
      process.stdout.write(`\x1b[1mhello ${name}\x1b[0m\n`);
    } else {
      process.stdout.write(`hello ${name}\n`);
    }
  });

try {
  await program.parseAsync(process.argv); // usage errors print to stderr and exit 1
} catch (err) {
  console.error(`mytool: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
```
