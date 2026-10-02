// Zero-dependency validator for the zone content system.
// Run: npm run validate:content   (must pass in CI before build)
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const authoritiesDir = join(root, "content", "authorities");
const errors = [];
const fail = (msg) => errors.push(msg);
const GRADES = new Set(["confirmed", "reported", "unknown"]);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`${path}: invalid JSON (${e.message})`);
    return null;
  }
}

// ---- 1. index.json ----
const index = readJson(join(authoritiesDir, "index.json"));
let indexIds = new Set();
if (index) {
  if (!Array.isArray(index.authorities)) fail("index.json: authorities must be an array");
  else {
    if (index.authorities.length !== 42) {
      fail(`index.json: expected 42 authorities, found ${index.authorities.length}`);
    }
    for (const [i, a] of index.authorities.entries()) {
      const where = `index.json authorities[${i}]`;
      for (const f of ["id", "name", "shortName", "jurisdiction", "grade"]) {
        if (!a[f] || typeof a[f] !== "string") fail(`${where}: missing/invalid "${f}"`);
      }
      if (a.jurisdiction !== "free-zone" && a.jurisdiction !== "mainland") {
        fail(`${where}: jurisdiction must be free-zone|mainland`);
      }
      if (!GRADES.has(a.grade)) fail(`${where}: grade must be confirmed|reported|unknown`);
      if (typeof a.deepContent !== "boolean") fail(`${where}: deepContent must be boolean`);
      if (indexIds.has(a.id)) fail(`${where}: duplicate id "${a.id}"`);
      indexIds.add(a.id);
      // If deep content is claimed, the file must exist.
      if (a.deepContent) {
        try {
          readFileSync(join(authoritiesDir, `${a.id}.json`), "utf8");
        } catch {
          fail(`${where}: deepContent=true but ${a.id}.json is missing`);
        }
      }
    }
  }
}

// ---- 2. deep files (every *.json except index.json and _template.json) ----
function checkRuleBlock(obj, path, label) {
  if (!obj || typeof obj !== "object") return fail(`${path}: ${label} must be an object`);
  if (!obj.text || typeof obj.text !== "string") fail(`${path}: ${label}.text required`);
  if (!GRADES.has(obj.grade)) return fail(`${path}: ${label}.grade must be confirmed|reported|unknown`);
  if (obj.grade === "unknown" && !obj.whoCanAnswer) {
    fail(`${path}: ${label} is unknown but whoCanAnswer is missing (spec: never guess)`);
  }
  if (obj.grade !== "unknown" && !obj.source) {
    fail(`${path}: ${label} is ${obj.grade} but source is missing`);
  }
}

for (const file of readdirSync(authoritiesDir)) {
  if (!file.endsWith(".json") || file === "index.json" || file === "_template.json") continue;
  const path = join(authoritiesDir, file);
  const z = readJson(path);
  if (!z) continue;
  const id = file.replace(/\.json$/, "");
  if (z.id !== id) fail(`${file}: id "${z.id}" must match filename "${id}"`);
  if (!indexIds.has(z.id)) fail(`${file}: id not listed in index.json`);
  for (const f of ["version", "updated", "submissionChannel", "renewsTogether", "sources"]) {
    if (z[f] === undefined) fail(`${file}: missing "${f}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(z.updated || ""))) fail(`${file}: updated must be YYYY-MM-DD`);
  if (!Array.isArray(z.sources) || z.sources.length === 0) fail(`${file}: sources must be a non-empty array`);
  if (!Array.isArray(z.renewsTogether)) fail(`${file}: renewsTogether must be an array`);
  const sc = z.submissionChannel || {};
  if (!["self", "partner-only", "zone-direct", "unknown"].includes(sc.type)) {
    fail(`${file}: submissionChannel.type invalid`);
  }
  checkRuleBlock(z.leaseAtRenewal, file, "leaseAtRenewal");
  checkRuleBlock(z.renewalWindow, file, "renewalWindow");
  checkRuleBlock(z.ifLate, file, "ifLate");
  // Hard limit: no fine amounts may ever ship in content. Crude but effective tripwire.
  const raw = JSON.stringify(z);
  if (/AED\s*\d|aed\s*\d|\d+\s*(aed|dirham|dhs)/i.test(raw)) {
    fail(`${file}: possible fine amount found — amounts are forbidden in content by design`);
  }
}

// ---- 3. _template.json must itself be valid (it is the authoring contract) ----
const tpl = readJson(join(authoritiesDir, "_template.json"));
if (tpl) {
  checkRuleBlock(tpl.leaseAtRenewal, "_template.json", "leaseAtRenewal");
  checkRuleBlock(tpl.renewalWindow, "_template.json", "renewalWindow");
  checkRuleBlock(tpl.ifLate, "_template.json", "ifLate");
}

if (errors.length) {
  console.error(`\nCONTENT INVALID — ${errors.length} problem(s):\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}
console.log("content OK: index + deep files valid, no amounts, no unsourced claims.");
