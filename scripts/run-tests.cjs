#!/usr/bin/env node
"use strict";

// Runs test/*.test.cjs with node:test. Lists files itself so it works without shell
// globbing (cmd.exe, PowerShell) and never picks up test/fixtures, which the default
// node --test discovery would treat as tests.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = path.join(__dirname, "..", "test");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.cjs")).sort().map((f) => path.join(dir, f));
if (!files.length) {
  console.error("error: no test files found in test/");
  process.exit(1);
}
const r = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], { stdio: "inherit" });
if (r.error) {
  console.error(`error: ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
