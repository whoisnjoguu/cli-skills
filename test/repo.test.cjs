"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseFile, githubSlug } = require("../scripts/build-checklist.cjs");

const ROOT = path.join(__dirname, "..");
const run = (script, ...args) => spawnSync(process.execPath, [path.join(ROOT, "scripts", script), ...args], { encoding: "utf8" });

test("repository lint passes", () => {
  const r = run("lint-skills.cjs");
  assert.equal(r.status, 0, r.stderr);
});

test("checklists are up to date", () => {
  const r = run("build-checklist.cjs", "--check");
  assert.equal(r.status, 0, r.stderr);
});

test("githubSlug matches GitHub heading anchors", () => {
  assert.equal(githubSlug("CLI-OUT-014: Disable color when not on a terminal or when the user asks"), "cli-out-014-disable-color-when-not-on-a-terminal-or-when-the-user-asks");
  assert.equal(githubSlug("CLI-HLP-001: Show full help for -h and --help, including on subcommands"), "cli-hlp-001-show-full-help-for--h-and---help-including-on-subcommands");
  assert.equal(githubSlug("TUI-CLR-003: Honor NO_COLOR in the UI"), "tui-clr-003-honor-no_color-in-the-ui");
});

test("parseFile reports malformed rules", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-"));
  const f = path.join(dir, "X.md");
  fs.writeFileSync(f, [
    "# X", "", "## Rules", "",
    "### CLI-ABC-001: Good rule", "", "- **Level:** must", "- **Severity:** high", "- **Check:** static, probe", "- **Source:** <https://clig.dev/#output>", "", "Body.", "", "**Verify:** Run it.", "",
    "### CLI-ABC-002: Bad rule", "", "- **Level:** always", "- **Severity:** high", "- **Check:** vibes", "", "No verify.", "",
    "### CLI-ABC-3: Wrong number", "",
    "```", "### CLI-ABC-004: Inside a fence is ignored", "```", "",
  ].join("\n"));
  const { rules, errors } = parseFile(f);
  assert.deepEqual(rules.map((r) => r.id), ["CLI-ABC-001", "CLI-ABC-002"]);
  assert.deepEqual(rules[0].check, ["static", "probe"]);
  assert.equal(rules[0].source, "https://clig.dev/#output");
  assert.equal(rules[0].anchor, "X.md#cli-abc-001-good-rule");
  const text = errors.join("\n");
  for (const re of [/level must be/, /unknown check method "vibes"/, /missing "- \*\*Source:\*\*"/, /Verify/, /malformed rule heading/]) assert.match(text, re);
  fs.rmSync(dir, { recursive: true, force: true });
});
