#!/usr/bin/env node
"use strict";

/**
 * Validates an audit findings.json against report-schema.json and checklist.json.
 * Zero dependencies; supports only the JSON Schema keywords used by report-schema.json.
 */

const fs = require("fs");
const path = require("path");

const VERSION = "1.0.0";
const HERE = __dirname;

const USAGE = `Validate an audit findings.json against the report schema and rule checklist.

Usage:
  node validate-findings.cjs [options] <findings.json>

Options:
  --checklist <path>  Rule catalog to check rule IDs against (default: checklist.json next to this script)
  --schema <path>     JSON schema (default: report-schema.json next to this script)
  --json              Print the result summary as JSON on stdout
  -h, --help          Show this help
  --version           Show version

Exit codes:
  0  findings are valid
  1  findings are invalid
  2  usage error or unreadable input

Examples:
  node validate-findings.cjs ~/cli-audits/mytool/run-1/findings.json
  node validate-findings.cjs --json findings.json | jq .counts
`;

const SUPPORTED_KEYWORDS = new Set([
  "$comment", "$defs", "$ref", "description", "type", "properties", "required",
  "additionalProperties", "enum", "const", "pattern", "minLength", "minItems",
  "items", "oneOf", "uniqueItems",
]);
const SEVERITY_ORDER = ["high", "medium", "low", "info"];

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === "number" && actual === "integer");
}

function resolveRef(root, ref) {
  const m = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref);
  if (!m || !root.$defs || !root.$defs[m[1]]) throw new Error(`unsupported or unknown $ref: ${ref}`);
  return root.$defs[m[1]];
}

function assertSupported(schema, where = "#") {
  if (typeof schema !== "object" || schema === null) return;
  for (const k of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(k)) throw new Error(`schema keyword "${k}" at ${where} is not supported by this validator`);
  }
  for (const [k, sub] of Object.entries(schema.properties || {})) assertSupported(sub, `${where}/properties/${k}`);
  for (const [k, sub] of Object.entries(schema.$defs || {})) assertSupported(sub, `${where}/$defs/${k}`);
  if (schema.items) assertSupported(schema.items, `${where}/items`);
  (schema.oneOf || []).forEach((s, i) => assertSupported(s, `${where}/oneOf/${i}`));
}

function validateSchema(root, schema, value, at, errors) {
  if (schema.$ref) return validateSchema(root, resolveRef(root, schema.$ref), value, at, errors);

  if (schema.oneOf) {
    const branches = schema.oneOf.map((s) => (s.$ref ? resolveRef(root, s.$ref) : s));
    const results = branches.map((b) => {
      const e = [];
      validateSchema(root, b, value, at, e);
      return e;
    });
    const ok = results.filter((e) => e.length === 0).length;
    if (ok === 1) return;
    if (ok > 1) {
      errors.push(`${at}: matches more than one schema branch`);
      return;
    }
    // Report the branch selected by a discriminating `status` const when there is one.
    const status = value && typeof value === "object" ? value.status : undefined;
    const idx = branches.findIndex((b) => b.properties && b.properties.status && b.properties.status.const === status);
    if (idx !== -1) errors.push(...results[idx]);
    else {
      const allowed = branches.map((b) => b.properties && b.properties.status && b.properties.status.const).filter(Boolean);
      errors.push(`${at}: status must be one of ${allowed.join(", ")}`);
    }
    return;
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push(`${at}: expected ${types.join(" or ")}, got ${typeOf(value)}`);
      return;
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${at}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
      errors.push(`${at}: must be a non-empty string`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(`${at}: does not match pattern ${schema.pattern}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${at}: needs at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) errors.push(`${at}: items must be unique`);
    }
    if (schema.items) value.forEach((v, i) => validateSchema(root, schema.items, v, `${at}[${i}]`, errors));
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${at}: missing required property "${key}"`);
    }
    const props = schema.properties || {};
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) validateSchema(root, props[key], v, `${at}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected property "${key}"`);
    }
  }
}

function inScope(ruleId, scope) {
  return scope.some((s) => ruleId === s || ruleId.startsWith(`${s}-`));
}

