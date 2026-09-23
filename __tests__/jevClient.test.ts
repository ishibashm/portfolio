import { afterEach, describe, expect, it } from "vitest";
import { resolveProvider, runPool } from "../scripts/jevClient";

/**
 * Jev を呼ぶ部品（scripts/jevClient）。
 *
 * API は呼ばない（鍵が要る）。見るのは、口の選び方と、途中で落ちたときに
 * そこまでの結果を捨てないこと（#1435。run #4 は 402 で 700 段落ぶんの
 * 答えを全部失った）。
 */

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("口の選び方", () => {
  it("指定が無ければ鍵のある方。TypeSafe の鍵が無ければ OpenRouter", () => {
    delete process.env.TYPESAFE_API_KEY;
    process.env.OPENROUTER_API_KEY = "k";
    const p = resolveProvider(undefined);
    expect(p.name).toBe("openrouter");
    expect(p.endpoint).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(p.model).toBe("typesafe/jev-1.13");
    expect(p.key).toBe("k");
  });

  it("環境変数は呼んだ時点で読む（import の後に dotenv を読んでも効く）", () => {
    process.env.OPENROUTER_BASE_URL = "http://localhost:9";
    expect(resolveProvider("openrouter").endpoint).toBe(
      "http://localhost:9/alpha/decisions",
    );
  });

  it("知らない名前は例外にする（黙って別の口へ行かない）", () => {
    expect(() => resolveProvider("foo")).toThrow(/foo は不明/);
  });
});

describe("途中で落ちても結果を残す", () => {
  it("1 件が落ちたら残りは取らず、それまでの結果と誤りを返す", async () => {
    const seen: number[] = [];
    const run = await runPool([1, 2, 3, 4, 5], 1, async (n) => {
      seen.push(n);
      if (n === 3) throw new Error("Jev 402: Insufficient credits");
      return [n * 10];
    });
    expect(run.results).toEqual([10, 20]);
    expect(run.done).toBe(2);
    expect(run.planned).toBe(5);
    expect(run.fatal?.message).toMatch(/402/);
    // 落ちた後の 4・5 は呼ばない（残高だけが減るのを止める）
    expect(seen).toEqual([1, 2, 3]);
  });

  it("落ちなければ全部を返し、fatal は null", async () => {
    const run = await runPool(["a", "b"], 4, async (s) => [s, s]);
    expect(run.results.sort()).toEqual(["a", "a", "b", "b"]);
    expect(run.fatal).toBeNull();
  });
});
