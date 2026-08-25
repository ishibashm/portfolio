import { describe, expect, it } from "vitest";

import prefecturesWithData from "@/data/prefecturesWithData.json";
import {
  SCRAPE_MAX_PARALLEL,
  SCRAPE_TARGETS,
  TARGET_PREFECTURE_LIKE,
  TARGET_PREFECTURE_NAMES,
  isScheduledOn,
  targetsForDate,
} from "@/lib/scrapeTargets";
import { buildPlan, orderForMatrix } from "../scripts/plan_scrape_matrix";

/** 検査に使う連続した日付 */
function days(count: number, from = "2026-01-01"): Date[] {
  const start = new Date(`${from}T00:00:00Z`);
  return Array.from(
    { length: count },
    (_, i) => new Date(start.getTime() + i * 86_400_000),
  );
}

describe("スクレイピング対象のレジストリ", () => {
  it("slug と日本語名が重複しない", () => {
    const slugs = SCRAPE_TARGETS.map((t) => t.slug);
    const names = SCRAPE_TARGETS.map((t) => t.name);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("slug は nifty の URL に入る小文字英字", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(t.slug).toMatch(/^[a-z]+$/);
    }
  });

  it("日本語名は都道府県の表記で終わる。パージが住所と前方一致で突き合わせる", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(t.name).toMatch(/[都道府県]$/);
    }
  });

  it("offsetDays は everyNDays の範囲に収まる。外れると永久に回らない県が出る", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(t.everyNDays).toBeGreaterThanOrEqual(1);
      expect(t.offsetDays).toBeGreaterThanOrEqual(0);
      expect(t.offsetDays).toBeLessThan(Math.max(t.everyNDays, 1));
    }
  });

  it("予算は正の分数", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(t.budgetMin).toBeGreaterThan(0);
    }
  });

  it("metro は毎日回す", () => {
    for (const t of SCRAPE_TARGETS.filter((x) => x.tier === "metro")) {
      expect(t.everyNDays).toBe(1);
    }
  });
});

describe("巡回の割り付け", () => {
  it("どの県も everyNDays 日のうちに必ず 1 回は回る", () => {
    const window = days(31);
    for (const t of SCRAPE_TARGETS) {
      const hit = window
        .slice(0, t.everyNDays)
        .some((d) => isScheduledOn(t, d));
      expect(hit, `${t.slug} が ${t.everyNDays} 日以内に回らない`).toBe(true);
    }
  });

  it("metro は毎日、対象に入る", () => {
    for (const d of days(14)) {
      const slugs = new Set(targetsForDate(d).map((t) => t.slug));
      for (const t of SCRAPE_TARGETS.filter((x) => x.tier === "metro")) {
        expect(slugs.has(t.slug)).toBe(true);
      }
    }
  });

  it("対象が 0 件になる日は無い", () => {
    for (const d of days(60)) {
      expect(targetsForDate(d).length).toBeGreaterThan(0);
    }
  });
});

describe("1 回の実行にかかる実時間", () => {
  it("どの日も 24 時間を超えない。超えると日次の cron を追い越す", () => {
    for (const d of days(60)) {
      const plan = buildPlan(d);
      expect(
        plan.estimatedWallMin,
        `${d.toISOString().slice(0, 10)} の見積もりが ${plan.estimatedWallMin} 分`,
      ).toBeLessThan(24 * 60);
    }
  });

  it("geocode のぶんを残して 20 時間より短い", () => {
    for (const d of days(60)) {
      expect(buildPlan(d).estimatedWallMin).toBeLessThan(20 * 60);
    }
  });

  it("最長ジョブより短くは見積もらない", () => {
    for (const d of days(7)) {
      const plan = buildPlan(d);
      expect(plan.estimatedWallMin).toBeGreaterThanOrEqual(plan.longestMin);
    }
  });

  it("並列数を上げない限り、県を足しても負荷は変わらない", () => {
    // リクエスト頻度は並列数だけで決まる。ここを変えるときは相手サーバーへの
    // 負荷が比例して増えることを意識する、という意図をテストに固定しておく。
    expect(SCRAPE_MAX_PARALLEL).toBeLessThanOrEqual(4);
  });
});

