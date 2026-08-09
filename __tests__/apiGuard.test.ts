import { describe, expect, it } from "vitest";

import {
  DailyCounter,
  TokenBucket,
  TtlCache,
  clientKey,
  isSameOrigin,
  jstDayKey,
} from "@/lib/apiGuard";

const T0 = Date.parse("2026-08-09T03:00:00Z");

describe("TokenBucket", () => {
  it("容量までは通し、その先を止める", () => {
    const b = new TokenBucket(3, 1 / 1000);
    expect(b.take("a", T0)).toBe(true);
    expect(b.take("a", T0)).toBe(true);
    expect(b.take("a", T0)).toBe(true);
    expect(b.take("a", T0)).toBe(false);
  });

  it("相手が違えばバケツも別", () => {
    const b = new TokenBucket(1, 1 / 1000);
    expect(b.take("a", T0)).toBe(true);
    expect(b.take("a", T0)).toBe(false);
    expect(b.take("b", T0)).toBe(true);
  });

  it("時間が経てば回復する", () => {
    const b = new TokenBucket(2, 1 / 20_000); // 20 秒に 1 個
    expect(b.take("a", T0)).toBe(true);
    expect(b.take("a", T0)).toBe(true);
    expect(b.take("a", T0)).toBe(false);
    expect(b.take("a", T0 + 19_000)).toBe(false);
    expect(b.take("a", T0 + 21_000)).toBe(true);
  });

  it("回復は容量を超えない。長く空けても連射量は増えない", () => {
    const b = new TokenBucket(2, 1 / 1000);
    b.take("a", T0);
    b.take("a", T0);
    const later = T0 + 3_600_000;
    expect(b.take("a", later)).toBe(true);
    expect(b.take("a", later)).toBe(true);
    expect(b.take("a", later)).toBe(false);
  });

  it("拒否し続けても回復が止まらない", () => {
    // 拒否時に時刻を更新しないと、連打している間ずっと回復しない実装になる
    const b = new TokenBucket(1, 1 / 10_000);
    expect(b.take("a", T0)).toBe(true);
    for (let i = 1; i <= 9; i++) expect(b.take("a", T0 + i * 1000)).toBe(false);
    expect(b.take("a", T0 + 11_000)).toBe(true);
  });

  it("retryAfterSec が回復までの秒数を返す", () => {
    const b = new TokenBucket(1, 1 / 20_000);
    b.take("a", T0);
    expect(b.retryAfterSec("a", T0)).toBe(20);
    expect(b.retryAfterSec("a", T0 + 10_000)).toBe(10);
    expect(b.retryAfterSec("a", T0 + 25_000)).toBe(0);
    expect(b.retryAfterSec("見たことのない相手", T0)).toBe(0);
  });

  it("鍵の数に上限がある。IP を変えながらの連打でメモリが太らない", () => {
    const b = new TokenBucket(1, 1 / 1000, 10);
    for (let i = 0; i < 500; i++) b.take(`ip-${i}`, T0);
    expect(b.size).toBeLessThanOrEqual(10);
  });
});

describe("DailyCounter", () => {
  it("上限まで通してから閉じる", () => {
    const d = new DailyCounter(2);
    expect(d.tryConsume(T0)).toBe(true);
    expect(d.tryConsume(T0)).toBe(true);
    expect(d.tryConsume(T0)).toBe(false);
    expect(d.used(T0)).toBe(2);
  });

  it("日本時間で日付が変わると戻る", () => {
    const d = new DailyCounter(1);
    // 2026-08-09 14:00Z は JST では 8/9 23:00
    const evening = Date.parse("2026-08-09T14:00:00Z");
    // 2026-08-09 16:00Z は JST では 8/10 01:00
    const pastMidnight = Date.parse("2026-08-09T16:00:00Z");
    expect(jstDayKey(evening)).toBe("2026-08-09");
    expect(jstDayKey(pastMidnight)).toBe("2026-08-10");
    expect(d.tryConsume(evening)).toBe(true);
    expect(d.tryConsume(evening)).toBe(false);
    expect(d.tryConsume(pastMidnight)).toBe(true);
  });

  it("課金されなかったぶんを戻せる", () => {
    const d = new DailyCounter(1);
    expect(d.tryConsume(T0)).toBe(true);
    d.refund(T0);
    expect(d.used(T0)).toBe(0);
    expect(d.tryConsume(T0)).toBe(true);
  });

  it("戻しすぎても負にならない", () => {
    const d = new DailyCounter(1);
    d.refund(T0);
    d.refund(T0);
    expect(d.used(T0)).toBe(0);
  });

  it("上限 0 なら 1 度も通さない", () => {
    expect(new DailyCounter(0).tryConsume(T0)).toBe(false);
  });
});

describe("TtlCache", () => {
  it("入れたものを取り出せる", () => {
    const c = new TtlCache<number>(1000);
    c.set("k", 1, T0);
    expect(c.get("k", T0)).toBe(1);
  });

  it("期限が切れたら消える", () => {
    const c = new TtlCache<number>(1000);
    c.set("k", 1, T0);
    expect(c.get("k", T0 + 999)).toBe(1);
    expect(c.get("k", T0 + 1001)).toBeUndefined();
  });

  it("件数に上限がある", () => {
    const c = new TtlCache<number>(10_000, 5);
    for (let i = 0; i < 100; i++) c.set(`k${i}`, i, T0);
    expect(c.size).toBeLessThanOrEqual(5);
    expect(c.get("k99", T0)).toBe(99);
    expect(c.get("k0", T0)).toBeUndefined();
  });
});

describe("clientKey", () => {
  it("x-forwarded-for の先頭を使う", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientKey(h)).toBe("203.0.113.5");
  });

  it("無ければ x-real-ip、それも無ければ unknown", () => {
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
    expect(clientKey(new Headers())).toBe("unknown");
  });

  it("長いヘッダを鍵にしない", () => {
    const h = new Headers({ "x-forwarded-for": "a".repeat(5000) });
    expect(clientKey(h).length).toBeLessThanOrEqual(64);
  });
});

describe("isSameOrigin", () => {
  const req = (headers: Record<string, string>) => ({
    headers: new Headers(headers),
    nextUrl: { host: "cloud-palette.com" },
  });

  it("自分のページからの呼び出しは通す", () => {
    expect(
      isSameOrigin(
        req({
          origin: "https://cloud-palette.com",
          host: "cloud-palette.com",
        }),
      ),
    ).toBe(true);
  });

  it("別オリジンからは弾く", () => {
    expect(
      isSameOrigin(
        req({ origin: "https://evil.example", host: "cloud-palette.com" }),
      ),
    ).toBe(false);
  });

  it("Origin の無い素のスクリプトは弾く", () => {
    expect(isSameOrigin(req({ host: "cloud-palette.com" }))).toBe(false);
  });

  it("壊れた Origin は弾く", () => {
    expect(isSameOrigin(req({ origin: "not a url" }))).toBe(false);
  });
});
