import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
const SRC = resolve(__dirname, "../src");
const HEAVY = [
  "three",
  "3d-tiles-renderer",
  "@mapbox/vector-tile",
  "pbf",
  "lunar-javascript",
  "astronomy-engine",
];

function resolveSpec(from: string, spec: string): string | null {
  let p: string;
  if (spec.startsWith("@/")) p = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) p = resolve(dirname(from), spec);
  else return null;
  for (const ext of [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".json",
    "/index.ts",
    "/index.tsx",
  ]) {
    if (existsSync(p + ext) && statSync(p + ext).isFile()) return p + ext;
  }
  return null;
}

/** 静的な値 import の specifier。`import type` と `import()` は除く。 */
function valueImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  const re =
    /^\s*(?:import|export)\s+(?!type\s)[^;]*?\bfrom\s+["']([^"']+)["']/gm;
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

function pathTo(
  file: string,
  target: string,
  stack: string[] = [],
  seen = new Set<string>(),
): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);
  for (const spec of valueImports(file)) {
    if (spec === target || spec.startsWith(`${target}/`))
      return [...stack, file, spec];
    const r = resolveSpec(file, spec);
    if (!r) continue;
    const found = pathTo(r, target, [...stack, file], seen);
    if (found) return found;
  }
  return null;
}

describe("街の表示は重い依存を遅延する", () => {
  for (const entry of [
    "app/houi/3d/page.tsx",
    "components/city3d/CityPanel.tsx",
    "components/city3d/CityPlan.tsx",
  ])
    for (const target of HEAVY)
      it(`${entry}から${target}を静的に読まない`, () => {
        expect(pathTo(join(SRC, entry), target)).toBeNull();
      });
  it("検査自体は立体のthree依存を検出する", () => {
    expect(
      pathTo(join(SRC, "components/city3d/CityScene.tsx"), "three"),
    ).not.toBeNull();
  });
});
