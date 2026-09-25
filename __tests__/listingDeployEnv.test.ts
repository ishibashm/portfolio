// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const dirs: string[] = [];
const keys = [
  "LISTING_EMAIL_GOOGLE_CLIENT_ID",
  "LISTING_EMAIL_GOOGLE_CLIENT_SECRET",
  "LISTING_EMAIL_GOOGLE_REDIRECT_URI",
  "LISTING_EMAIL_ENCRYPTION_KEY",
  "LISTING_EMAIL_ENCRYPTION_KEY_ID",
];
function deploy(contents: string, overrides: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "listing-deploy-"));
  dirs.push(cwd);
  writeFileSync(join(cwd, ".env"), contents);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("LISTING_")) delete env[key];
  }
  const appendLog = execFileSync(
    "bash",
    [resolve("scripts/apply-listing-env.sh")],
    {
      cwd,
      env: { ...env, ...overrides },
      encoding: "utf8",
    },
  );
  const log = execFileSync("python3", [resolve("scripts/convert_env.py")], {
    cwd,
    env,
    encoding: "utf8",
  });
  const values = JSON.parse(readFileSync(join(cwd, "env.json"), "utf8"));
  // 本番と同じ変換を実行するが、生成したフラグはログへ出さない。
  const flag = execFileSync(
    "python3",
    [resolve("scripts/env_to_gcloud_flag.py")],
    {
      cwd,
      env,
      encoding: "utf8",
    },
  ).trim();
  const delimiter = flag[1];
  const runtime = Object.fromEntries(
    flag
      .slice(3)
      .split(delimiter)
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        return [pair.slice(0, index), pair.slice(index + 1)];
      }),
  );
  return { values, runtime, log, appendLog };
}
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

it("keeps both flags absent by default and does not warn", () => {
  const result = deploy("OTHER=preserved\n");
  expect(result.values).toEqual({ OTHER: "preserved" });
  expect(result.log + result.appendLog).toBe("");
});
it("preserves ENV_FILE values when individual secrets are empty", () => {
  const contents = keys.map((key) => `${key}='synthetic-value'`).join("\n");
  const result = deploy(
    `LISTING_EMAIL_GMAIL_ENABLED=true\n${contents}`,
    Object.fromEntries(keys.map((key) => [key, ""])),
  );
  expect(result.log + result.appendLog).toBe("");
  keys.forEach((key) => expect(result.runtime[key]).toBe("synthetic-value"));
});
it("passes individually set values through to the runtime and never prints values", () => {
  const overrides = Object.fromEntries(
    keys.map((key) => [key, "synthetic,secret=with-equals"]),
  );
  const result = deploy("LISTING_EMAIL_GOOGLE_CLIENT_ID=old", {
    ...overrides,
    LISTING_EMAIL_GMAIL_ENABLED: "true",
    LISTING_CANDIDATE_GSI_ENABLED: "true",
  });
  expect(result.runtime).toEqual({
    ...overrides,
    LISTING_EMAIL_GMAIL_ENABLED: "true",
    LISTING_CANDIDATE_GSI_ENABLED: "true",
  });
  expect(result.log + result.appendLog).toBe("");
});
it.each(keys)(
  "warns without failing when enabled and %s is missing",
  (missing) => {
    const overrides = Object.fromEntries(
      keys
        .filter((key) => key !== missing)
        .map((key) => [key, "synthetic-sensitive-value"]),
    );
    const result = deploy('LISTING_EMAIL_GMAIL_ENABLED="true"\n', overrides);
    expect(result.log).toContain(
      `::warning::Gmail は有効ですが必須設定が不足しています: ${missing}`,
    );
    expect(result.log).not.toContain("synthetic-sensitive-value");
    expect(result.appendLog).toBe("");
  },
);
it("explicit false overrides ENV_FILE true and suppresses the warning", () => {
  const result = deploy("LISTING_EMAIL_GMAIL_ENABLED=true", {
    LISTING_EMAIL_GMAIL_ENABLED: "false",
  });
  expect(result.runtime.LISTING_EMAIL_GMAIL_ENABLED).toBe("false");
  expect(result.log).toBe("");
});
it("GSI explicit false disables an ENV_FILE true at the runtime boundary", () => {
  const result = deploy("LISTING_CANDIDATE_GSI_ENABLED=true", {
    LISTING_CANDIDATE_GSI_ENABLED: "false",
  });
  expect(result.runtime.LISTING_CANDIDATE_GSI_ENABLED).toBe("false");
  expect(result.log + result.appendLog).toBe("");
});
it("workflow forwards the repository flag through env.json into Cloud Run", () => {
  const workflow = readFileSync(
    resolve(".github/workflows/deploy.yml"),
    "utf8",
  );
  expect(workflow).toContain(
    "vars.LISTING_CANDIDATE_GSI_ENABLED || secrets.LISTING_CANDIDATE_GSI_ENABLED",
  );
  expect(workflow).toContain("bash scripts/apply-listing-env.sh");
  expect(workflow).toContain("python scripts/convert_env.py");
  expect(workflow).toContain("scripts/env_to_gcloud_flag.py env.json");
  expect(workflow).toContain('--update-env-vars="$ENV_VARS_FLAG"');
});
