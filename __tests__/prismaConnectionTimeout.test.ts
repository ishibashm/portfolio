// @vitest-environment node
import { createServer, type Server, type Socket } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { connectionTimeoutMs } from "@/lib/prisma";

/**
 * DB が「拒否せず、応答もしない」ときに、接続を待ち続けないこと。
 *
 * 2026-11-07 に DB のインスタンスが無くなり、接続が約 2 分待ってから
 * 落ちるようになった。ビルドでは記事の読み込みが Markdown に落ちる前に
 * 1 頁 60 秒の上限を越えてビルドごと失敗し、接続先を切り替えるための
 * 再デプロイも通らなかった（#1793 のデプロイ）。
 *
 * CI のビルドは接続先が localhost で即座に拒否されるので、この形は
 * 再現しない。ここでは「受け付けるだけで何も返さない」相手を立てて、
 * 上限どおりに諦めることを確かめる。
 */

describe("接続を待つ上限", () => {
  it("ビルド中は 5 秒、それ以外は 10 秒（上限なしの 0 にしない）", () => {
    expect(connectionTimeoutMs("phase-production-build")).toBe(5_000);
    expect(connectionTimeoutMs(undefined)).toBe(10_000);
    expect(connectionTimeoutMs("phase-production-server")).toBe(10_000);
    for (const p of ["phase-production-build", undefined]) {
      expect(connectionTimeoutMs(p)).toBeGreaterThan(0);
    }
  });

  it("本番の Pool に上限を渡している（prisma.ts の字面）", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../src/lib/prisma.ts", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(
      /new Pool\(\{[\s\S]*?connectionTimeoutMillis: connectionTimeoutMs\(\)/,
    );
  });
});

describe("応答しない DB を相手にしたとき", () => {
  let server: Server;
  const sockets: Socket[] = [];
  let port = 0;

  beforeAll(async () => {
    /* 受け付けるだけで、Postgres の応答を何も返さない */
    server = createServer((s) => {
      sockets.push(s);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    for (const s of sockets) s.destroy();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("上限を渡した Pool は、その時間で諦める", async () => {
    const pool = new Pool({
      connectionString: `postgresql://u:p@127.0.0.1:${port}/db`,
      connectionTimeoutMillis: 300,
    });
    const t0 = Date.now();
    await expect(pool.query("select 1")).rejects.toThrow(/timeout/i);
    expect(Date.now() - t0).toBeLessThan(3_000);
    await pool.end();
  });

  it("上限なし（以前の設定）だと 3 秒待っても終わらない", async () => {
    const pool = new Pool({
      connectionString: `postgresql://u:p@127.0.0.1:${port}/db`,
    });
    const outcome = await Promise.race([
      pool.query("select 1").then(
        () => "done",
        () => "failed",
      ),
      new Promise((r) => setTimeout(() => r("still waiting"), 3_000)),
    ]);
    expect(outcome).toBe("still waiting");
    for (const s of sockets) s.destroy();
    await pool.end().catch(() => {});
  });
});
