import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { isVoidTimeHour } from "@/lib/timePhase";
import type { KimonScheduleItem } from "@/utils/solarTime";

/*
  ## 何を守る検査か

  画面は計算のために生年月日の初期値（`2000-01-01T00:00`）を state に持つ。
  **`Boolean(birthDate)` で「登録済みか」を見ると、常に真になる。**

  2026-09-13 に実測して見つけた。プロフィール未登録で
  `/relocation/dashboard` を開くと、頁の上では「プロフィールが未設定です」
  と出ているのに、タイミングのタブは**2000 年 1 月 1 日生まれの天中殺と
  本命星**を「あなたの」として出していた。ホームの `hasBirthDate` も
  同じ理由で素通りしていた。

  判定するのは `birthDateOwned`（利用者が入れた値か・保存済みの値を
  読んだか）。CLAUDE.md 3 節「設定には利用者の値だけを書く。画面の
  初期値を書かない」の表示版。#1100・#1114・#1126 と同じ系統。

  字面で見る。JSX を評価すると重い依存（暦エンジン・Leaflet）を
  引き込むため。
*/

const CLOCK = readFileSync("src/components/SolarTimeClock.tsx", "utf8");
const TABLE = readFileSync("src/components/SolarTimeTable.tsx", "utf8");

describe("未登録の人に、既定の生年月日の判定を出さない", () => {
  it("生年月日の初期値は今も置かれている（空回りしていない）", () => {
    /* 初期値をやめたならこの検査ごと考え直す。**黙って緑にしない** */
    expect(CLOCK).toContain('useState<string>("2000-01-01T00:00")');
  });

  it("`Boolean(birthDate)` で登録済みを判定していない", () => {
    expect(CLOCK).not.toContain("hasBirthDate={Boolean(birthDate)}");
  });

  it("ホームと刻の一覧は、どちらも birthDateOwned を見ている", () => {
    const wired = CLOCK.match(/hasBirthDate=\{[^}]+\}/g) ?? [];
    expect(wired.length).toBeGreaterThanOrEqual(2);
    for (const w of wired) expect(w).toBe("hasBirthDate={birthDateOwned}");
  });

  it("刻の一覧は、旗が偽なら個人の判定を通さない", () => {
    /* 空の配列を渡すだけでは足りない（下の検査）。呼ぶ前に落とす */
    expect(TABLE).toContain(
      "const ownVoidZodiac = hasBirthDate ? personalVoidZodiac : undefined",
    );
    expect(TABLE).toContain(
      "const ownHonmeiStar = hasBirthDate ? (honmeiStar ?? null) : null",
    );
    expect(TABLE).toContain(
      "hasBirthDate ? isVoidTimeHourShared(item, ownVoidZodiac) : false",
    );
  });

  it("天中殺の既定（午・未）は今も返る。だから旗で止める必要がある", () => {
    /* `lib/timePhase` は天中殺が出せないとき午・未を返す（元の実装のまま）。
       **空の配列を渡すと、誰のものでもない天中殺が 11〜15 時に出る。**
       ここが変わったら、上の「旗で止める」も考え直す */
    const item = { japanese: "午" } as KimonScheduleItem;
    expect(isVoidTimeHour(item, [])).toBe(true);
    expect(isVoidTimeHour(item, ["子", "丑"])).toBe(false);
  });

  it("旗が偽のときの案内文がある", () => {
    expect(TABLE).toContain("生年月日を登録すると、あなたの天中殺にあたる刻");
  });
});
