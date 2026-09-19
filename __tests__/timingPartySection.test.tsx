import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  時期ツールの「同行者・合流する人（いつなら全員で動けるか）」。

  利用者の要望（2026-09-17）「合流する人を選んで、時期の走査を 90 日では
  なく 2 年くらいまで」。物件スキャナーの同行者は 90 日までなので、
  2 年ぶん見る入口を時期ツールに置いた。ここで固定するのは

    1. 物件スキャナーで足した同行者（arb_axis_prefs_v1）が最初の 1 回だけ読み込まれ、
       走査の API に `party` として載る
    2. 合流先の県を選ぶと、各人の方位と「次に全員で動ける日」が出る
    3. 同行者を変えたら「走査し直す」を促す（黙って古い結果を出さない）
    4. 読み込み前の空の値で保存を上書きしない（物件スキャナーの人が消える）
*/

vi.mock("recharts", () => {
  const Nothing = () => null;
  return {
    Bar: Nothing,
    BarChart: Nothing,
    CartesianGrid: Nothing,
    Legend: Nothing,
    ResponsiveContainer: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  };
});
vi.mock("@/components/ArbitrageMap", () => ({ ArbitrageMap: () => null }));
vi.mock("@/components/relocation/PlaceInput", () => ({
  PlaceInput: () => null,
}));

const { loadSettings } = vi.hoisted(() => ({ loadSettings: vi.fn() }));
/*
  差し替えるのは `loadSettings`（クラウドを見に行く）だけ。設定の読み取り
  （`readSettingsSync` とその引き上げ）は**本物のまま**にする。ここを模造品に
  すると、旧い鍵しか無い端末で値が拾えているかを見られなくなる。
*/
vi.mock("@/lib/userSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/userSettings")>()),
  loadSettings,
}));

import TimingAnalyticsPage from "@/app/relocation/timing/page";

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function row(date: string, tier: string, blocked = false) {
  const tiers: Record<string, string> = {};
  for (const d of DIRS) tiers[d] = tier;
  return { date, weekday: 1, rokuyo: "大安", tags: [], blocked, tiers };
}
const DATES = ["2026-09-17", "2026-09-18", "2026-10-01"];

const MOTHER = {
  id: "mother",
  name: "母",
  birthDate: "1958-11-02",
  birthLat: "",
  birthLon: "",
  baseLat: "33.5902",
  baseLon: "130.4017",
  weight: 1,
  stationary: false,
};

