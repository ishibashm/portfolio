import { describe, it, expect, afterEach } from "vitest";
import { GET } from "@/app/indexnow-key.txt/route";

/**
 * IndexNow の鍵ファイル。
 *
 * 中身が 1 文字でも違うと送信は全部弾かれるが、**画面には何も出ない**。
 * 気付けるのは検索エンジン側のログだけなので、返す中身をここで固定する。
 */

const ORIGINAL = process.env.INDEXNOW_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INDEXNOW_KEY;
  else process.env.INDEXNOW_KEY = ORIGINAL;
});

describe("IndexNow の鍵ファイル", () => {
  it("鍵をそのまま返す（余計な改行を足さない）", async () => {
    process.env.INDEXNOW_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });

  it("前後の空白は落とす", async () => {
    // 環境変数に改行が混ざる事故は起きる。混ざったまま返すと弾かれる
    process.env.INDEXNOW_KEY = "  abcdef0123456789  ";
    expect(await (await GET()).text()).toBe("abcdef0123456789");
  });

  it("未設定なら 404（空の 200 を返さない）", async () => {
    delete process.env.INDEXNOW_KEY;
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("空文字でも 404", async () => {
    process.env.INDEXNOW_KEY = "   ";
    expect((await GET()).status).toBe(404);
  });
});
