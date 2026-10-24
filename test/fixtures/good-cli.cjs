#!/usr/bin/env node
"use strict";
// A small, well-behaved CLI used as a probe fixture.
const args = process.argv.slice(2);
const color = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";
const bold = (s) => (color ? `\x1b[1;36m${s}\x1b[0m` : s);
const help = `${bold("good-cli")} - greet people

Usage:
  good-cli [--json] <name>

Options:
  --json        Output JSON
  -h, --help    Show this help
  --version     Show version
`;
if (args.includes("-h") || args.includes("--help") || args[0] === "help") {
  process.stdout.write(help);
  process.exit(0);
}
if (args.includes("--version")) {
  process.stdout.write("good-cli 1.2.3\n");
  process.exit(0);
}
const unknown = args.find((a) => a.startsWith("-") && a !== "--json");
if (unknown) {
  process.stderr.write(`error: unknown option ${unknown}\nRun 'good-cli --help' for usage.\n`);
  process.exit(2);
}
const name = args.find((a) => !a.startsWith("-"));
if (!name) {
  process.stderr.write("Usage: good-cli [--json] <name>\nRun 'good-cli --help' for more.\n");
  process.exit(2);
}
process.stdout.write(args.includes("--json") ? JSON.stringify({ greeting: `hello ${name}` }) + "\n" : `hello ${name}\n`);
