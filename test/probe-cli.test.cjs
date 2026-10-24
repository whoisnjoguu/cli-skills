"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const PROBE = path.join(__dirname, "..", "skills", "cli-rules", "probe-cli.cjs");
const { analyzeAnsi, parseArgs, probe } = require(PROBE);
const fixture = (name) => [process.execPath, path.join(__dirname, "fixtures", name)];
const outcome = (report, check) => report.checks.filter((c) => c.check === check).map((c) => c.outcome);

test("analyzeAnsi separates color from other escapes", () => {
  assert.deepEqual(analyzeAnsi("plain"), { any: false, color: false });
  assert.deepEqual(analyzeAnsi("\x1b[1mbold\x1b[0m"), { any: true, color: false });
  assert.deepEqual(analyzeAnsi("\x1b[31mred\x1b[0m"), { any: true, color: true });
  assert.deepEqual(analyzeAnsi("\x1b[38;5;200mx"), { any: true, color: true });
  assert.deepEqual(analyzeAnsi("\x1b[2J"), { any: true, color: false });
  assert.equal(analyzeAnsi("\x1b]8;;https://x\x1b\\link").any, true);
});

test("parseArgs validates options", () => {
  assert.throws(() => parseArgs(["--timeout", "500"]), /missing command/);
  assert.throws(() => parseArgs(["--timeout", "abc", "--", "x"]), /--timeout/);
  assert.throws(() => parseArgs(["--include", "rm-rf", "--", "x"]), /unknown probe/);
  assert.throws(() => parseArgs(["--pass-env", "A=B", "--", "x"]), /invalid environment/);
  const o = parseArgs(["--include", "all", "--no-tty", "--", "tool", "sub"]);
  assert.deepEqual([...o.include].sort(), ["help-subcommand", "no-args", "unknown-flag"]);
  assert.equal(o.tty, false);
  assert.deepEqual(o.command, ["tool", "sub"]);
});

test("a well-behaved CLI passes every check", async () => {
  const report = await probe({ ...parseArgs(["--include", "all", "--", ...fixture("good-cli.cjs")]) });
  const failing = report.checks.filter((c) => c.outcome === "fail");
  assert.deepEqual(failing, []);
  for (const c of ["help_flag", "help_short_flag", "help_to_stdout", "version_flag", "no_ansi_when_piped", "unknown_flag_rejected", "unknown_flag_error_to_stderr", "help_subcommand", "no_hang_without_tty"]) {
    assert.deepEqual(outcome(report, c), ["pass"], c);
  }
  for (const c of report.checks) assert.ok(c.rules.length > 0, c.check);
});

test("a badly behaved CLI fails the expected checks", async () => {
  const report = await probe({ ...parseArgs(["--include", "all", "--timeout", "1500", "--", ...fixture("bad-cli.cjs")]) });
  for (const c of ["help_flag", "help_short_flag", "help_to_stdout", "version_flag", "no_ansi_when_piped", "no_color_env", "no_hang_without_tty", "unknown_flag_rejected", "unknown_flag_error_to_stderr"]) {
    assert.deepEqual(outcome(report, c), ["fail"], c);
  }
  assert.equal(report.probes.find((p) => p.id === "no_args").timed_out, true);
});

test("probes run in an isolated environment", async () => {
  const report = await probe({ ...parseArgs(["--no-tty", "--", ...fixture("good-cli.cjs")]) });
  const allow = report.env_policy.allowlisted;
  assert.ok(allow.includes("HOME") && allow.includes("HTTPS_PROXY"));
  assert.ok(!allow.includes("USER") && !allow.includes("SSH_AUTH_SOCK"));
  assert.equal(report.pty, null);
  assert.ok(!report.probes.some((p) => p.tty));
});

test("command line: help, usage errors, report to file", () => {
  const node = (...a) => spawnSync(process.execPath, [PROBE, ...a], { encoding: "utf8" });
  let r = node("--help");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  r = node();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /missing command/);
  assert.equal(r.stdout, "");
  r = node("--no-tty", "--", ...fixture("good-cli.cjs"));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).probe_version, 1);
});
