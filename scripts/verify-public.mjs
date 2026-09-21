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

const expectedFiles = new Set([...sourceFiles, ...overlayFiles]);
const outputFiles = (await walk(output)).filter((rel) => rel !== "public-build-report.json");
for (const rel of expectedFiles) {
  if (!outputFiles.includes(rel)) problems.push(`missing public file ${rel}`);
}
for (const rel of outputFiles) {
  if (!expectedFiles.has(rel)) problems.push(`unexpected generated file ${rel}`);
}

const html = await readFile(path.join(output, "index.html"), "utf8");
const bundle = await readFile(path.join(output, "assets/index-zfVzkv9E.js"), "utf8");
for (const old of ["UNOFFICIAL PRIVATE STUDY", "SHENZHEN IN MINIATURE", "深圳·山海之间 | Shenzhen in Miniature"]) {
  if (html.includes(old) || bundle.includes(old)) problems.push(`old public-facing brand survived: ${old}`);
}
for (const required of ["微缩城市图志", "noindex", "/ATTRIBUTION.html"]) {
  if (!html.includes(required) && !bundle.includes(required)) problems.push(`required public marker missing: ${required}`);
}
const entryVersion = html.match(/index-zfVzkv9E\.js\?ride=([a-f0-9]+)/)?.[1];
const trafficBundle = await readFile(path.join(output, 'assets/traffic-Cw95n69J.js'), 'utf8');
if (!entryVersion || !trafficBundle.includes(`from"./index-zfVzkv9E.js?ride=${entryVersion}"`) || !bundle.includes(`import("./traffic-Cw95n69J.js?ride=${entryVersion}")`)) problems.push('ride entry/traffic cache versions disagree');
if (!bundle.includes('ride.active?ride.update(Ve):v.update(Ve)')) problems.push('ride animation seam missing');
const registry = JSON.parse(await readFile(path.join(output, "cities/registry.json"), "utf8"));
if (registry.defaultCity !== "shenzhen" || !registry.cities?.some((city) => city.id === "shenzhen")) problems.push("city registry lacks Shenzhen default");

const manifest = JSON.parse(await readFile(path.join(output, "cities/shenzhen/manifest.json"), "utf8"));
const testPrefixes = ["/", "/city/", "/example/", "/nested/example/"];
for (const prefix of testPrefixes) {
  const origin = `https://example.test${prefix}`;
  for (const rel of ["assets/index-zfVzkv9E.js", "assets/index-CJdN52Ic.css", "ATTRIBUTION.html", "PRIVACY.html", "ride/ride-controller.js", "ride/ride-camera.js", "ride/ride-collision.js", "ride/ride-avatar.js", "ride/ride-motion.js", "ride/ride.css"]) {
    const resolved = new URL(`./${rel}`, origin);
    if (resolved.pathname !== `${prefix}${rel}`) problems.push(`document resource escaped ${prefix}: ${rel}`);
  }
  const moduleUrl = new URL("assets/index-zfVzkv9E.js", origin);
  for (const rel of ["data/buildings.154e3e0b73a0.json", "audio/bay-breeze.mp3", "assets/traffic-Cw95n69J.js"]) {
    const resolved = new URL(`../${rel}`, moduleUrl);
    if (resolved.pathname !== `${prefix}${rel}`) problems.push(`module resource escaped ${prefix}: ${rel}`);
  }
  const registryUrl = new URL("cities/registry.json", origin);
  const manifestUrl = new URL(registry.cities[0].manifest, registryUrl);
  if (manifestUrl.pathname !== `${prefix}cities/shenzhen/manifest.json`) problems.push(`registry manifest escaped ${prefix}`);
  for (const [field, suffix] of [["entry", "assets/index-zfVzkv9E.js"], ["trafficChunk", "assets/traffic-Cw95n69J.js"]]) {
    if (new URL(manifest.runtime[field], manifestUrl).pathname !== `${prefix}${suffix}`) problems.push(`manifest ${field} escaped ${prefix}`);
  }
  for (const [field, suffix] of [["dataRoot", "data/"], ["audioRoot", "audio/"]]) {
    if (new URL(manifest[field], manifestUrl).pathname !== `${prefix}${suffix}`) problems.push(`manifest ${field} escaped ${prefix}`);
  }
}

const staticFiles = (await walk(output)).filter((name) => /\.(?:html|js|css|json)$/.test(name) && !name.endsWith("build-report.json"));
for (const rel of staticFiles) {
  const body = await readFile(path.join(output, rel), "utf8");
  if (/(?:src|href|poster|action)=["']\/(?!\/)/i.test(body) || /url\(\s*["']?\/(?!\/)/i.test(body) || /["'`]\/(?:assets|data|audio|cities)\//.test(body) || /(?:fetch|import|new URL)\(\s*["'`]\/(?!\/)/.test(body) || /return["']\/["']\+/.test(body)) {
    problems.push(`root-escaping static resource in ${rel}`);
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(`PASS — ${sourceFiles.length} runtime files accounted for; ${testPrefixes.length} arbitrary mount prefixes resolve correctly; ${staticFiles.length} text files have no root-escaping resource paths; non-text assets byte-identical.`);
