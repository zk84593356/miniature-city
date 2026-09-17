#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { applyTransforms, outputRoot, overlayRoot, sourceRoot, transforms } from "./public-edition-config.mjs";

const source = path.resolve(sourceRoot);
const output = path.resolve(outputRoot);
const overlay = path.resolve(overlayRoot);
const problems = [];

async function walk(root, dir = root, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, full, out);
    else out.push(path.relative(root, full).replaceAll("\\", "/"));
  }
  return out;
}

const sourceFiles = (await walk(source)).filter((rel) => rel !== "build-report.json");
const overlayFiles = new Set(await walk(overlay));
for (const rel of sourceFiles) {
  if (overlayFiles.has(rel)) continue;
  const before = await readFile(path.join(source, rel));
  const after = await readFile(path.join(output, rel)).catch(() => null);
  if (!after) { problems.push(`missing runtime file ${rel}`); continue; }
  if (transforms[rel]) {
    const expected = Buffer.from(applyTransforms(rel, before.toString("utf8")).text);
    if (!expected.equals(after)) problems.push(`${rel} differs outside registered public transforms`);
  } else if (!before.equals(after)) problems.push(`${rel} runtime bytes changed`);
}

for (const rel of overlayFiles) {
  const expected = await readFile(path.join(overlay, rel));
  const actual = await readFile(path.join(output, rel)).catch(() => null);
  if (!actual || !expected.equals(actual)) problems.push(`overlay mismatch ${rel}`);
}

const html = await readFile(path.join(output, "index.html"), "utf8");
const bundle = await readFile(path.join(output, "assets/index-zfVzkv9E.js"), "utf8");
for (const old of ["UNOFFICIAL PRIVATE STUDY", "SHENZHEN IN MINIATURE", "深圳·山海之间 | Shenzhen in Miniature"]) {
  if (html.includes(old) || bundle.includes(old)) problems.push(`old public-facing brand survived: ${old}`);
}
for (const required of ["微缩城市图志", "noindex", "/ATTRIBUTION.html"]) {
  if (!html.includes(required) && !bundle.includes(required)) problems.push(`required public marker missing: ${required}`);
}
const registry = JSON.parse(await readFile(path.join(output, "cities/registry.json"), "utf8"));
if (registry.defaultCity !== "shenzhen" || !registry.cities?.some((city) => city.id === "shenzhen")) problems.push("city registry lacks Shenzhen default");

if (problems.length) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(`PASS — ${sourceFiles.length} runtime files accounted for; non-text assets byte-identical; public overlays verified.`);
