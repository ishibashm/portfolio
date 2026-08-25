/**
 * 暗号鍵にリポジトリ内の文字列が使われないことを固定する。
 *
 * 以前の `getSecretKey` はこうなっていた。
 *
 *     process.env.API_SECRET_KEY
 *       || process.env.NEXTAUTH_SECRET
 *       || "fallback_default_secret_key_123456"
 *
 * 3 つ目は**このリポジトリに書いてある文字列**で、リポジトリは公開設定。
 * 環境変数がどちらも無いと、利用者が保存した Gemini の API キーが
 * 「誰でも読める鍵」で暗号化される。**エラーにならない**ので気付けない。
 *
 * 本番の実態は #592 でデプロイ時に出して確かめた。`API_SECRET_KEY` は
 * 設定済みで、この鍵は使われていなかった。だから外しても保存済みの
 * 暗号文はそのまま読める。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = {
  API_SECRET_KEY: process.env.API_SECRET_KEY,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

/** 環境変数を読み直させるため、毎回 import し直す。 */
async function loadModule() {
  vi.resetModules();
  return await import("@/utils/encryption");
}

function setEnv(key: keyof typeof ORIGINAL, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else (process.env as Record<string, string>)[key] = value;
}

beforeEach(() => {
  setEnv("API_SECRET_KEY", undefined);
  setEnv("NEXTAUTH_SECRET", undefined);
});

afterEach(() => {
  for (const key of Object.keys(ORIGINAL) as (keyof typeof ORIGINAL)[]) {
    setEnv(key, ORIGINAL[key]);
  }
  vi.restoreAllMocks();
});

describe("暗号鍵は API_SECRET_KEY から作る", () => {
  it("設定されていれば往復できる", async () => {
    setEnv("API_SECRET_KEY", "test-secret-value");
    const { encrypt, decrypt } = await loadModule();
    const cipher = encrypt("AIza-example-key");
    expect(cipher).not.toContain("AIza-example-key");
    expect(decrypt(cipher)).toBe("AIza-example-key");
  });

  it("鍵が違えば復号できない（null になる）", async () => {
    setEnv("API_SECRET_KEY", "key-one");
    const first = await loadModule();
    const cipher = first.encrypt("秘密");

    setEnv("API_SECRET_KEY", "key-two");
    const second = await loadModule();
    // 復号は例外を投げず null を返す（呼び出し側は値を落とすだけ）
    expect(second.decrypt(cipher)).toBeNull();
  });

  /**
   * 空回りするテストにしないための固定。旧実装ではここが通ってしまい、
   * リポジトリの文字列で暗号化されていた。
   */
  it("本番で未設定なら落とす（黙って弱い鍵に落ちない）", async () => {
    setEnv("NODE_ENV", "production");
    const { encrypt } = await loadModule();
    expect(() => encrypt("秘密")).toThrow(/API_SECRET_KEY/);
  });

  it("NEXTAUTH_SECRET はもう見ない", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXTAUTH_SECRET", "old-nextauth-value");
    const { encrypt } = await loadModule();
    // 旧実装ならこれで暗号化できていた
    expect(() => encrypt("秘密")).toThrow(/API_SECRET_KEY/);
  });

  it("開発では動くが、リポジトリの旧既定値は鍵にならない", async () => {
    setEnv("NODE_ENV", "development");
    const dev = await loadModule();
    const cipher = dev.encrypt("秘密");
    expect(dev.decrypt(cipher)).toBe("秘密");

    // 旧フォールバックの文字列を鍵にしても読めない
    setEnv("API_SECRET_KEY", "fallback_default_secret_key_123456");
    const old = await loadModule();
    expect(old.decrypt(cipher)).toBeNull();
  });

  it("旧既定値の文字列がソースに残っていない", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/utils/encryption.ts"),
      "utf8",
    );
    // コメントで経緯には触れるが、値そのものは置かない
    expect(src).not.toContain("fallback_default_secret_key_123456");
    // NEXTAUTH_SECRET は経緯としてコメントに出てくるが、読んではいない
    expect(src).not.toContain("process.env.NEXTAUTH_SECRET");
  });
});
