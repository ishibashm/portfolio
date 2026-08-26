import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import {
  getClassicalDayStar,
  getClassicalMonthStar,
  getClassicalYearStar,
  solarTermMonthAnchor,
} from "@/utils/ephemerisEngine";
import { getZonedDateTimeFields } from "@/utils/solarTime";

/**
 * 古典盤（年盤・月盤・日盤）の日の境目。
 *
 * ## 元がどう間違っていたか
 *
 *   const solar = Solar.fromDate(date);
 *
 * `Solar.fromDate` は**実行環境のタイムゾーン**で年月日を読む。
 * Dockerfile にも deploy.yml にも `TZ` の指定が無く、
 * `node:20-bookworm-slim` の既定は UTC なので、本番では日本時間の
 * 0 時ではなく**9 時**で日が替わっていた。
 *
 * 日盤は `generateBoard(env.classicalDayStar)` で判定の `dayLayer` に
 * 入る。つまり **毎日 0〜9 時の 9 時間、前日の盤で答えが出ていた。**
 *
 * 実測（2026 年の 365 日 × 毎時 = 8,760 通り）で 3,267 件（37.3%）が
 * 食い違い、ずれる時刻は**日本時間の 0〜8 時ちょうど**だった。
 *
 * さらに、同じコードが実行環境によって別の答えを返していた。手元で
 * `TZ=Asia/Tokyo` にしている人と本番とで、同じ日時の判定が食い違う。
 *
 * ## どちらが正しいか
 *
 * 日本時間の 0 時。`getCurrentZodiac`（日支・時支）と `getRokuyo`（六曜）は
 * 最初から `getZonedDateTimeFields(date, 9)` を通していて日本時間で
 * 揃っている。**古典盤だけが別の暦を見ていた**ので、揃えるほうが正しい。
 * 子の刻（23 時）を境にする流派もあるが、それは新しい設計判断になる。
 * ここでやっているのは、サイト内の食い違いを解消することだけ。
 *
 * ## ここで固定すること
 *
 *   1. 同じ日本時間の 1 日の中では、日盤が変わらないこと（＝境目が 0 時）
 *   2. 年盤・月盤が日の途中で変わるのは、**節入りの基準日が動いた日だけ**
 *      であること（節入りは時刻で起きるので、立春などの日に変わるのは正しい）
 *   3. 明示的に日本時間で引いた暦と一致すること
 *   4. 旧実装（`Solar.fromDate`）はこれを満たさないこと
 *
 * **2 の年盤は #560 で足した。**それまで年盤は「立春の日の 0 時」で
 * 切り替わっており、ここでも「1 日の中で変わらない」と固定していた。
 * 利用者の判断で節入りの時刻に揃えたので、月盤と同じ形にする。
 *
 * 4 つめは**このテストが空回りしていないことの確認**。旧実装を写して
 * あるので、直したつもりで直っていなければ 4 つめが通ってしまう。
 */

/**
 * 旧実装。**実行環境の TZ で日付を読む。**比較のために写してある。
 *
 * 旧実装の `Solar.fromDate(date)` の実体はローカルの getFullYear 系で
 * 組むこと。fromDate は再発防止のため型宣言から外した（#624）ので、
 * 写しも同値のローカル読みで書く。
 */
function legacySolarOf(date: Date) {
  return Solar.fromYmdHms(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
}
function legacyClassicalDayStar(date: Date): number {
  return legacySolarOf(date).getLunar().getDayNineStar().getIndex() + 1;
}
function legacyClassicalYearStar(date: Date): number {
  return legacySolarOf(date).getLunar().getYearNineStar().getIndex() + 1;
}
function legacyClassicalMonthStar(date: Date): number {
  return (
    legacySolarOf(solarTermMonthAnchor(date))
      .getLunar()
      .getMonthNineStar()
      .getIndex() + 1
  );
}

/** 明示的に日本時間で暦を引いた参照値。 */
function referenceInJst(date: Date) {
  const f = getZonedDateTimeFields(date, 9);
  const solar = Solar.fromYmdHms(
    f.year,
    f.month,
    f.day,
    f.hours,
    f.minutes,
    f.seconds,
  );
  const lunar = solar.getLunar();
  return {
    year: lunar.getYearNineStar().getIndex() + 1,
    day: lunar.getDayNineStar().getIndex() + 1,
  };
}

/**
 * 年盤の参照値。**月盤と同じく節入り基準日（anchor）を日本時間で読む。**
 *
 * #560 より前は日付をそのまま読んでいた（`referenceInJst().year`）。
 * 年盤を節入りの時刻で切り替えるようにしたので、参照もそちらに揃える。
 */
function referenceYearInJst(date: Date): number {
  const f = getZonedDateTimeFields(solarTermMonthAnchor(date), 9);
  const solar = Solar.fromYmdHms(
    f.year,
    f.month,
    f.day,
    f.hours,
    f.minutes,
    f.seconds,
  );
  return solar.getLunar().getYearNineStar().getIndex() + 1;
}

/** 月盤の参照値。節入り基準日（anchor）を日本時間で読む。 */
function referenceMonthInJst(date: Date): number {
  const f = getZonedDateTimeFields(solarTermMonthAnchor(date), 9);
  const solar = Solar.fromYmdHms(
    f.year,
    f.month,
    f.day,
    f.hours,
    f.minutes,
    f.seconds,
  );
  return solar.getLunar().getMonthNineStar().getIndex() + 1;
}

/** 日本時間の (y, m, d, h) を指す Date。JST = UTC+9。 */
function jst(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h - 9, min));
}