function semanticChecks(findings, checklist, errors) {
  const rules = new Map(checklist.rules.map((r) => [r.id, r]));
  if (findings.skill !== checklist.skill) {
    errors.push(`$.skill: "${findings.skill}" does not match checklist skill "${checklist.skill}"`);
  }
  const scope = Array.isArray(findings.scope) ? findings.scope : null;
  if (scope) {
    for (const s of scope) {
      if (![...rules.keys()].some((id) => inScope(id, [s]))) errors.push(`$.scope: "${s}" matches no checklist rule`);
    }
  }

  const seen = new Set();
  findings.results.forEach((r, i) => {
    const at = `$.results[${i}]`;
    const rule = rules.get(r.rule_id);
    if (!rule) {
      errors.push(`${at}.rule_id: unknown rule "${r.rule_id}" (not in ${checklist.skill} checklist.json)`);
      return;
    }
    if (seen.has(r.rule_id)) errors.push(`${at}.rule_id: duplicate result for ${r.rule_id}`);
    seen.add(r.rule_id);
    if (scope && !inScope(r.rule_id, scope)) errors.push(`${at}.rule_id: ${r.rule_id} is outside the declared scope`);

    if (r.status === "fail" && r.severity !== rule.severity && !r.severity_rationale) {
      errors.push(`${at}: severity "${r.severity}" differs from the default "${rule.severity}"; add severity_rationale`);
    }
    for (const [j, ev] of (r.evidence || []).entries()) {
      const eat = `${at}.evidence[${j}]`;
      if (ev.kind === "source") {
        if (!/:\d+(-\d+)?$/.test(ev.location)) errors.push(`${eat}.location: source evidence needs path:line or path:start-end`);
        if (/^(\/|[A-Za-z]:[\\/]|~)/.test(ev.location)) errors.push(`${eat}.location: use a repository-relative path`);
      }
      if (ev.kind === "probe") {
        if (!/^probe:[a-z0-9_]+$/.test(ev.location)) errors.push(`${eat}.location: probe evidence must be "probe:<probe-id>"`);
        if (findings.mode !== "static+probe") errors.push(`${eat}: probe evidence requires mode "static+probe"`);
      }
      if (ev.kind === "commit" && !/^(commit:[0-9a-f]{7,40}|pr:\d+)$/.test(ev.location)) {
        errors.push(`${eat}.location: commit evidence must be "commit:<sha>" or "pr:<number>"`);
      }
    }
  });

  const expected = [...rules.keys()].filter((id) => !scope || inScope(id, scope));
  const missing = expected.filter((id) => !seen.has(id));
  if (missing.length) {
    errors.push(`$.results: no result for ${missing.length} rule(s) in scope: ${missing.join(", ")}` +
      (scope ? "" : ' (declare "scope" for a partial review)'));
  }
}

function summarize(findings) {
  const counts = { pass: 0, fail: 0, not_applicable: 0, needs_validation: 0 };
  const severities = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const r of findings.results || []) {
    if (counts[r.status] !== undefined) counts[r.status]++;
    if (r.status === "fail" && severities[r.severity] !== undefined) severities[r.severity]++;
  }
  return { counts, failures_by_severity: severities };
}

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    throw Object.assign(new Error(`cannot read ${label} ${file}: ${e.code || e.message}`), { exitCode: 2 });
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw Object.assign(new Error(`${label} ${file} is not valid JSON: ${e.message}`), { exitCode: label === "findings" ? 1 : 2 });
  }
}

function validate(findings, { schema, checklist }) {
  assertSupported(schema);
  const errors = [];
  validateSchema(schema, schema, findings, "$", errors);
  if (errors.length === 0) semanticChecks(findings, checklist, errors);
  return { valid: errors.length === 0, errors, ...summarize(findings) };
}

function parseArgs(argv) {
  const opts = { json: false, checklist: path.join(HERE, "checklist.json"), schema: path.join(HERE, "report-schema.json"), file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") return { help: true };
    if (a === "--version") return { version: true };
    if (a === "--json") opts.json = true;
    else if (a === "--checklist" || a === "--schema") {
      if (!argv[i + 1]) throw Object.assign(new Error(`${a} needs a path`), { exitCode: 2 });
      opts[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--checklist=")) opts.checklist = a.slice(12);
    else if (a.startsWith("--schema=")) opts.schema = a.slice(9);
    else if (a === "--") {
      opts.file = argv[i + 1] || null;
      break;
    } else if (a.startsWith("-") && a !== "-") throw Object.assign(new Error(`unknown option ${a}`), { exitCode: 2 });
    else if (opts.file) throw Object.assign(new Error("expected exactly one findings file"), { exitCode: 2 });
    else opts.file = a;
  }
  if (!opts.file) throw Object.assign(new Error("missing <findings.json>"), { exitCode: 2 });
  return opts;
}

function main(argv) {
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
    process.stdout.write(`validate-findings ${VERSION}\n`);
    return 0;
  }
  try {
    const schema = readJson(opts.schema, "schema");
    const checklist = readJson(opts.checklist, "checklist");
    const findings = opts.file === "-" ? JSON.parse(fs.readFileSync(0, "utf8")) : readJson(opts.file, "findings");
    const result = validate(findings, { schema, checklist });
    if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else if (result.valid) {
      const c = result.counts;
      const s = result.failures_by_severity;
      process.stdout.write(
        `valid: ${findings.results.length} results (${c.pass} pass, ${c.fail} fail, ` +
          `${c.not_applicable} not applicable, ${c.needs_validation} needs validation)\n` +
          `failures by severity: ${SEVERITY_ORDER.map((k) => `${k} ${s[k]}`).join(", ")}\n`,
      );
    }
    if (!result.valid) {
      for (const e of result.errors) process.stderr.write(`error: ${e}\n`);
      process.stderr.write(`${result.errors.length} error(s) in ${opts.file}\n`);
    }
    return result.valid ? 0 : 1;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return e.exitCode || 2;
  }
}

module.exports = { validate, validateSchema, main };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