describe("手動実行の上書き", () => {
  const day = new Date("2026-01-01T00:00:00Z");

  it("県を指定すると巡回予定を無視してその県だけになる", () => {
    const plan = buildPlan(day, { only: ["shimane"] });
    expect(plan.entries.map((e) => e.prefecture)).toEqual(["shimane"]);
  });

  it("知らない県を指定したら黙って落とさずエラーにする", () => {
    // 以前はここに gifu を置いていたが、47 県へ広げて実在の対象になった。
    // 誤りとして残りやすいのは綴り間違いなので、それで検査する。
    expect(() => buildPlan(day, { only: ["tokyoto"] })).toThrow(/tokyoto/);
  });

  it("分数の上書きが全県に効く", () => {
    const plan = buildPlan(day, { budgetOverrideMin: 10 });
    expect(plan.entries.every((e) => e.budget === 10)).toBe(true);
  });
});

describe("スキャナーの県プリセット", () => {
  it("データのある県はすべてスクレイピング対象に含まれる", () => {
    // 対象から外した県が prefecturesWithData.json に残っていると、UI の
    // プリセットに出るのに二度と更新されない県ができる。
    const names = new Set(SCRAPE_TARGETS.map((t) => t.name));
    for (const p of prefecturesWithData.prefs) {
      expect(names.has(p), `${p} がレジストリに無い`).toBe(true);
    }
  });

  it("市区町村の数が入っている", () => {
    expect(prefecturesWithData.areaCount).toBeGreaterThan(0);
  });
});

describe("県別の掲載数（地図の俯瞰の元データ）", () => {
  it("掲載数が載っている県はすべてスクレイピング対象", () => {
    const names = new Set(SCRAPE_TARGETS.map((t) => t.name));
    for (const [pref, count] of Object.entries(
      prefecturesWithData.listingCounts ?? {},
    )) {
      expect(names.has(pref), `${pref} がレジストリに無い`).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });

  it("データがある県には掲載数もある。無いと俯瞰でその県が0件表示になる", () => {
    const counts: Record<string, number> =
      prefecturesWithData.listingCounts ?? {};
    for (const pref of prefecturesWithData.prefs) {
      expect(counts[pref], `${pref} の掲載数が無い`).toBeGreaterThan(0);
    }
  });
});

/**
 * パージの「範囲内」判定。
 *
 * `scripts/purge_rental_properties.ts` は住所と対象県名を突き合わせて、
 * 範囲外の行を毎晩削除する。ここが取り込み側とずれると、その晩のうちに
 * 消える。scrapeTargets.ts のコメントが「実際に岐阜がこの形で 0 件に
 * なっている」と書いているのは、対象リストが 2 か所に分かれていた頃の話で、
 * それは 1 か所に寄せて直っている。
 *
 * 直っていなかったのは**突き合わせ方**のほう。
 *
 *   substring(address from 1 for 3) <> ALL(県名の配列)
 *
 * 県名を 3 文字と決め打ちしていた。47 都道府県のうち 3 文字でないのは
 * ちょうど 3 つ（神奈川県・和歌山県・鹿児島県。いずれも 4 文字）で、
 * この 3 県だけが対象リストに入っているのに毎晩「範囲外」として消えていた。
 * 2026-08-12 の本番ログで、神奈川 35,620 行・和歌山 13,449 行。
 * 神奈川は metro（毎日 160 分）なので、その巡回がまるごと捨てられていた。
 *
 * 長さを仮定しないこと。
 */
describe("パージの範囲内判定", () => {
  /** 実際の SQL と同じ意味を JS で置いたもの。`address LIKE ANY(patterns)` */
  const inScope = (address: string) =>
    TARGET_PREFECTURE_LIKE.some((p) => address.startsWith(p.slice(0, -1)));

  it("パターンは県名 + % の前方一致", () => {
    expect(TARGET_PREFECTURE_LIKE).toHaveLength(TARGET_PREFECTURE_NAMES.length);
    for (const [i, name] of TARGET_PREFECTURE_NAMES.entries()) {
      expect(TARGET_PREFECTURE_LIKE[i]).toBe(`${name}%`);
    }
  });

  it("対象県の住所はすべて範囲内になる", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(inScope(`${t.name}どこかの市どこかの町1-2-3`)).toBe(true);
    }
  });

  it("県名が 4 文字の県も範囲内になる", () => {
    // ここが落ちていた 3 県。個別に名指しで押さえる。
    expect(inScope("神奈川県横浜市都筑区茅ケ崎中央1-1")).toBe(true);
    expect(inScope("和歌山県和歌山市小松原通1-1")).toBe(true);
    expect(inScope("鹿児島県鹿児島市山下町11-1")).toBe(true);
  });

  it("対象外の県は範囲外のまま", () => {
    const names = new Set(TARGET_PREFECTURE_NAMES);
    const outside = ["沖縄県", "佐賀県", "高知県"].filter((n) => !names.has(n));
    // 全 47 県が対象なら、この検査は成立しない。その時点で消す。
    for (const n of outside) {
      expect(inScope(`${n}どこかの市1-1`)).toBe(false);
    }
    expect(inScope("架空県どこかの市1-1")).toBe(false);
  });

  it("先頭 3 文字での突き合わせは 3 県を取りこぼす（退行の見張り）", () => {
    // 直した中身そのもの。同じ手を打ち直したらここで気付けるようにしておく。
    const names = new Set<string>(TARGET_PREFECTURE_NAMES);
    const byFixedLength = (address: string) => names.has(address.slice(0, 3));

    const missed = TARGET_PREFECTURE_NAMES.filter(
      (n) => !byFixedLength(`${n}どこかの市1-1`),
    );
    expect(missed.sort()).toEqual(["和歌山県", "神奈川県", "鹿児島県"].sort());

    // 正しい判定はどれも取りこぼさない。
    for (const n of TARGET_PREFECTURE_NAMES) {
      expect(inScope(`${n}どこかの市1-1`)).toBe(true);
    }
  });
});