/** その年の全日 × 指定時刻（日本時間）を回す。 */
function eachDayAt(year: number, hours: number[], fn: (d: Date) => void) {
  for (let i = 0; i < 365; i++) {
    const base = jst(year, 1, 1, 0);
    for (const h of hours) {
      fn(new Date(base.getTime() + i * 86400000 + h * 3600000));
    }
  }
}

describe("古典盤の日の境目は日本時間の 0 時", () => {
  it("同じ日本時間の 1 日の中では日盤が変わらない", () => {
    // 0 時・1 時・8 時・9 時・12 時・23 時。旧実装だと 9 時で切り替わる。
    const hours = [0, 1, 8, 9, 12, 23];
    for (let i = 0; i < 365; i++) {
      const day0 = new Date(jst(2026, 1, 1, 0).getTime() + i * 86400000);
      const stars = hours.map((h) =>
        getClassicalDayStar(new Date(day0.getTime() + h * 3600000)),
      );
      const label = getZonedDateTimeFields(day0, 9);
      expect(
        new Set(stars).size,
        `${label.year}-${label.month}-${label.day} の日盤が 1 日の中で割れた: ${stars.join(",")}`,
      ).toBe(1);
    }
  });

  /*
    年盤も**日の途中で変わってよい。**立春は「年の境目」であると同時に
    「寅月の節入り」でもあり、節入りは時刻で起きる（#560）。月盤と同じ
    `solarTermMonthAnchor` を見ているので、割れ方も月盤と同じ形になる。

    固定するのは「変わらない」ではなく **「変わるのは節入りの基準日が
    動いたときだけ」**。TZ のずれで割れていたら、基準日が動いていないのに
    盤が変わるので、ここで捕まる。
  */
  it("年盤が 1 日の中で変わるのは、節入りの基準日が動いた日だけ", () => {
    let changed = 0;
    for (let i = 0; i < 365; i++) {
      const day0 = new Date(jst(2026, 1, 1, 0).getTime() + i * 86400000);
      const day23 = new Date(day0.getTime() + 23 * 3600000);
      const starMoved =
        getClassicalYearStar(day0) !== getClassicalYearStar(day23);
      const anchorMoved =
        solarTermMonthAnchor(day0).getTime() !==
        solarTermMonthAnchor(day23).getTime();
      const label = getZonedDateTimeFields(day0, 9);
      expect(
        starMoved && !anchorMoved,
        `${label.year}-${label.month}-${label.day}: 基準日は動いていないのに年盤が変わった`,
      ).toBe(false);
      if (starMoved) changed += 1;
    }
    /*
      年に 1 回（立春）だけ。2026 の立春は 2/4 05:01 JST なので 0 時と
      23 時に挟まれる。**年によっては 0 になる**（2025 の立春は 2/3 23:10
      JST で 23 時より後）。月盤の 11 回と同じ理由。
    */
    expect(changed).toBe(1);
  });

  /*
    月盤は**日の途中で変わってよい。**節入りは時刻で起きるので、
    立春や啓蟄の日は 0 時と 23 時で節月が違う。最初これを「1 日の中で
    変わらない」と書いて落ちたが、落ちていたのは実装ではなくテストの
    ほうだった。実測で割れたのは 11 日で、すべて節入りの日
    （2026 なら 1/5・2/4・3/5・4/5・5/5・6/6・7/7・8/7・10/8・11/7・12/7）。

    なので固定するのは「変わらない」ではなく **「変わるのは節入りの
    基準日が動いたときだけ」**。TZ のずれで割れていたら、基準日が
    動いていないのに盤が変わるので、ここで捕まる。
  */
  it("月盤が 1 日の中で変わるのは、節入りの基準日が動いた日だけ", () => {
    let changed = 0;
    for (let i = 0; i < 365; i++) {
      const day0 = new Date(jst(2026, 1, 1, 0).getTime() + i * 86400000);
      const day23 = new Date(day0.getTime() + 23 * 3600000);
      const starMoved =
        getClassicalMonthStar(day0) !== getClassicalMonthStar(day23);
      const anchorMoved =
        solarTermMonthAnchor(day0).getTime() !==
        solarTermMonthAnchor(day23).getTime();
      const label = getZonedDateTimeFields(day0, 9);
      expect(
        starMoved && !anchorMoved,
        `${label.year}-${label.month}-${label.day}: 基準日は動いていないのに月盤が変わった`,
      ).toBe(false);
      if (starMoved) changed += 1;
    }
    // 節入りは年 12 回。境目の時刻の都合で 0 時〜23 時に挟まれない月もある。
    expect(changed).toBe(11);
  });

  it("月盤も明示的に日本時間で引いた暦と一致する", () => {
    eachDayAt(2026, [0, 3, 8, 9, 15, 23], (d) => {
      expect(getClassicalMonthStar(d), `${d.toISOString()} の月盤`).toBe(
        referenceMonthInJst(d),
      );
    });
  });

  it("明示的に日本時間で引いた暦と一致する（日盤・年盤）", () => {
    eachDayAt(2026, [0, 3, 8, 9, 15, 23], (d) => {
      const ref = referenceInJst(d);
      expect(getClassicalDayStar(d), `${d.toISOString()} の日盤`).toBe(ref.day);
      expect(getClassicalYearStar(d), `${d.toISOString()} の年盤`).toBe(
        referenceYearInJst(d),
      );
    });
  });

  it("日付が変わるのはちょうど 0 時（23:59 と 00:01 で別の日盤）", () => {
    for (let i = 0; i < 60; i++) {
      const base = jst(2026, 3, 1, 0).getTime() + i * 86400000;
      const before = getClassicalDayStar(new Date(base - 60000)); // 23:59 前日
      const after = getClassicalDayStar(new Date(base + 60000)); // 00:01 当日
      expect(before, `${new Date(base).toISOString()} の境目`).not.toBe(after);
    }
  });
});

