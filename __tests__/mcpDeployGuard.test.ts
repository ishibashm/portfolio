// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("personal MCP deploy guard", () => {
  it("forces false after ENV_FILE assembly without losing unrelated environment values", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    const match = workflow.match(
      /- name: Keep personal MCP disabled until rollout\n\s+run: (echo 'MCP_PERSONAL_ENABLED=false' >> \.env)\n/,
    );
    expect(match).not.toBeNull();
    if (!match) throw new Error("missing personal MCP deploy guard");

    const guardAt = workflow.indexOf(match[0]);
    expect(guardAt).toBeGreaterThan(
      workflow.indexOf("- name: Create .env from Secret required for Build"),
    );
    expect(guardAt).toBeLessThan(
      workflow.indexOf("- name: Convert .env to env.json for Cloud Run"),
    );

    const temp = mkdtempSync(join(tmpdir(), "mcp-deploy-guard-"));
    try {
      writeFileSync(
        join(temp, ".env"),
        "MCP_PERSONAL_ENABLED=true\nKEEP_THIS=unchanged,with:punctuation\nOTHER_FLAG=on\n",
      );
      execFileSync("bash", ["-c", match[1]], { cwd: temp });
      execFileSync("python3", [resolve("scripts/convert_env.py")], {
        cwd: temp,
      });

      const converted = JSON.parse(
        readFileSync(join(temp, "env.json"), "utf8"),
      );
      expect(converted).toMatchObject({
        MCP_PERSONAL_ENABLED: "false",
        KEEP_THIS: "unchanged,with:punctuation",
        OTHER_FLAG: "on",
      });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
