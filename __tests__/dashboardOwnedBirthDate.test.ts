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

  **出すのをやめるのではなく、見本と明記して出す**（利用者の判断、
  2026-09-13）。初めて来た人に道具の中身が伝わらなくなるため。頁の上に
  `SampleProfileNotice` を出し、刻の一覧は「あなたの」と書かない。

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
    /* ホームは「見本か」（否定形）、刻の一覧は「利用者の値か」。
     **どちらも初期値では真にならない旗を見ていること**を固定する */
    expect(CLOCK).toContain("profileIsSample={!birthDateOwned}");
    const wired = CLOCK.match(/hasBirthDate=\{[^}]+\}/g) ?? [];
    expect(wired.length).toBeGreaterThanOrEqual(1);
    for (const w of wired) expect(w).toBe("hasBirthDate={birthDateOwned}");
  });

  it("ホームは、見本でも値を出す（隠さない）", () => {
    /* 2026-09-13 の方針。隠すと初めて来た人に道具の中身が伝わらない。
       誰の例かは頁の上の帯と、札の「（見本）」が書く */
    const PORTAL = readFileSync("src/components/home/HomePortal.tsx", "utf8");
    expect(PORTAL).not.toContain("生年月日を入れると");
    expect(PORTAL).toContain('${profileIsSample ? "（見本）" : ""}');
  });

  it("刻の一覧は、旗が偽なら「あなたの」と書かない", () => {
    /* 計算は変えない。言い方だけ変える（誰の例かは頁の上の帯が書く） */
    expect(TABLE).toContain(
      'const whose = hasBirthDate ? "あなたの" : "この例の"',
    );
    /* 個人の判定の説明に、素の「あなたの」が残っていないこと */
    const legend = TABLE.slice(TABLE.indexOf("動いてよい刻"));
    expect(legend).not.toContain("あなたの本命星");
    expect(legend).not.toContain("あなたの天中殺");
  });

  it("見本の帯を頁に出している", () => {
    expect(CLOCK).toContain("<SampleProfileNotice");
    expect(CLOCK).toContain("{!birthDateOwned && (");
  });

  it("帯は「誰の例か」を具体的に書く", () => {
    const NOTICE = readFileSync(
      "src/components/profile/SampleProfileNotice.tsx",
      "utf8",
    );
    /* 「例です」とだけ書くと、自分の判定だと思ったまま読み進められる */
    expect(NOTICE).toContain("birthLabel");
    expect(NOTICE).toContain("starLabel");
    expect(NOTICE).toContain("これは見本です");
    expect(CLOCK).toContain("birthLabel={sampleBirthLabel}");
  });

  it("天中殺の既定（午・未）は今も返る", () => {
    /* `lib/timePhase` は天中殺が出せないとき午・未を返す（元の実装のまま）。
       **空の配列を渡すと、誰のものでもない天中殺が 11〜15 時に出る。**
       見本では本物の生年月日（初期値）から出すのでここは通らないが、
       規則が変わったら気付けるようにしておく */
    const item = { japanese: "午" } as KimonScheduleItem;
    expect(isVoidTimeHour(item, [])).toBe(true);
    expect(isVoidTimeHour(item, ["子", "丑"])).toBe(false);
  });
});