describe("旧実装はこれを満たさない（テストが空回りしていないことの確認）", () => {
  /*
    このセッションの実行環境と本番はどちらも UTC。TZ=Asia/Tokyo で
    走らせると旧実装も日本時間で読むので、下の 2 つは差が出なくなる。
    そのため「UTC のときに壊れていた」ことを固定する形にしてある。
  */
  const runtimeTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const runsInUtc = runtimeTz === "UTC" || runtimeTz === "Etc/UTC";

  it.runIf(runsInUtc)(
    "旧実装は 1 日の中で日盤が割れる（9 時で切り替わる）",
    () => {
      let split = 0;
      for (let i = 0; i < 365; i++) {
        const day0 = new Date(jst(2026, 1, 1, 0).getTime() + i * 86400000);
        const at0 = legacyClassicalDayStar(day0);
        const at12 = legacyClassicalDayStar(
          new Date(day0.getTime() + 12 * 3600000),
        );
        if (at0 !== at12) split += 1;
      }
      /*
      ほぼ毎日割れる。365 ではなく **363**。日盤は夏至・冬至で
      陰遁と陽遁が折り返すため、その前後に前日と同じ星になる日が
      2 日ある（2026 なら 6/19 と 12/16）。そこだけ 0 時と 12 時が
      たまたま一致する。
      1 日も割れないなら、旧実装を写し間違えている。
    */
      expect(split).toBe(363);
    },
  );

  it.runIf(runsInUtc)("旧実装は日本時間の 0〜8 時だけ答えがずれる", () => {
    const offBy: number[] = [];
    for (let h = 0; h < 24; h++) {
      let diff = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(
          jst(2026, 1, 1, 0).getTime() + i * 86400000 + h * 3600000,
        );
        if (legacyClassicalDayStar(d) !== getClassicalDayStar(d)) diff += 1;
      }
      if (diff > 0) offBy.push(h);
    }
    // 0〜8 時ちょうど。9 時以降は旧実装でも合っていた。
    expect(offBy).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it.runIf(runsInUtc)("年盤は旧実装とずれる。月盤はずれない", () => {
    /*
      **3 時だけを見ていると差が出ない。**#560 で年盤を節入りの時刻に
      揃えたあとは、立春の日の 3 時（UTC では前日 18 時）で新旧が同じ
      答えになる。1 日 1 点の抽出では捕まらないので、全時刻を見る。

      直前にこれで落ちた。「差が 0 だから直っていない」ではなく、
      **見る場所が足りていなかった。**
    */
    let yearDiff = 0;
    let monthDiff = 0;
    for (let i = 0; i < 365; i++) {
      for (let h = 0; h < 24; h++) {
        const d = new Date(
          jst(2026, 1, 1, 0).getTime() + i * 86400000 + h * 3600000,
        );
        if (legacyClassicalYearStar(d) !== getClassicalYearStar(d))
          yearDiff += 1;
        if (legacyClassicalMonthStar(d) !== getClassicalMonthStar(d))
          monthDiff += 1;
      }
    }
    // 立春の日の数時間だけ。実測 3 件（2026 年 8,760 時点のうち）。
    expect(yearDiff).toBeGreaterThan(0);

    /*
      月盤は 0。**旧実装でも TZ に影響されない。**anchor は節入りの
      15 日後を指すので、UTC で読んでも JST で読んでも必ず同じ節月の中に
      入る。年盤も同じ anchor を見るようになったが、こちらは「立春の
      前か後か」を決める境目に近い日が anchor になることは無いものの、
      **旧実装が anchor を通していなかった**ぶんだけ差が残る。
    */
    expect(monthDiff).toBe(0);
  });
});
