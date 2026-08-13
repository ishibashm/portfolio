import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

/**
 * ウォームアップ用の生存確認（/api/health）。
 *
 * keep-warm.yml が 10 分おきに叩く。要件は「軽いこと」そのもので、
 * ここが重くなると ping のたびにそのコストを払う。とくに prisma を
 * import すると DB クライアントの初期化が毎回走るので、依存ゼロを
 * ソースで固定しておく。
 */

describe("/api/health", () => {
  it("200 と ok:true を返す", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("next/server 以外を import しない（DB に触らない）", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "app", "api", "health", "route.ts"),
      "utf8",
    );
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["next/server"]);
  });

  it("静的化されない（CDN で返るとコンテナが温まらない）", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "app", "api", "health", "route.ts"),
      "utf8",
    );
    expect(src).toContain('export const dynamic = "force-dynamic";');
  });
});
