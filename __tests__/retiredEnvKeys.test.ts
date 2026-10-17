// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const retired: string[] = JSON.parse(
  readFileSync(resolve("scripts/retired_env_keys.json"), "utf8"),
);
const secretMap: Record<string, string> = JSON.parse(
  readFileSync(resolve("scripts/secret_manager_map.json"), "utf8"),
);

it("retired keys are no longer referenced from Secret Manager", () => {
  expect(retired.length).toBeGreaterThan(0);
  retired.forEach((key) => expect(secretMap).not.toHaveProperty(key));
});

it("convert_env.py drops retired keys from env.json and keeps others", () => {
  const cwd = mkdtempSync(join(tmpdir(), "retired-env-"));
  try {
    writeFileSync(
      join(cwd, ".env"),
      [...retired.map((key) => `${key}=synthetic`), "OTHER=kept"].join("\n"),
    );
    execFileSync("python3", [resolve("scripts/convert_env.py")], {
      cwd,
      encoding: "utf8",
    });
    const values = JSON.parse(readFileSync(join(cwd, "env.json"), "utf8"));
    expect(values).toEqual({ OTHER: "kept" });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

it("deploy.yml removes retired secret references from Cloud Run", () => {
  const workflow = readFileSync(
    resolve(".github/workflows/deploy.yml"),
    "utf8",
  );
  expect(workflow).toContain("scripts/retired_env_keys.json");
  expect(workflow).toContain('--remove-secrets="$RETIRED_SECRETS"');
});
