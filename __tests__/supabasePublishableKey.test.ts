// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const workflow = readFileSync(resolve(".github/workflows/deploy.yml"), "utf8");
const step = workflow.slice(
  workflow.indexOf("- name: Use Supabase publishable key"),
);
const lines = step
  .split("\n")
  .slice(0, 6)
  .map((line) => line.match(/echo '([^']+)' >> \.env/)?.[1])
  .filter((line): line is string => Boolean(line));

it("deploy.yml overrides the Supabase public key with a publishable key before build and env.json", () => {
  expect(lines).toHaveLength(2);
  lines.forEach((line) =>
    expect(line).toMatch(/=sb_publishable_[A-Za-z0-9_]+$/),
  );
  const at = workflow.indexOf("- name: Use Supabase publishable key");
  expect(at).toBeGreaterThan(0);
  expect(at).toBeLessThan(workflow.indexOf("python scripts/convert_env.py"));
  expect(at).toBeLessThan(workflow.indexOf("- name: Build and Push Container"));
});

it("the appended publishable key wins over a legacy anon JWT from ENV_FILE", () => {
  const cwd = mkdtempSync(join(tmpdir(), "supabase-key-"));
  try {
    writeFileSync(
      join(cwd, ".env"),
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJsynthetic.legacy.jwt\n${lines.join("\n")}\n`,
    );
    execFileSync("python3", [resolve("scripts/convert_env.py")], {
      cwd,
      encoding: "utf8",
    });
    const values = JSON.parse(readFileSync(join(cwd, "env.json"), "utf8"));
    expect(values.NEXT_PUBLIC_SUPABASE_ANON_KEY).toMatch(/^sb_publishable_/);
    expect(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(
      /^sb_publishable_/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
