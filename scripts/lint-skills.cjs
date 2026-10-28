#!/usr/bin/env node
"use strict";

/**
 * Repository consistency checks. Run: node scripts/lint-skills.cjs
 *
 *  1. SKILL.md frontmatter (spec fields only; name matches directory; description bounded;
 *     license references the bundled LICENSE.txt; metadata.version matches package.json)
 *  2. Rule entries parse and every checklist.json is up to date
 *  3. Shared tooling is byte-identical across skills; probe-cli.cjs is optional per skill,
 *     and each LICENSE.txt names CC BY-SA 4.0 and ends with the repository MIT text
 *  4. Relative links and #anchors resolve
 *  5. Every rule ID mentioned in a skill exists in that skill's checklist
 *  6. CLI-BASELINE.md rules mirror cli-rules rules (title, level, severity)
 *  7. probe-cli.cjs rule mappings exist in every checklist
 *  8. Every clig.dev guideline section is cited by at least one cli-rules rule
 *  9. Every companion markdown file is linked from its SKILL.md
 * 10. .claude-plugin/marketplace.json lists every skill once, with matching names and versions
 */

const fs = require("fs");
const path = require("path");
const { buildSkill, githubSlug } = require("./build-checklist.cjs");

const ROOT = path.resolve(__dirname, "..");
const SKILLS = path.join(ROOT, "skills");
const SHARED_FILES = ["report-schema.json", "validate-findings.cjs"];
const OPTIONAL_SHARED_FILES = ["probe-cli.cjs"];
const CLIG_SECTIONS = [
  "the-basics", "help", "documentation", "output", "errors", "arguments-and-flags", "interactivity",
  "subcommands", "robustness-guidelines", "future-proofing", "signals", "configuration",
  "environment-variables", "naming", "distribution", "analytics",
];
const RULE_REF = /\b((?:CLI|TUI|GIT)-[A-Z0-9]{2,5}-\d{3})\b/g;

const errors = [];
const err = (msg) => errors.push(msg);
const rel = (p) => path.relative(ROOT, p);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".git")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function stripCode(text) {
  return text.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
}

function headingSlugs(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^(```|~~~)[\s\S]*?^\1/gm, "");
  const counts = new Map();
  const slugs = new Set();
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = githubSlug(m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    slugs.add(n ? `${base}-${n}` : base);
  }
  return slugs;
}

function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const fm = {};
  let parent = null;
  for (const line of m[1].split("\n")) {
    const nested = /^ {2}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (nested && parent) {
      fm[parent][nested[1]] = nested[2].replace(/^["']|["']$/g, "");
      continue;
    }
    const kv = /^([a-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    if (kv[2] === "") {
      parent = kv[1];
      fm[parent] = {};
    } else {
      parent = null;
      fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    }
  }
  return fm;
}

const ALLOWED_FRONTMATTER = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const skillDirs = fs.readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(SKILLS, d.name));
const built = new Map();

for (const dir of skillDirs) {
  const name = path.basename(dir);

  // 1. Frontmatter
  const skillMd = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    err(`${rel(dir)}: missing SKILL.md`);
    continue;
  }
  const fm = parseFrontmatter(fs.readFileSync(skillMd, "utf8"));
  if (!fm) err(`${rel(skillMd)}: missing YAML frontmatter`);
  else {
    if (fm.name !== name) err(`${rel(skillMd)}: frontmatter name "${fm.name}" must equal directory name "${name}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name || "") || fm.name.length > 64) err(`${rel(skillMd)}: name must be lowercase kebab-case, at most 64 characters`);
    if (!fm.description || fm.description.length < 50) err(`${rel(skillMd)}: description is missing or too short`);
    else if (fm.description.length > 1024) err(`${rel(skillMd)}: description exceeds 1024 characters`);
    for (const k of Object.keys(fm)) if (!ALLOWED_FRONTMATTER.has(k)) err(`${rel(skillMd)}: unknown frontmatter field "${k}"`);
    if (!fm.license || !fm.license.includes("LICENSE.txt")) err(`${rel(skillMd)}: license must reference the bundled LICENSE.txt`);
    const meta = fm.metadata;
    if (!meta || typeof meta !== "object") err(`${rel(skillMd)}: missing metadata mapping`);
    else {
      for (const k of ["author", "version"]) if (!meta[k]) err(`${rel(skillMd)}: metadata.${k} is required`);
      if (meta.version && meta.version !== pkg.version) err(`${rel(skillMd)}: metadata.version "${meta.version}" differs from package.json "${pkg.version}"`);
    }
  }

  // 2. Rules and checklist freshness
  const b = buildSkill(dir);
  built.set(name, b);
  b.errors.forEach(err);
  const cl = path.join(dir, "checklist.json");
  const expected = JSON.stringify(b.checklist, null, 2) + "\n";
  if (!fs.existsSync(cl) || fs.readFileSync(cl, "utf8") !== expected) {
    err(`${rel(cl)} is stale; run: node scripts/build-checklist.cjs`);
  }

  // 9. Companion files linked from SKILL.md
  const skillText = fs.readFileSync(skillMd, "utf8");
  for (const f of fs.readdirSync(dir)) {
    if (f === "SKILL.md" || !/\.(md|json|cjs|txt)$/.test(f)) continue;
    if (!skillText.includes(`(${f})`) && !skillText.includes(`(${f}#`)) err(`${rel(skillMd)}: does not link companion file ${f}`);
  }
}

