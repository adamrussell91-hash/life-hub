/**
 * One-shot parser for the Notion university export markdown.
 * Run: npx tsx scripts/parse-university-export.ts <export.md> <out.json> [options.json]
 *
 * The output and the options (title overrides, excluded programmes, campus suffixes) are
 * personal: keep both in the private data repo (data/knowledge/university-timeline.json,
 * `catalogue` and `parseOptions`), never in this repository.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseUniversityExport, type ParseExportOptions } from "../src/university/timeline/parseExport";

const [, , input, output, optionsPath] = process.argv;
if (!input || !output) {
  console.error("usage: parse-university-export.ts <export.md> <out.json> [options.json]");
  process.exit(1);
}

const options = optionsPath
  ? (JSON.parse(readFileSync(optionsPath, "utf8")) as { parseOptions?: ParseExportOptions } & ParseExportOptions)
  : {};
const catalogue = parseUniversityExport(readFileSync(input, "utf8"), options.parseOptions ?? options);
writeFileSync(output, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(
  `${catalogue.degrees.length} degrees, ${catalogue.degrees.reduce((n, d) => n + d.units.length, 0)} units, ${catalogue.degrees.reduce((n, d) => n + d.units.reduce((m, u) => m + u.assessments.length, 0), 0)} assessments`,
);
