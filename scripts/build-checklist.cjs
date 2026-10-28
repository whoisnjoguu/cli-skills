#!/usr/bin/env node
"use strict";

/**
 * Builds skills/<skill>/checklist.json from the rule entries in that skill's markdown files.
 *
 * Usage:
 *   node scripts/build-checklist.cjs            # regenerate every checklist.json
 *   node scripts/build-checklist.cjs --check    # exit 1 if any checklist.json is stale or a rule is malformed
 *   node scripts/build-checklist.cjs --file <path.md>   # parse one file and print its rules (authoring aid)
 *
 * A rule entry is a level-3 heading followed by a metadata list:
 *
 *   ### CLI-OUT-001: Send primary output to stdout
 *
 *   - **Level:** must
 *   - **Severity:** high
 *   - **Check:** static, probe
 *   - **Source:** <https://clig.dev/#the-basics>
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");

const RULE_HEADING = /^### ((?:CLI|TUI|GIT)-[A-Z0-9]{2,5}-\d{3}): (.+?)\s*$/;
const ANY_RULE_LIKE_HEADING = /^#{1,6} +(?:CLI|TUI|GIT)-[A-Z0-9]+-\d+/;
const LEVELS = ["must", "should", "consider"];
const SEVERITIES = ["high", "medium", "low", "info"];
const CHECKS = ["static", "probe", "manual"];
const META_KEYS = ["Level", "Severity", "Check", "Source"];
const SKIP_FILES = new Set(["SKILL.md", "AUDIT.md"]);

function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function parseFile(file) {
  const rel = path.basename(file);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const rules = [];
  const errors = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;

    const m = RULE_HEADING.exec(line);
    if (!m) {
      if (ANY_RULE_LIKE_HEADING.test(line)) {
        errors.push(`${rel}:${i + 1}: malformed rule heading: ${line}`);
      }
      continue;
    }

    const [, id, title] = m;
    const where = `${rel}:${i + 1} (${id})`;
    const meta = {};
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    for (; j < lines.length; j++) {
      const mm = /^- \*\*(\w+):\*\* (.+?)\s*$/.exec(lines[j]);
      if (!mm) break;
      if (!META_KEYS.includes(mm[1])) {
        errors.push(`${where}: unknown metadata key "${mm[1]}"`);
        continue;
      }
      if (meta[mm[1]] !== undefined) errors.push(`${where}: duplicate metadata key "${mm[1]}"`);
      meta[mm[1]] = mm[2];
    }
    for (const key of META_KEYS) {
      if (meta[key] === undefined) errors.push(`${where}: missing "- **${key}:**" line`);
    }

    const level = meta.Level;
    const severity = meta.Severity;
    const check = (meta.Check || "").split(",").map((s) => s.trim()).filter(Boolean);
    let source = meta.Source;

    if (level !== undefined && !LEVELS.includes(level)) errors.push(`${where}: level must be one of ${LEVELS.join("|")}`);
    if (severity !== undefined && !SEVERITIES.includes(severity)) errors.push(`${where}: severity must be one of ${SEVERITIES.join("|")}`);
    if (meta.Check !== undefined) {
      if (check.length === 0) errors.push(`${where}: check must list at least one method`);
      for (const c of check) if (!CHECKS.includes(c)) errors.push(`${where}: unknown check method "${c}"`);
      if (new Set(check).size !== check.length) errors.push(`${where}: duplicate check method`);
    }
    if (source !== undefined) {
      const sm = /^<(https:\/\/[^>\s]+)>$/.exec(source);
      if (sm) source = sm[1];
      else if (source !== "original") errors.push(`${where}: source must be <https://...> or "original"`);
    }
    if (/[`*]/.test(title)) errors.push(`${where}: keep markdown formatting out of rule titles`);

    // Body must contain a Verify paragraph before the next heading.
    let k = j;
    let hasVerify = false;
    let bodyFence = false;
    for (; k < lines.length; k++) {
      if (/^\s*(```|~~~)/.test(lines[k])) bodyFence = !bodyFence;
      if (!bodyFence && /^#{1,3} /.test(lines[k])) break;
      if (!bodyFence && /^\*\*Verify:\*\*/.test(lines[k])) hasVerify = true;
    }
    if (!hasVerify) errors.push(`${where}: rule body needs a "**Verify:**" paragraph`);

    rules.push({
      id,
      title,
      level,
      severity,
      check,
      doc: rel,
      anchor: `${rel}#${githubSlug(`${id}: ${title}`)}`,
      source,
    });
  }
  if (inFence) errors.push(`${rel}: unterminated code fence`);
  return { rules, errors };
}

function buildSkill(skillDir) {
  const skill = path.basename(skillDir);
  const files = fs
    .readdirSync(skillDir)
    .filter((f) => f.endsWith(".md") && !SKIP_FILES.has(f))
    .sort();
  const rules = [];
  const errors = [];
  for (const f of files) {
    const r = parseFile(path.join(skillDir, f));
    rules.push(...r.rules);
    errors.push(...r.errors.map((e) => `${skill}/${e}`));
  }
  const seen = new Map();
  for (const r of rules) {
    if (seen.has(r.id)) errors.push(`${skill}: duplicate rule id ${r.id} in ${r.doc} and ${seen.get(r.id)}`);
    seen.set(r.id, r.doc);
  }
  rules.sort((a, b) => a.id.localeCompare(b.id));
  const checklist = {
    schema_version: 1,
    skill,
    generated_by: "scripts/build-checklist.cjs",
    rule_count: rules.length,
    rules,
  };
  return { skill, checklist, errors };
}

function listSkillDirs() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS_DIR, d.name))
    .sort();
}

function main(argv) {
  const fileIdx = argv.indexOf("--file");
  if (fileIdx !== -1) {
    const file = argv[fileIdx + 1];
    if (!file) {
      console.error("error: --file needs a path");
      return 2;
    }
    const { rules, errors } = parseFile(path.resolve(file));
    for (const r of rules) console.log(`${r.id}  [${r.level}/${r.severity}/${r.check.join("+")}]  ${r.title}`);
    for (const e of errors) console.error(`error: ${e}`);
    console.error(`${rules.length} rule(s), ${errors.length} error(s)`);
    return errors.length ? 1 : 0;
  }

  const check = argv.includes("--check");
  let failed = false;
  for (const dir of listSkillDirs()) {
    const { skill, checklist, errors } = buildSkill(dir);
    for (const e of errors) console.error(`error: ${e}`);
    if (errors.length) failed = true;
    const out = path.join(dir, "checklist.json");
    const text = JSON.stringify(checklist, null, 2) + "\n";
    if (check) {
      const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
      if (current !== text) {
        console.error(`error: ${path.relative(ROOT, out)} is stale; run: node scripts/build-checklist.cjs`);
        failed = true;
      }
    } else if (!errors.length) {
      fs.writeFileSync(out, text);
      console.error(`wrote ${path.relative(ROOT, out)} (${checklist.rule_count} rules)`);
    }
  }
  return failed ? 1 : 0;
}

module.exports = { parseFile, buildSkill, githubSlug };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
