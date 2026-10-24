#!/usr/bin/env node
"use strict";
// A badly behaved CLI used as a probe fixture: always colors, help on stderr with exit 1,
// no version flag, accepts unknown flags, and waits for input when run without arguments.
const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  process.stderr.write("\x1b[31mbad-cli\x1b[0m usage: bad-cli <thing>\n");
  process.exit(1);
}
if (args.length === 0) {
  setInterval(() => {}, 1000);
  return;
}
process.stdout.write(`\x1b[32mdid ${args.join(" ")}\x1b[0m\n`);
