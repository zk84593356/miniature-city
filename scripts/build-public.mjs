#!/usr/bin/env node
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { applyTransforms, outputRoot, overlayRoot, sourceRoot, transforms } from "./public-edition-config.mjs";

const source = path.resolve(sourceRoot);
const output = path.resolve(outputRoot);
const temp = path.resolve(`${outputRoot}.tmp`);
const overlay = path.resolve(overlayRoot);
const sha256 = (body) => createHash("sha256").update(body).digest("hex");

await rm(temp, { recursive: true, force: true });
await mkdir(temp, { recursive: true });
await cp(source, temp, { recursive: true });
await rm(path.join(temp, "build-report.json"), { force: true });

const report = { source: sourceRoot, output: outputRoot, transforms: {}, generatedAt: new Date().toISOString() };
for (const rel of Object.keys(transforms)) {
  const from = await readFile(path.join(source, rel), "utf8");
  const { text, hits } = applyTransforms(rel, from);
  await writeFile(path.join(temp, rel), text);
  report.transforms[rel] = {
    sourceSha256: sha256(from),
    outputSha256: sha256(text),
    hits: Object.fromEntries(hits),
  };
}

await cp(overlay, temp, { recursive: true, force: true });
await writeFile(path.join(temp, "public-build-report.json"), JSON.stringify(report, null, 2) + "\n");
await rm(output, { recursive: true, force: true });
await rename(temp, output);
console.log(`PASS — built ${outputRoot}; runtime geometry/data untouched, ${Object.keys(transforms).length} text files transformed.`);