// 3. Shared files identical
function assertIdentical(copies) {
  const first = fs.readFileSync(copies[0]);
  for (const p of copies.slice(1)) {
    if (!first.equals(fs.readFileSync(p))) err(`${rel(p)} differs from ${rel(copies[0])}; shared files must be identical`);
  }
}
if (skillDirs.length > 1) {
  for (const f of SHARED_FILES) {
    const copies = skillDirs.map((d) => path.join(d, f));
    const missing = copies.filter((p) => !fs.existsSync(p));
    if (missing.length) {
      missing.forEach((p) => err(`${rel(p)}: missing shared file`));
      continue;
    }
    assertIdentical(copies);
  }
  for (const f of OPTIONAL_SHARED_FILES) {
    const copies = skillDirs.map((d) => path.join(d, f)).filter((p) => fs.existsSync(p));
    if (copies.length > 1) assertIdentical(copies);
  }
}

// 3b. Each bundled license names the documentation license and carries the repository MIT text verbatim
for (const dir of skillDirs) {
  const lic = path.join(dir, "LICENSE.txt");
  if (!fs.existsSync(lic)) {
    err(`${rel(lic)}: missing bundled license`);
    continue;
  }
  const text = fs.readFileSync(lic, "utf8");
  if (!text.includes("CC BY-SA 4.0")) err(`${rel(lic)}: must name the CC BY-SA 4.0 documentation license`);
  if (!text.endsWith(fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8"))) err(`${rel(lic)}: must end with the repository LICENSE text`);
}

// 4. Links and anchors, 5. rule references
const mdFiles = walk(ROOT).filter((p) => p.endsWith(".md"));
const slugCache = new Map();
const slugsFor = (p) => {
  if (!slugCache.has(p)) slugCache.set(p, headingSlugs(p));
  return slugCache.get(p);
};
for (const file of mdFiles) {
  const raw = fs.readFileSync(file, "utf8");
  const text = stripCode(raw);
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [p, anchor] = target.split("#");
    const resolved = p ? path.resolve(path.dirname(file), decodeURI(p)) : file;
    if (!fs.existsSync(resolved)) {
      err(`${rel(file)}: broken link ${target}`);
      continue;
    }
    const ownSkill = skillDirs.find((d) => file.startsWith(d + path.sep));
    if (ownSkill && !resolved.startsWith(ownSkill + path.sep) && resolved !== ownSkill) {
      err(`${rel(file)}: link ${target} leaves the skill directory; skills must be self-contained`);
    }
    if (anchor && resolved.endsWith(".md") && !slugsFor(resolved).has(anchor)) {
      err(`${rel(file)}: missing anchor #${anchor} in ${rel(resolved)}`);
    }
  }
  const inSkill = skillDirs.find((d) => file.startsWith(d + path.sep));
  if (inSkill) {
    const ids = new Set(built.get(path.basename(inSkill)).checklist.rules.map((r) => r.id));
    for (const m of raw.matchAll(RULE_REF)) {
      if (!ids.has(m[1])) err(`${rel(file)}: references unknown rule ${m[1]}`);
    }
  }
}

// 6. CLI baseline mirrors cli-rules
const cli = built.get("cli-rules");
const tui = built.get("tui-rules");
if (cli && tui) {
  const cliRules = new Map(cli.checklist.rules.map((r) => [r.id, r]));
  for (const r of tui.checklist.rules.filter((x) => x.id.startsWith("CLI-"))) {
    const src = cliRules.get(r.id);
    if (!src) err(`tui-rules/${r.doc}: ${r.id} does not exist in cli-rules`);
    else {
      for (const k of ["title", "level", "severity"]) {
        if (src[k] !== r[k]) err(`tui-rules/${r.doc}: ${r.id} ${k} "${r[k]}" differs from cli-rules "${src[k]}"`);
      }
    }
    if (r.doc !== "CLI-BASELINE.md") err(`tui-rules/${r.doc}: CLI rules belong in CLI-BASELINE.md`);
  }
  for (const r of tui.checklist.rules.filter((x) => x.id.startsWith("TUI-"))) {
    if (r.doc === "CLI-BASELINE.md") err(`tui-rules/CLI-BASELINE.md: ${r.id} must live in a TUI companion file`);
  }
  for (const r of cli.checklist.rules) {
    if (!r.id.startsWith("CLI-")) err(`cli-rules/${r.doc}: ${r.id} must use the CLI- prefix`);
  }
}
const git = built.get("git-rules");
if (git) {
  for (const r of git.checklist.rules) {
    if (!r.id.startsWith("GIT-")) err(`git-rules/${r.doc}: ${r.id} must use the GIT- prefix`);
  }
}

// 7. Probe rule mappings
for (const dir of skillDirs) {
  const probe = path.join(dir, "probe-cli.cjs");
  if (!fs.existsSync(probe)) continue;
  const { RULE_MAP } = require(probe);
  const ids = new Set(built.get(path.basename(dir)).checklist.rules.map((r) => r.id));
  for (const [check, rules] of Object.entries(RULE_MAP)) {
    for (const id of rules) if (!ids.has(id)) err(`${rel(probe)}: check "${check}" maps to ${id}, which is not in ${path.basename(dir)}/checklist.json`);
  }
}

// 8. clig.dev coverage
if (cli) {
  for (const s of CLIG_SECTIONS) {
    const url = `https://clig.dev/#${s}`;
    if (!cli.checklist.rules.some((r) => r.source === url)) err(`cli-rules: no rule cites ${url}`);
  }
}

// 10. Claude Code plugin marketplace
const marketplacePath = path.join(ROOT, ".claude-plugin", "marketplace.json");
if (!fs.existsSync(marketplacePath)) err(".claude-plugin/marketplace.json is missing");
else {
  let mp = null;
  try {
    mp = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  } catch (e) {
    err(`.claude-plugin/marketplace.json: invalid JSON (${e.message})`);
  }
  if (mp) {
    if (!mp.name || !mp.owner || !mp.owner.name || !Array.isArray(mp.plugins)) err(".claude-plugin/marketplace.json: name, owner.name and plugins are required");
    if (mp.metadata && mp.metadata.version !== pkg.version) err(`.claude-plugin/marketplace.json: metadata.version "${mp.metadata.version}" differs from package.json "${pkg.version}"`);
    const listed = new Set();
    for (const p of mp.plugins || []) {
      const where = `.claude-plugin/marketplace.json: plugin "${p.name}"`;
      if (p.version !== pkg.version) err(`${where}: version "${p.version}" differs from package.json "${pkg.version}"`);
      if (!Array.isArray(p.skills) || p.skills.length !== 1) {
        err(`${where}: list exactly one skill`);
        continue;
      }
      const skillName = path.basename(p.skills[0]);
      if (p.skills[0] !== `./skills/${skillName}` || !fs.existsSync(path.join(SKILLS, skillName, "SKILL.md"))) err(`${where}: ${p.skills[0]} is not a skill directory`);
      if (p.name !== skillName) err(`${where}: name must equal its skill "${skillName}"`);
      if (listed.has(skillName)) err(`${where}: ${skillName} is listed twice`);
      listed.add(skillName);
    }
    for (const dir of skillDirs) {
      if (!listed.has(path.basename(dir))) err(`.claude-plugin/marketplace.json: skill ${path.basename(dir)} has no plugin entry`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`${errors.length} problem(s)`);
  process.exitCode = 1;
} else {
  const counts = [...built.values()].map((b) => `${b.skill} ${b.checklist.rule_count} rules`).join(", ");
  console.log(`ok: ${mdFiles.length} markdown files, ${counts}`);
}
