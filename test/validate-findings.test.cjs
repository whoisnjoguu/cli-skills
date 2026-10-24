"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL = path.join(__dirname, "..", "skills", "cli-rules");
const VALIDATOR = path.join(SKILL, "validate-findings.cjs");
const { validate } = require(VALIDATOR);
const schema = require(path.join(SKILL, "report-schema.json"));

const checklist = {
  schema_version: 1,
  skill: "cli-rules",
  rules: [
    { id: "CLI-BAS-002", severity: "high" },
    { id: "CLI-OUT-014", severity: "medium" },
    { id: "CLI-SUB-001", severity: "info" },
    { id: "CLI-ROB-006", severity: "high" },
  ],
};

function base(results, extra = {}) {
  return {
    schema_version: 1,
    skill: "cli-rules",
    target: { name: "demo", path: "/tmp/demo", kind: "cli" },
    mode: "static+probe",
    generated_at: "2026-01-01T12:00:00Z",
    results,
    ...extra,
  };
}

const ok = {
  pass: { rule_id: "CLI-BAS-002", status: "pass", evidence: [{ kind: "source", location: "src/main.go:10", detail: "os.Exit(1) on error" }] },
  fail: {
    rule_id: "CLI-OUT-014", status: "fail", severity: "medium", summary: "Color forced on pipes.",
    evidence: [{ kind: "probe", location: "probe:help_long", detail: "SGR codes on piped stdout" }],
    recommendation: "Check isatty before styling.",
  },
  na: { rule_id: "CLI-SUB-001", status: "not_applicable", reason: "Single-purpose tool with no subcommands." },
  nv: { rule_id: "CLI-ROB-006", status: "needs_validation", unresolved: "HTTP client is injected by a plugin.", plan: "Run against a local blackhole server." },
};
const all = () => [ok.pass, ok.fail, ok.na, ok.nv].map((r) => structuredClone(r));
const run = (doc) => validate(doc, { schema, checklist });

test("accepts a complete, well-formed findings file", () => {
  const r = run(base(all()));
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
  assert.deepEqual(r.counts, { pass: 1, fail: 1, not_applicable: 1, needs_validation: 1 });
  assert.equal(r.failures_by_severity.medium, 1);
});

const rejects = (name, mutate, pattern) =>
  test(`rejects ${name}`, () => {
    const doc = base(all());
    mutate(doc);
    const r = run(doc);
    assert.equal(r.valid, false, "expected invalid");
    assert.ok(r.errors.some((e) => pattern.test(e)), `no error matched ${pattern}: ${r.errors.join(" | ")}`);
  });

rejects("an unknown rule id", (d) => { d.results[0].rule_id = "CLI-BAS-999"; }, /unknown rule "CLI-BAS-999"/);
rejects("duplicate results", (d) => { d.results.push(structuredClone(ok.pass)); }, /duplicate result/);
rejects("a failure without recommendation", (d) => { delete d.results[1].recommendation; }, /recommendation/);
rejects("a non-default severity without rationale", (d) => { d.results[1].severity = "high"; }, /severity_rationale/);
rejects("a pass without evidence", (d) => { d.results[0].evidence = []; }, /at least 1/);
rejects("needs_validation with a severity", (d) => { d.results[3].severity = "high"; }, /unexpected property "severity"/);
rejects("not_applicable without a reason", (d) => { delete d.results[2].reason; }, /missing required property "reason"/);
rejects("an unknown status", (d) => { d.results[0].status = "ok"; }, /status must be one of/);
rejects("source evidence without a line", (d) => { d.results[0].evidence[0].location = "src/main.go"; }, /path:line/);
rejects("absolute source paths", (d) => { d.results[0].evidence[0].location = "/home/x/src/main.go:3"; }, /repository-relative/);
rejects("probe evidence in static mode", (d) => { d.mode = "static"; }, /requires mode "static\+probe"/);
rejects("a malformed probe location", (d) => { d.results[1].evidence[0].location = "help_long"; }, /probe:<probe-id>/);
rejects("missing rules in a full-scope audit", (d) => { d.results.pop(); }, /no result for 1 rule\(s\) in scope: CLI-ROB-006/);
rejects("a skill mismatch", (d) => { d.skill = "tui-rules"; }, /does not match checklist skill/);
rejects("a bad timestamp", (d) => { d.generated_at = "yesterday"; }, /generated_at/);
rejects("unexpected top-level properties", (d) => { d.extra = 1; }, /unexpected property "extra"/);
rejects("results outside the declared scope", (d) => { d.scope = ["CLI-OUT"]; }, /outside the declared scope/);

test("accepts a partial review when scope is declared", () => {
  const r = run(base([structuredClone(ok.fail)], { scope: ["CLI-OUT"] }));
  assert.deepEqual(r.errors, []);
});

test("accepts a non-default severity with a rationale", () => {
  const doc = base(all());
  Object.assign(doc.results[1], { severity: "high", severity_rationale: "Primary use is in CI pipelines." });
  assert.deepEqual(run(doc).errors, []);
});

test("command line: exit codes and streams", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-"));
  const cl = path.join(dir, "checklist.json");
  fs.writeFileSync(cl, JSON.stringify(checklist));
  const good = path.join(dir, "good.json");
  fs.writeFileSync(good, JSON.stringify(base(all())));
  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(bad, JSON.stringify(base([])));
  const node = (...a) => spawnSync(process.execPath, [VALIDATOR, ...a], { encoding: "utf8" });

  let r = node("--checklist", cl, good);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^valid: 4 results/);
  assert.equal(r.stderr, "");

  r = node("--checklist", cl, "--json", good);
  assert.equal(JSON.parse(r.stdout).valid, true);

  r = node("--checklist", cl, bad);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /error:/);

  assert.equal(node("--help").status, 0);
  assert.match(node("--help").stdout, /Usage:/);
  assert.equal(node().status, 2);
  assert.equal(node("--nope", good).status, 2);
  assert.equal(node(path.join(dir, "missing.json")).status, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("real checklists are accepted by the validator", () => {
  for (const skill of ["cli-rules", "tui-rules"]) {
    const dir = path.join(__dirname, "..", "skills", skill);
    const real = require(path.join(dir, "checklist.json"));
    const doc = base(
      real.rules.map((r) => ({ rule_id: r.id, status: "not_applicable", reason: "fixture" })),
      { skill, mode: "static" },
    );
    const r = validate(doc, { schema: require(path.join(dir, "report-schema.json")), checklist: real });
    assert.deepEqual(r.errors, [], skill);
  }
});
