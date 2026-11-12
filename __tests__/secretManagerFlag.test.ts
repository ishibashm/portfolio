// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const secretMap: Record<string, string> = JSON.parse(
  readFileSync(resolve("scripts/secret_manager_map.json"), "utf8"),
);
const optionalKeys: string[] = JSON.parse(
  readFileSync(resolve("scripts/optional_secret_manager_keys.json"), "utf8"),
);
const script = resolve("scripts/secret_manager_flag.py");

function flag(args: string[] = []) {
  return execFileSync("python3", [script, ...args], {
    encoding: "utf8",
  }).trim();
}

function parsed(args: string[] = []) {
  return Object.fromEntries(
    flag(args)
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        return [pair.slice(0, index), pair.slice(index + 1)];
      }),
  );
}

it("optional keys are a subset of the Secret Manager map", () => {
  expect(optionalKeys).toContain("XAI_API_KEY");
  optionalKeys.forEach((key) => expect(secretMap).toHaveProperty(key));
});

it("omits optional secrets from --update-secrets and keeps required ones", () => {
  const secrets = parsed();
  const required = Object.keys(secretMap).filter(
    (key) => !optionalKeys.includes(key),
  );
  expect(secrets).not.toHaveProperty("XAI_API_KEY");
  expect(flag()).not.toContain("xai-api-key");
  expect(Object.keys(secrets).sort()).toEqual(required.sort());
  expect(secrets.NEXTAUTH_SECRET).toBe("nextauth-secret:latest");
  expect(secrets.GEMINI_API_KEY).toBe("gemini-api-key:latest");
});

it("prints only optional env names, never values", () => {
  expect(flag(["--print-optional"])).toBe("XAI_API_KEY");
  expect(flag()).not.toContain("synthetic-value");
});

it("deploy.yml never attaches optional secrets and can drop a leftover reference", () => {
  const workflow = readFileSync(
    resolve(".github/workflows/deploy.yml"),
    "utf8",
  );
  expect(workflow).toContain("scripts/optional_secret_manager_keys.json");
  expect(workflow).toContain("python3 scripts/secret_manager_flag.py");
  expect(workflow).toContain("--print-optional");
  expect(workflow).not.toContain("gcloud secrets list");
  expect(workflow).toContain('--update-secrets="$SECRETS_FLAG"');
  expect(workflow).toContain("DROP_OPTIONAL");
  expect(workflow).toContain('--remove-secrets="$REMOVE_SECRET_KEYS"');
});
