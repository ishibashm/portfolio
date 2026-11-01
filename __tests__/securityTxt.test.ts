import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const text = readFileSync(
  join(process.cwd(), "public/.well-known/security.txt"),
  "utf8",
);

it("RFC 9116 の Contact と Expires がある", () => {
  const fields = new Map(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index), line.slice(index + 1).trim()] as const;
      }),
  );
  expect(fields.get("Contact")).toBe("https://cloud-palette.com/contact");
  const expires = fields.get("Expires");
  expect(expires).toBeTruthy();
  const at = Date.parse(expires ?? "");
  expect(Number.isNaN(at)).toBe(false);
  expect(at).toBeGreaterThan(Date.parse("2027-10-01T00:00:00.000Z"));
  expect(at).toBeLessThan(Date.parse("2027-12-01T00:00:00.000Z"));
  expect(fields.get("Canonical")).toBe(
    "https://cloud-palette.com/.well-known/security.txt",
  );
});