function apiResponse(url: string) {
  const params = new URL(url, "http://localhost").searchParams;
  const party = params.get("party");
  const days = DATES.map((d, i) => row(d, i === 1 ? "D" : "B"));
  const members = party
    ? [
        {
          id: "mother",
          name: "母",
          stationary: false,
          weight: 1,
          baseLat: 33.5902,
          baseLon: 130.4017,
          honmeiStar: 3,
          voidZodiacs: ["申", "酉"],
          days: DATES.map((d, i) => row(d, "C", i === 2)),
        },
      ]
    : undefined;
  return {
    ok: true,
    json: async () => ({
      honmeiStar: 6,
      voidZodiacs: ["子", "丑"],
      days,
      ...(members ? { members } : {}),
    }),
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<TimingAnalyticsPage />);
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("時期ツールの同行者", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers({
      now: new Date("2026-09-17T03:00:00Z"),
      toFake: ["Date"],
    });
    localStorage.clear();
    localStorage.setItem("arb_birthDate", "1985-05-20T09:00");
    localStorage.setItem("arb_baseLat", "35.6895");
    localStorage.setItem("arb_baseLon", "139.6917");
    localStorage.setItem(
      "arb_axis_prefs_v1",
      JSON.stringify({
        candidateStrategy: "top",
        partyMembers: [MOTHER],
        partyPolicy: "everyone",
      }),
    );
    localStorage.setItem("timing_dest_pref_v1", "北海道");
    loadSettings.mockResolvedValue({ settings: null });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/profile-presets")) {
        return { ok: false, status: 401 };
      }
      return apiResponse(String(url));
    });
    vi.stubGlobal("fetch", fetchMock as never);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("物件スキャナーの同行者を読み、走査に party を載せ、合流先への方位と全員で動ける日を出す", async () => {
    await render();
    const scanUrl = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/api/relocation/auspicious-days"));
    expect(scanUrl).toBeTruthy();
    const party = new URL(scanUrl!, "http://localhost").searchParams.get(
      "party",
    );
    expect(JSON.parse(party!)[0]).toMatchObject({ id: "mother", name: "母" });

    const text = container.textContent ?? "";
    expect(text).toContain("同行者・合流する人");
    // 東京→北海道は北東、福岡→北海道も北東
    expect(text).toContain("あなた: 北東");
    expect(text).toContain("母: 北東");
    // 9/17 はあなた B・母 C → 全員で動ける。9/18 はあなた D、10/1 は母が天中殺
    expect(text).toContain("次に全員で動ける日2026-09-17");
    expect(text).toContain("1 / 3日");
    // 走査し直しの案内は出ていない（載せた同行者と同じ）
    expect(text).not.toContain("同行者を変えました");
    // 読み込みで保存を空にしていない（物件検索の鍵はそのまま。この頁の
    // 鍵は利用者が触るまで作らない）
    const saved = JSON.parse(localStorage.getItem("arb_axis_prefs_v1") ?? "{}");
    expect(saved.partyMembers).toHaveLength(1);
    expect(saved.candidateStrategy).toBe("top");
    expect(localStorage.getItem("timing_party_v1")).toBeNull();
  });

  it("同行者を消すと走査し直しを促し、この頁の鍵に保存する（物件検索の同行者は残す）", async () => {
    /*
      当初は物件検索と同じ鍵に書き戻していた。走査の範囲が違う（90 日 /
      2 年）ので分け、こちらで消しても物件検索の同行者は消えない
      （利用者の依頼 2026-09-19）。
    */
    await render();
    const remove = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "削除",
    )!;
    await act(async () => {
      remove.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("同行者を変えました");
    const mine = JSON.parse(localStorage.getItem("timing_party_v1") ?? "{}");
    expect(mine.members).toEqual([]);
    const scanner = JSON.parse(
      localStorage.getItem("arb_axis_prefs_v1") ?? "{}",
    );
    expect(scanner.partyMembers).toHaveLength(1);
    expect(scanner.candidateStrategy).toBe("top");
  });

  it("合流先を選んでいなくても、どこで合流できるかの候補を出す", async () => {
    /*
      **選ばせる前に候補を出す**（利用者の指摘。2026-09-18）。
      人ごとに出発地が違うので、同じ合流先でも方位が違って答えが
      予想できない。選ばせるだけだと 47 回選び直すことになる。

      合流先を選ぶまで合成の結果（data-party-report）は出さない、
      という元からの決めはそのまま。
    */
    localStorage.removeItem("timing_dest_pref_v1");
    await render();
    const text = container.textContent ?? "";
    expect(text).toContain("どこで合流できるか");
    expect(container.querySelector("[data-party-candidates]")).not.toBeNull();
    expect(container.querySelector("[data-party-report]")).toBeNull();
    /* 候補は押せる。押せないと「選ばせない」と言いながら選べない。 */
    const list = container.querySelector("[data-party-candidates]")!;
    expect(list.querySelectorAll("button").length).toBeGreaterThan(1);
    /* 誰がどちらへ動くかを添える。方位が人ごとに違うことがこの機能の
       理由なので、県名だけ並べても判断できない。 */
    expect(text).toMatch(/あなたは[東西南北]/);
  });

  it("天中殺を見ないモードでは、説明にそう書く", async () => {
    /*
      **「天中殺にも当たらない日」と無条件に書いていた**（利用者の指摘。
      2026-09-19）。天中殺を見るかどうかは判定モードで決まり、
      本命星 ＋ 環境方位・本命星のみ・環境要因のみの 3 つは見ない。

      判定そのものは正しかった（エンジンは filterModeUsesTenchusatsu で
      モードを見ている。実測でも本命星 ＋ 環境方位では天中殺で塞がる日が
      0 日で、総合では同じ人が 190 日・142 日）。**食い違っていたのは
      説明文だけ**だが、日数が少ない理由を取り違える材料になる。
    */
    loadSettings.mockResolvedValue({
      settings: { direction_filter_mode: "personal_kigaku_environmental" },
    });
    await render();
    const text = container.textContent ?? "";
    expect(text).toContain("は天中殺を見ていません");
    expect(text).toContain("天中殺の期間も候補に入ります");
    expect(text).not.toContain("で天中殺にも当たらない日");
  });

  it("天中殺を見るモードでは、今までどおり書く", async () => {
    loadSettings.mockResolvedValue({
      settings: { direction_filter_mode: "composite" },
    });
    await render();
    const text = container.textContent ?? "";
    expect(text).toContain("で天中殺にも当たらない日");
    expect(text).not.toContain("は天中殺を見ていません");
  });

  it("比重は「重み付き」のときだけ出し、つまみで動かす", async () => {
    /*
      比重を読むのは combineOutcomes の weighted の枝だけ。全員一致と
      平均では触っても何も変わらないので、効く設定のときだけ出す。
      数値欄からつまみに替えた（利用者の指摘。2026-09-19）。
    */
    await render();
    /* 既定は全員一致。比重は出さない */
    expect(container.textContent).not.toContain("比重");

    localStorage.setItem(
      "arb_axis_prefs_v1",
      JSON.stringify({
        candidateStrategy: "top",
        partyMembers: [MOTHER],
        partyPolicy: "weighted",
      }),
    );
    /* 同じテストの中で描き直す（afterEach と同じ手順で畳んでから） */
    await act(async () => root.unmount());
    container.remove();
    await render();
    expect(container.textContent).toContain("比重");
    const range = container.querySelector('input[type="range"]');
    expect(range).not.toBeNull();
    expect(range?.getAttribute("step")).toBe("0.5");
    expect(container.querySelector('input[type="number"]')).toBeNull();
  });

  it("候補を押すと合流先に入り、合成の結果が出る", async () => {
    localStorage.removeItem("timing_dest_pref_v1");
    await render();
    const list = container.querySelector("[data-party-candidates]")!;
    const first = list.querySelector("button")!;
    const name = first.textContent ?? "";
    await act(async () => {
      first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("[data-party-report]")).not.toBeNull();
    /* 押した県が保存され、次に開いたときも同じ合流先で出る。 */
    expect(localStorage.getItem("timing_dest_pref_v1")).toBeTruthy();
    expect(name).toContain(localStorage.getItem("timing_dest_pref_v1")!);
  });
});
