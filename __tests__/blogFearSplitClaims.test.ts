import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  judgeDayAllDirections,
  gradeVerdict,
  ALL_DIRECTIONS,
} from "@/utils/auspiciousDays";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { forecastAnchorMs } from "@/utils/boardInstant";
import { parseJapanDateTime } from "@/utils/japanDate";
import { isKnownDirectionStatus } from "@/lib/directionLabels";
import type { TenchusatsuMode } from "@/utils/tenchusatsuPolicy";
import { DEFAULT_TENCHUSATSU_MODE } from "@/utils/tenchusatsuPolicy";

/**
 * 公開記事 why-bad-directions-feel-frightening の数字をエンジンと照合する。
 *
 * この記事の芯は、**大凶の理由が 2 種類にきれいに分かれる**こと。
 *
 *   誰にでも同じ凶 … 五黄殺・暗剣殺・破・羅睺計都軸（盤で決まる）
 *   自分に紐づく凶 … 本命殺・本命的殺・天中殺方位・月命殺・月命的殺
 *
 * 記事は「自分に紐づく理由を含むのは 63〜73%」「理由の無い大凶は 1 件も
 * 無い」と書いている。**状態コードを 1 つ足したり、どちらの側に増えたり
 * したら、記事だけが古くなる。**散文は tsc も lint も守ってくれないので、
 * ここで突き合わせる（blogToolLimitsClaims と同じ考え方）。
 *
 * **分類はこの記事のための区分で、流派の区分ではない。**だから
 * 「知っている状態コードを 2 つの表で網羅しているか」も見る。片方にも
 * 入っていない凶のコードが増えたら、記事の前提（どちらでもない大凶は
 * 0 件）が崩れる。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/why-bad-directions-feel-frightening.md"),
  "utf-8",
);

/** 記事の表と同じ条件。 */
const FROM = "2026-10-01T12:00:00+09:00";
const TO = "2027-09-30T12:00:00+09:00";
const LON = 139.6917;

const BIRTHS = [
  "1990-01-02",
  "1985-07-20",
  "1972-11-11",
  "2000-03-15",
] as const;

const BIRTH_TIME: Record<string, string> = {
  "1990-01-02": "05:30",
  "1985-07-20": "12:00",
  "1972-11-11": "09:00",
  "2000-03-15": "18:00",
};

/** 誰にでも同じ凶（盤で決まる）。土用殺は最終を NOISE_GOU に上書きする。 */
const UNIVERSAL = [
  "NOISE_GOU",
  "NOISE_ANKEN",
  "NOISE_HA",
  "NOISE_NODE",
] as const;

/** 自分に紐づく凶（生年月日で決まる）。 */
const PERSONAL = [
  "NOISE_HONMEI",
  "NOISE_TEKI",
  "NOISE_VOID",
  "NOISE_GETSUMEI",
  "NOISE_GETSUTEKI",
  "NOISE_TENCHU",
] as const;

interface Split {
  x: number;
  universalOnly: number;
  personalOnly: number;
  both: number;
  neither: number;
}

function split(birth: string): Split {
  const d = parseJapanDateTime(`${birth}T${BIRTH_TIME[birth]}`);
  const p = {
    honmeiStar: getHonmeiStar(d).classical,
    voidZodiacs: getPersonalVoidZodiac(d),
    lon: LON,
    tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE as TenchusatsuMode,
  };
  let cursor = new Date(forecastAnchorMs(new Date(FROM)));
  const end = new Date(forecastAnchorMs(new Date(TO)));
  const out: Split = {
    x: 0,
    universalOnly: 0,
    personalOnly: 0,
    both: 0,
    neither: 0,
  };
  let days = 0;

  while (cursor <= end && days < 400) {
    const all = judgeDayAllDirections(cursor, p);
    for (const dir of ALL_DIRECTIONS) {
      const v = all[dir];
      if (gradeVerdict(v) !== "X") continue;
      out.x++;
      const layers = [v.yearLayer, v.monthLayer, v.dayLayer, v.finalStatus];
      const u = layers.some((l) =>
        (UNIVERSAL as readonly string[]).includes(l),
      );
      /* 天中殺は方位ではなく期間なので、盤の層に出ないことがある
         （blockedByTenchusatsu が立つだけ）。そこも自分の側に数える。 */
      const pe =
        layers.some((l) => (PERSONAL as readonly string[]).includes(l)) ||
        v.blockedByTenchusatsu;
      if (u && pe) out.both++;
      else if (u) out.universalOnly++;
      else if (pe) out.personalOnly++;
      else out.neither++;
    }
    days++;
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return out;
}

const SPLITS = new Map(BIRTHS.map((b) => [b, split(b)]));

/** 記事の表から、先頭のセルが `head` で列数が `columns` の行を 1 本拾う。 */
function rowFor(head: string, columns: number): string[] {
  const hit = md
    .split("\n")
    .filter((l) => l.startsWith(`| ${head} `))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    )
    .filter((r) => r.length === columns);
  expect(hit, `「${head}」の ${columns} 列の行が 1 本でない`).toHaveLength(1);
  return hit[0];
}

