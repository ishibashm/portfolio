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

it("includes every mapped secret when --existing is omitted", () => {
  const secrets = parsed();
  expect(Object.keys(secrets).sort()).toEqual(Object.keys(secretMap).sort());
  expect(secrets.XAI_API_KEY).toBe("xai-api-key:latest");
});

it("omits optional secrets that are missing from --existing and keeps required ones", () => {
  const secrets = parsed(["--existing", "nextauth-secret,gemini-api-key"]);
  expect(secrets).not.toHaveProperty("XAI_API_KEY");
  expect(secrets.NEXTAUTH_SECRET).toBe("nextauth-secret:latest");
  expect(secrets.GEMINI_API_KEY).toBe("gemini-api-key:latest");
  expect(flag(["--existing", "nextauth-secret"])).not.toContain("xai-api-key");
});

it("includes optional secrets when their Secret Manager name exists", () => {
  const secrets = parsed([
    "--existing",
    "projects/blog-471319/secrets/xai-api-key\nnextauth-secret",
  ]);
  expect(secrets.XAI_API_KEY).toBe("xai-api-key:latest");
});

it("treats an empty --existing list as 'optional secrets are absent'", () => {
  const secrets = parsed(["--existing", ""]);
  expect(secrets).not.toHaveProperty("XAI_API_KEY");
  expect(Object.keys(secrets).length).toBe(
    Object.keys(secretMap).length - optionalKeys.length,
  );
  expect(flag(["--existing", "", "--print-missing-optional"])).toBe(
    "XAI_API_KEY",
  );
});

it("prints only missing optional env names, never values", () => {
  expect(flag(["--existing", "xai-api-key", "--print-missing-optional"])).toBe(
    "",
  );
  expect(flag(["--existing", "", "--print-missing-optional"])).toBe(
    "XAI_API_KEY",
  );
  expect(flag(["--existing", "synthetic-value"])).not.toContain(
    "synthetic-value",
  );
});

it("deploy.yml skips missing optional secrets and can drop a leftover reference", () => {
  const workflow = readFileSync(
    resolve(".github/workflows/deploy.yml"),
    "utf8",
  );
  expect(workflow).toContain("scripts/optional_secret_manager_keys.json");
  expect(workflow).toContain("gcloud secrets list");
  expect(workflow).toContain(
    'python3 scripts/secret_manager_flag.py --existing "$EXISTING_SECRETS"',
  );
  expect(workflow).toContain("--print-missing-optional");
  expect(workflow).toContain('--update-secrets="$SECRETS_FLAG"');
  expect(workflow).toContain("DROP_OPTIONAL");
  expect(workflow).toContain('--remove-secrets="$REMOVE_SECRET_KEYS"');
});