/**
 * matrix の並び順。
 *
 * GitHub Actions は matrix を先頭から順に投入し、max-parallel で同時実行数を
 * 絞っている。後ろに置いた県ほど開始が遅く、枠に収まらなければ queued の
 * まま打ち切られる。
 *
 * 実際に起きた。2026-08-24 の run 32767691207 で、25 県のうち愛媛・山形・
 * 岩手が cancelled になった。3 県ともレジストリの末尾側にある 50 分の県で、
 * **並びが固定なので翌晩もまた最後尾**という状態だった。
 */
describe("matrix の並び順", () => {
  const g = (prefecture: string, budget: number) => ({ prefecture, budget });
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("分数の長い順に並ぶ（実時間は最長ジョブより短くならない）", () => {
    for (const d of days(30)) {
      const budgets = buildPlan(d).entries.map((e) => e.budget);
      const sorted = [...budgets].sort((a, b) => b - a);
      expect(budgets, d.toISOString().slice(0, 10)).toEqual(sorted);
    }
  });

  it("同じ分数の中は日ごとに回る。最後尾が固定されない", () => {
    const set = [g("a", 50), g("b", 50), g("c", 50), g("d", 50), g("e", 50)];
    const last = new Set(
      days(5, "2026-08-24").map(
        (d) => orderForMatrix(set, d).at(-1)!.prefecture,
      ),
    );
    // 5 日ぶんで 5 県すべてが 1 度ずつ最後尾に来る。
    expect(last).toEqual(new Set(["a", "b", "c", "d", "e"]));
  });

  it("分数が違えば混ざらない。長いものが必ず先", () => {
    const set = [g("short", 45), g("long", 300), g("mid", 100)];
    for (const d of days(7, "2026-08-24")) {
      expect(orderForMatrix(set, d).map((e) => e.prefecture)).toEqual([
        "long",
        "mid",
        "short",
      ]);
    }
  });

  it("同じ日なら何度呼んでも同じ順（再現できる）", () => {
    const set = [g("a", 50), g("b", 50), g("c", 50)];
    const d = day("2026-08-24");
    expect(orderForMatrix(set, d)).toEqual(orderForMatrix(set, d));
  });

  it("並べ替えるだけで、県を増やしも減らしもしない", () => {
    for (const d of days(30)) {
      const before = targetsForDate(d)
        .map((t) => t.slug)
        .sort();
      const after = buildPlan(d)
        .entries.map((e) => e.prefecture)
        .sort();
      expect(after, d.toISOString().slice(0, 10)).toEqual(before);
    }
  });

  it("手動指定は並べ替えない", () => {
    // 落ちた県をその日のうちに回し直す用途なので、指定した順で回す。
    const plan = buildPlan(day("2026-08-24"), {
      only: ["kochi", "tokyo"],
    });
    expect(plan.entries.map((e) => e.prefecture)).toEqual(["kochi", "tokyo"]);
  });

  it("見積もりは並べ替えで変わらない", () => {
    // 合計と最長から出しているので、順序に依らない。ここが変わったら
    // 見積もりの式に順序が紛れ込んでいる。
    for (const d of days(14)) {
      const plan = buildPlan(d);
      const shuffled = [...plan.entries].reverse();
      const total = shuffled.reduce((a, e) => a + e.budget, 0);
      expect(plan.totalMin).toBe(total);
    }
  });
});
