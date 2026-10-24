#!/usr/bin/env node
"use strict";

/**
 * Runs a CLI under a small set of conventionally read-only invocations and records how it behaves.
 * Zero dependencies. Evidence for audit mode; it is NOT a sandbox (see --help).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const VERSION = "1.1.0";
const MAX_CAPTURE = 64 * 1024;
const HEAD_CHARS = 4000;
const FAST_HELP_MS = 500;

const USAGE = `Run a CLI under safe, conventionally read-only invocations and record its behavior as JSON.

Usage:
  node probe-cli.cjs [options] -- <command> [args...]

The command is spawned directly (no shell). Everything after "--" is the command prefix; probe
arguments such as --help are appended to it, so "-- python app.py" and "-- mytool sub" both work.

Options:
  -o, --out <file>      Write the JSON report to <file> and print a summary (default: JSON to stdout)
  -t, --timeout <ms>    Per-invocation timeout in milliseconds (default: 5000)
  --include <list>      Comma-separated opt-in probes: unknown-flag, no-args, help-subcommand,
                        json-error, all. json-error runs only when --help mentions --json.
                        Only include these after reading the source and confirming they cannot
                        trigger a default action with side effects.
  --pass-env <NAME>     Copy one variable from the current environment (repeatable),
                        e.g. VIRTUAL_ENV or NODE_PATH. Never pass credentials.
  --cwd <dir>           Working directory (default: a fresh, empty temporary directory)
  --no-tty              Skip pseudo-terminal probes
  -h, --help            Show this help
  --version             Show version

Safety:
  Each invocation runs with an empty environment plus a small allowlist, a temporary HOME and XDG
  directories, stdin connected to /dev/null, proxy variables pointing at a closed local port, and a
  timeout that kills the whole process group. This reduces but does not prevent side effects:
  only probe tools you trust, and never point it at commands that act without arguments.

Exit codes:
  0  probes ran (individual checks may still fail; read the report)
  1  internal error
  2  usage error

Examples:
  node probe-cli.cjs -- ./bin/mytool
  node probe-cli.cjs --out probe.json --include unknown-flag -- node dist/cli.js
`;

// Derived checks map to rule IDs present in both skills' checklists (lint enforces this).
const RULE_MAP = {
  help_flag: ["CLI-HLP-001"],
  help_short_flag: ["CLI-HLP-001", "CLI-HLP-003"],
  help_to_stdout: ["CLI-BAS-004"],
  version_flag: ["CLI-DST-004"],
  no_ansi_when_piped: ["CLI-OUT-014", "CLI-HLP-012"],
  no_color_env: ["CLI-OUT-014"],
  term_dumb: ["CLI-OUT-014"],
  no_hang_without_tty: ["CLI-INT-001", "CLI-HLP-015"],
  fast_help: ["CLI-ROB-002"],
  unknown_flag_rejected: ["CLI-BAS-002"],
  unknown_flag_error_to_stderr: ["CLI-BAS-005"],
  help_subcommand: ["CLI-HLP-004"],
  json_error: ["CLI-AGT-001"],
};

const UNKNOWN_FLAG = "--cli-skills-probe-unknown-flag";
const OPT_IN = ["unknown-flag", "no-args", "help-subcommand", "json-error"];

function usageError(msg) {
  return Object.assign(new Error(msg), { exitCode: 2 });
}

function parseArgs(argv) {
  const opts = { out: null, timeout: 5000, include: new Set(), passEnv: [], cwd: null, tty: true, command: null };
  const dd = argv.indexOf("--");
  const own = dd === -1 ? argv : argv.slice(0, dd);
  for (let i = 0; i < own.length; i++) {
    const a = own[i];
    const next = () => {
      if (own[i + 1] === undefined) throw usageError(`${a} needs a value`);
      return own[++i];
    };
    if (a === "-h" || a === "--help") return { help: true };
    if (a === "--version") return { version: true };
    if (a === "-o" || a === "--out") opts.out = next();
    else if (a === "-t" || a === "--timeout") {
      const v = Number(next());
      if (!Number.isInteger(v) || v < 100 || v > 600000) throw usageError("--timeout must be an integer between 100 and 600000");
      opts.timeout = v;
    } else if (a === "--include") {
      for (const p of next().split(",").map((s) => s.trim()).filter(Boolean)) {
        if (p === "all") OPT_IN.forEach((x) => opts.include.add(x));
        else if (OPT_IN.includes(p)) opts.include.add(p);
        else throw usageError(`unknown probe "${p}" for --include (expected ${OPT_IN.join(", ")}, all)`);
      }
    } else if (a === "--pass-env") {
      const n = next();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw usageError(`invalid environment variable name "${n}"`);
      opts.passEnv.push(n);
    } else if (a === "--cwd") opts.cwd = next();
    else if (a === "--no-tty") opts.tty = false;
    else throw usageError(`unknown option ${a}`);
  }
  if (dd === -1 || dd === argv.length - 1) throw usageError('missing command; put it after "--", e.g. -- ./mytool');
  // Probes run in a temporary directory, so anchor relative file paths in the command prefix to the caller's cwd.
  opts.command = argv.slice(dd + 1).map((a) =>
    !path.isAbsolute(a) && !a.startsWith("-") && /[\\/.]/.test(a) && fs.existsSync(a) ? path.resolve(a) : a,
  );
  return opts;
}

function makeSandboxDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-probe-"));
  const dirs = {};
  for (const d of ["home", "work", "tmp", "config", "cache", "data", "state"]) {
    dirs[d] = path.join(root, d);
    fs.mkdirSync(dirs[d]);
  }
  return { root, dirs };
}

function baseEnv(dirs, passEnv) {
  const deadProxy = "http://127.0.0.1:9";
  const env = {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: dirs.home,
    XDG_CONFIG_HOME: dirs.config,
    XDG_CACHE_HOME: dirs.cache,
    XDG_DATA_HOME: dirs.data,
    XDG_STATE_HOME: dirs.state,
    TMPDIR: dirs.tmp,
    LANG: "C.UTF-8",
    TERM: "xterm-256color",
    HTTP_PROXY: deadProxy,
    HTTPS_PROXY: deadProxy,
    ALL_PROXY: deadProxy,
    http_proxy: deadProxy,
    https_proxy: deadProxy,
    all_proxy: deadProxy,
    DO_NOT_TRACK: "1",
  };
  if (process.platform === "win32") {
    for (const k of ["SystemRoot", "windir", "COMSPEC", "PATHEXT"]) if (process.env[k]) env[k] = process.env[k];
    Object.assign(env, { USERPROFILE: dirs.home, APPDATA: dirs.config, LOCALAPPDATA: dirs.cache, TEMP: dirs.tmp, TMP: dirs.tmp });
  }
  for (const n of passEnv) if (process.env[n] !== undefined) env[n] = process.env[n];
  return env;
}

function detectPty() {
  if (process.platform === "win32") return null;
  const r = spawnSync("script", ["--version"], { encoding: "utf8", timeout: 2000 });
  if (r.error && r.error.code === "ENOENT") return null;
  if (/util-linux/.test(`${r.stdout}${r.stderr}`)) return "util-linux";
  if (["darwin", "freebsd", "openbsd", "netbsd"].includes(process.platform)) return "bsd";
  return null;
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function wrapForPty(kind, argv) {
  if (kind === "util-linux") return ["script", ["-q", "-e", "-c", argv.map(shQuote).join(" "), "/dev/null"]];
  return ["script", ["-q", "/dev/null", ...argv]];
}

// ANSI analysis: CSI sequences, plus whether any SGR sets a color (bold/underline alone are allowed by NO_COLOR).
const CSI = /\x1b\[([0-9;:?]*)([A-Za-z])/g;
const OSC = /\x1b\][^\x07\x1b]*(\x07|\x1b\\)/;

function analyzeAnsi(text) {
  let any = OSC.test(text);
  let color = false;
  for (const m of text.matchAll(CSI)) {
    any = true;
    if (m[2] !== "m") continue;
    const params = m[1].split(/[;:]/).filter((p) => p !== "").map(Number);
    for (const p of params) {
      if ((p >= 30 && p <= 38) || (p >= 40 && p <= 48) || (p >= 90 && p <= 97) || (p >= 100 && p <= 107)) color = true;
    }
  }
  return { any, color };
}

function runOnce({ argv, env, cwd, timeout }) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const out = { stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0 };
    let timedOut = false;
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } catch (e) {
      resolve({ spawn_error: e.code || e.message });
      return;
    }
    const kill = (sig) => {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      setTimeout(() => kill("SIGKILL"), 500).unref();
    }, timeout);
    for (const stream of ["stdout", "stderr"]) {
      child[stream].on("data", (chunk) => {
        const used = out[`${stream}Bytes`];
        if (used < MAX_CAPTURE) out[stream].push(chunk.subarray(0, MAX_CAPTURE - used));
        out[`${stream}Bytes`] += chunk.length;
      });
    }
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ spawn_error: e.code || e.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      kill("SIGKILL");
      const stdout = Buffer.concat(out.stdout).toString("utf8");
      const stderr = Buffer.concat(out.stderr).toString("utf8");
      resolve({
        exit_code: code,
        signal,
        timed_out: timedOut,
        duration_ms: Number((process.hrtime.bigint() - started) / 1000000n),
        stdout_bytes: out.stdoutBytes,
        stderr_bytes: out.stderrBytes,
        stdout_ansi: analyzeAnsi(stdout),
        stderr_ansi: analyzeAnsi(stderr),
        stdout_head: stdout.slice(0, HEAD_CHARS),
        stderr_head: stderr.slice(0, HEAD_CHARS),
      });
    });
  });
}

function planProbes(opts, ptyKind) {
  const probes = [
    { id: "help_long", args: ["--help"], purpose: "full help on stdout, exit 0" },
    { id: "help_short", args: ["-h"], purpose: "short help flag" },
    { id: "version", args: ["--version"], purpose: "version on stdout, exit 0" },
    { id: "help_no_color_piped", args: ["--help"], env: { NO_COLOR: "1" }, purpose: "NO_COLOR with piped output" },
  ];
  if (opts.include.has("unknown-flag")) probes.push({ id: "unknown_flag", args: [UNKNOWN_FLAG], purpose: "usage error handling" });
  if (opts.include.has("no-args")) probes.push({ id: "no_args", args: [], purpose: "behavior with no arguments and no TTY" });
  if (opts.include.has("help-subcommand")) probes.push({ id: "help_subcommand", args: ["help"], purpose: "help subcommand" });
  if (opts.include.has("json-error")) {
    probes.push({
      id: "json_error",
      args: [UNKNOWN_FLAG, "--json"],
      purpose: "usage error while machine output is requested",
      when: (done) => done.help_long && /--json\b/.test(done.help_long.stdout_head + done.help_long.stderr_head),
    });
  }
  if (opts.tty && ptyKind) {
    probes.push(
      { id: "help_tty", args: ["--help"], tty: true, purpose: "help on a terminal" },
      { id: "help_tty_no_color", args: ["--help"], tty: true, env: { NO_COLOR: "1" }, purpose: "NO_COLOR on a terminal" },
      { id: "help_tty_term_dumb", args: ["--help"], tty: true, env: { TERM: "dumb" }, purpose: "TERM=dumb on a terminal" },
    );
  }
  return probes;
}

function deriveChecks(byId, ptyKind, opts) {
  const checks = [];
  const add = (check, outcome, detail, probes) => checks.push({ check, rules: RULE_MAP[check], outcome, detail, probes });
  const ok = (p) => p && !p.spawn_error && !p.timed_out;

  const helpCheck = (check, id, flag) => {
    const p = byId[id];
    if (!ok(p)) return add(check, "fail", `${flag} did not complete (${p && (p.spawn_error || "timed out")})`, [id]);
    if (p.exit_code !== 0) return add(check, "fail", `${flag} exited ${p.exit_code}; help requested explicitly should exit 0`, [id]);
    if (p.stdout_bytes === 0 && p.stderr_bytes === 0) return add(check, "fail", `${flag} printed nothing`, [id]);
    return add(check, "pass", `${flag} exited 0 and printed help`, [id]);
  };
  helpCheck("help_flag", "help_long", "--help");
  helpCheck("help_short_flag", "help_short", "-h");

  const h = byId.help_long;
  if (ok(h)) {
    if (h.stdout_bytes > 0 && h.exit_code === 0) add("help_to_stdout", "pass", "requested help was written to stdout", ["help_long"]);
    else if (h.stderr_bytes > 0) add("help_to_stdout", "fail", "requested help went to stderr, so `--help | less` and `--help | grep` do not work", ["help_long"]);
  }

  const v = byId.version;
  if (!ok(v)) add("version_flag", "fail", `--version did not complete (${v && (v.spawn_error || "timed out")})`, ["version"]);
  else if (v.exit_code !== 0) add("version_flag", "fail", `--version exited ${v.exit_code}`, ["version"]);
  else if (!/\d+\.\d+/.test(v.stdout_head)) {
    add("version_flag", "fail", v.stderr_bytes ? "--version printed to stderr instead of stdout" : "--version printed no version number on stdout", ["version"]);
  } else add("version_flag", "pass", `--version printed "${v.stdout_head.trim().split("\n")[0].slice(0, 80)}"`, ["version"]);

  const piped = Object.values(byId).filter((p) => !p.tty && ok(p));
  const ansiPiped = piped.filter((p) => p.stdout_ansi.any);
  if (piped.length) {
    if (ansiPiped.length) add("no_ansi_when_piped", "fail", `escape sequences on stdout while it was a pipe in: ${ansiPiped.map((p) => p.id).join(", ")}`, ansiPiped.map((p) => p.id));
    else add("no_ansi_when_piped", "pass", "no escape sequences on stdout when piped", piped.map((p) => p.id));
  }

  const np = byId.help_no_color_piped;
  if (ok(np) && (np.stdout_ansi.color || np.stderr_ansi.color)) add("no_color_env", "fail", "color codes emitted with NO_COLOR=1", ["help_no_color_piped"]);

  if (ptyKind && opts.tty) {
    const t = byId.help_tty;
    const tn = byId.help_tty_no_color;
    const td = byId.help_tty_term_dumb;
    if (ok(tn)) {
      const already = checks.some((c) => c.check === "no_color_env");
      if (tn.stdout_ansi.color && !already) add("no_color_env", "fail", "color codes on a terminal with NO_COLOR=1", ["help_tty_no_color"]);
      else if (!tn.stdout_ansi.color && !already) {
        add("no_color_env", ok(t) && t.stdout_ansi.color ? "pass" : "inconclusive",
          ok(t) && t.stdout_ansi.color ? "colors on a terminal, none with NO_COLOR=1" : "tool printed no color on a terminal, so NO_COLOR handling is unobservable here",
          ["help_tty", "help_tty_no_color"]);
      }
    }
    if (ok(td)) {
      if (td.stdout_ansi.color) add("term_dumb", "fail", "color codes on a terminal with TERM=dumb", ["help_tty_term_dumb"]);
      else add("term_dumb", ok(t) && t.stdout_ansi.color ? "pass" : "inconclusive", "no color with TERM=dumb", ["help_tty_term_dumb"]);
    }
  }

  const hung = Object.values(byId).filter((p) => p.timed_out);
  if (hung.length) add("no_hang_without_tty", "fail", `timed out with stdin at EOF (possibly prompting or waiting for input): ${hung.map((p) => p.id).join(", ")}`, hung.map((p) => p.id));
  else add("no_hang_without_tty", "pass", "every invocation finished with stdin at EOF", Object.keys(byId));

  if (ok(h)) {
    add("fast_help", h.duration_ms <= FAST_HELP_MS ? "pass" : "inconclusive",
      `--help took ${h.duration_ms} ms (single cold run; rerun to confirm slow startup)`, ["help_long"]);
  }

  const u = byId.unknown_flag;
  if (u && ok(u)) {
    add("unknown_flag_rejected", u.exit_code !== 0 ? "pass" : "fail",
      u.exit_code !== 0 ? `unknown flag rejected with exit ${u.exit_code}` : "unknown flag was accepted and exited 0", ["unknown_flag"]);
    const clean = u.stderr_bytes > 0 && u.stdout_bytes === 0;
    add("unknown_flag_error_to_stderr", clean ? "pass" : "fail",
      clean ? "usage error went to stderr with stdout empty" : `usage error output: stdout ${u.stdout_bytes} bytes, stderr ${u.stderr_bytes} bytes`, ["unknown_flag"]);
  }

  const hs = byId.help_subcommand;
  if (hs && ok(hs)) {
    const strip = (t) => t.replace(CSI, "").trim();
    const looksLikeHelp = ok(h) && h.stdout_bytes > 0 && strip(hs.stdout_head) === strip(h.stdout_head);
    if (hs.exit_code === 0 && (looksLikeHelp || /usage/i.test(hs.stdout_head))) {
      add("help_subcommand", "pass", "`help` printed help and exited 0", ["help_subcommand", "help_long"]);
    } else {
      add("help_subcommand", "inconclusive",
        `\`help\` exited ${hs.exit_code} without output matching --help (tool may not use subcommands)`, ["help_subcommand"]);
    }
  }
  const je = byId.json_error;
  if (opts.include.has("json-error")) {
    if (!je) add("json_error", "inconclusive", "--help does not mention --json, so the JSON error probe was skipped", ["help_long"]);
    else if (ok(je)) {
      const parses = (s) => {
        try {
          const v = JSON.parse(s);
          return v !== null && typeof v === "object";
        } catch {
          return false;
        }
      };
      const out = je.stdout_head.trim();
      const problems = [];
      if (je.exit_code === 0) problems.push("exited 0");
      if (out && !parses(out)) problems.push("stdout is not valid JSON");
      if (!parses(je.stderr_head.trim())) problems.push("stderr is not a JSON object");
      add("json_error", problems.length ? "fail" : "pass",
        problems.length ? `usage error with --json: ${problems.join("; ")}` : `usage error with --json wrote a JSON object to stderr and exited ${je.exit_code}`,
        ["json_error"]);
    }
  }
  return checks;
}

async function probe(opts) {
  const ptyKind = opts.tty ? detectPty() : null;
  const { root, dirs } = makeSandboxDirs();
  const cwd = opts.cwd ? path.resolve(opts.cwd) : dirs.work;
  const env = baseEnv(dirs, opts.passEnv);
  const results = [];
  try {
    for (const p of planProbes(opts, ptyKind)) {
      if (p.when && !p.when(Object.fromEntries(results.map((r) => [r.id, r])))) continue;
      const argv = [...opts.command, ...p.args];
      const [cmd, args] = p.tty ? wrapForPty(ptyKind, argv) : [argv[0], argv.slice(1)];
      const r = await runOnce({ argv: [cmd, ...args], env: { ...env, ...(p.env || {}) }, cwd, timeout: opts.timeout });
      results.push({ id: p.id, purpose: p.purpose, argv, tty: Boolean(p.tty), env_overrides: p.env || {}, ...r });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  return {
    probe_version: 1,
    tool: `probe-cli ${VERSION}`,
    command: opts.command,
    generated_at: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    pty: ptyKind ? `script(1) ${ptyKind}` : null,
    env_policy: {
      allowlisted: Object.keys(env).sort(),
      note: "temporary HOME/XDG dirs, proxies pointed at 127.0.0.1:9, stdin at EOF; not an OS sandbox",
    },
    timeout_ms: opts.timeout,
    probes: results,
    checks: deriveChecks(byId, ptyKind, opts),
  };
}

function summaryText(report) {
  const lines = [`probed: ${report.command.join(" ")}`];
  for (const c of report.checks) lines.push(`${c.outcome.padEnd(12)} ${c.check.padEnd(28)} ${c.detail}`);
  if (!report.pty) lines.push("note: no pseudo-terminal available; terminal-only checks skipped");
  return lines.join("\n") + "\n";
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\nRun with --help for usage.\n`);
    return e.exitCode || 2;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (opts.version) {
    process.stdout.write(`probe-cli ${VERSION}\n`);
    return 0;
  }
  try {
    const report = await probe(opts);
    const json = JSON.stringify(report, null, 2) + "\n";
    if (opts.out) {
      fs.writeFileSync(opts.out, json);
      process.stdout.write(summaryText(report));
    } else process.stdout.write(json);
    return 0;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return 1;
  }
}

module.exports = { RULE_MAP, analyzeAnsi, parseArgs, probe, deriveChecks };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
