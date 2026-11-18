import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { EXTERNAL_TRANSMISSIONS } from "@/lib/externalTransmissions";

/**
 * ブラウザから第三者へ出ていく先が、/privacy の外部送信の表に載っているか。
 *
 * 先に「実装がその先へ送っている」ことを確かめてから、表を見る。
 * 実装を消したのに表だけ残っても、このテストは落とさない（載せすぎは
 * 害が小さい）。逆に、実装があるのに表に無いと落ちる。
 */
const HOSTS: { pattern: string; recipient: string }[] = [
  { pattern: "pagead2.googlesyndication.com", recipient: "AdSense" },
  { pattern: "a8.net/", recipient: "A8.net" },
  { pattern: "youtube-nocookie.com/embed", recipient: "YouTube" },
  { pattern: "cyberjapandata.gsi.go.jp/xyz", recipient: "地理院タイル" },
  { pattern: "cdnjs.cloudflare.com", recipient: "cdnjs" },
  { pattern: "NEXT_PUBLIC_SUPABASE_URL", recipient: "Supabase" },
];

function usedInSrc(pattern: string): boolean {
  try {
    const out = execSync(`git grep -l -F ${JSON.stringify(pattern)} -- src`, {
      encoding: "utf8",
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

describe("/privacy の外部送信の表", () => {
  for (const h of HOSTS) {
    it(`${h.pattern} を使っているなら ${h.recipient} が表にある`, () => {
      if (!usedInSrc(h.pattern)) return;
      expect(
        EXTERNAL_TRANSMISSIONS.some((t) => t.recipient.includes(h.recipient)),
      ).toBe(true);
    });
  }

  it("どの行にも送信先の方針へのリンクがある", () => {
    for (const t of EXTERNAL_TRANSMISSIONS) {
      expect(t.policy).toMatch(/^https:\/\//);
      expect(t.where.length).toBeGreaterThan(0);
      expect(t.purpose.length).toBeGreaterThan(0);
    }
  });

  it("送信先の名前が重複しない（表の key に使う）", () => {
    const names = EXTERNAL_TRANSMISSIONS.map((t) => t.recipient);
    expect(new Set(names).size).toBe(names.length);
  });
});