const num = (v: string) => Number(v.replace(/,/g, ""));

describe("記事: 凶方位が怖いのはなぜか", () => {
  it("条件として書いている値が記事と一致する", () => {
    expect(md).toContain("2026-10-01〜2027-09-30 の 365 日");
    expect(md).toContain("東京駅");
    for (const b of BIRTHS) expect(md).toContain(b);
  });

  it.each(BIRTHS)("%s の内訳が engine と一致する", (birth) => {
    const s = SPLITS.get(birth)!;
    // 列は 生年月日 / 本命星 / 大凶の数 / 誰にでもだけ / 自分だけ / 両方。
    const [, , x, uni, per, both] = rowFor(birth, 6);

    expect(num(x), "大凶の数").toBe(s.x);
    expect(num(uni), "誰にでも同じ理由だけ").toBe(s.universalOnly);
    expect(num(per), "自分に紐づく理由だけ").toBe(s.personalOnly);
    expect(num(both), "両方").toBe(s.both);
  });

  it("理由の無い大凶が 1 件も無い（記事の主張）", () => {
    let total = 0;
    for (const b of BIRTHS) {
      expect(SPLITS.get(b)!.neither, `${b} に理由の無い大凶`).toBe(0);
      total += SPLITS.get(b)!.x;
    }
    // 記事が書いている総数そのもの。
    expect(md).toContain(`${total.toLocaleString("en-US")} 通りの大凶すべてに`);
  });

  it("記事が書いている割合が計算と一致する", () => {
    const withSelf = BIRTHS.map((b) => {
      const s = SPLITS.get(b)!;
      return (((s.personalOnly + s.both) / s.x) * 100).toFixed(1);
    });
    const uniOnly = BIRTHS.map((b) => {
      const s = SPLITS.get(b)!;
      return ((s.universalOnly / s.x) * 100).toFixed(1);
    });

    expect(md).toContain(`${withSelf.join("% / ")}%`);
    expect(md).toContain(`${uniOnly.join("% / ")}%`);

    /* 幅の書き方も実測と合っていること。**丸めた幅にしない。**
       最小 62.9% を「63〜」と書くと、floor と round のどちらを採ったかで
       意味が変わる。小数 1 桁のまま書かせる。 */
    const lo = Math.min(...withSelf.map(Number)).toFixed(1);
    const hi = Math.max(...withSelf.map(Number)).toFixed(1);
    expect(md).toContain(`自分に紐づく理由を含むのは ${lo}〜${hi}%`);

    const uLo = Math.min(...uniOnly.map(Number)).toFixed(1);
    const uHi = Math.max(...uniOnly.map(Number)).toFixed(1);
    expect(md).toContain(`残りの ${uLo}〜${uHi}% は`);
  });

  it("2 つの分類で、凶の状態コードを網羅している", () => {
    // どちらにも入っていない凶のコードが増えたら、上の「0 件」が崩れる。
    for (const code of [...UNIVERSAL, ...PERSONAL]) {
      expect(isKnownDirectionStatus(code), `${code} が表に無い`).toBe(true);
    }
    // 分類が互いに素であること（両方に入れると数え方が壊れる）。
    for (const code of UNIVERSAL) {
      expect(PERSONAL as readonly string[]).not.toContain(code);
    }
  });

  it("「もう動いた人」向けとして挙げた記事が実在する", () => {
    // 本数はこの日の時点のものと記事に書いてある。ここでは**挙げた記事が
    // 実在すること**だけ見る（総数を固定すると記事を足すたびに落ちる）。
    const slugs = [...md.matchAll(/\]\(\/blog\/([a-z0-9-]+)\)/g)].map(
      (m) => m[1],
    );
    expect(slugs.length).toBeGreaterThanOrEqual(13);
    expect(md).toContain("本数はこの日の時点のもので、記事は増えます");
  });
});
