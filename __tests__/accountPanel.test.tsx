import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * マイページ（/account）が「いま何が登録されているか」を出せているか。
 *
 * 見張るのは 3 つ。どれも**出ていなかったもの**で、値が画面に無いと
 * 利用者は /profile の入力欄を開くまで確かめられない。
 *
 *   1. 生年月日と場所を、✓ ではなく実際の値で出す
 *   2. 目的地を出す（端末にだけ残る項目。一覧から漏れていた）
 *   3. 控え（保存済みプロフィール）の場所を出す
 *
 * 入力欄はここに作らない、という決め事は変えていない。**出すだけ。**
 */

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => undefined,
    },
  }),
}));

import { AccountPanel } from "@/components/account/AccountPanel";
import { SETTINGS_KEY } from "@/lib/userSettings";
// 控えの置き場は profilePresetSync が持つ 2 つのうち、いまの形式のほう。
const PRESETS_KEY = "profile_presets_v1";

const PRESET = {
  id: "p1",
  name: "家族A",
  birthDate: "1988-03-04",
  birthLat: 34.6937,
  birthLon: 135.5023,
  baseLat: 35.6812,
  baseLon: 139.7671,
};

beforeEach(() => {
  window.localStorage.clear();
  /* ログインしていないので、控えは端末のものだけを読む */
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      /* 座標 → 市区町村名（lib/placeLabel）。一覧の場所は地名で出す */
      if (url.startsWith("/api/geocode/reverse")) {
        const name = url.includes("35.6812")
          ? "東京都千代田区"
          : "大阪府大阪市北区";
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { name } }),
        };
      }
      return { ok: false, status: 401, json: async () => ({}) };
    }),
  );
});

function seed() {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      birth_date: "1990-01-02",
      birth_lat: 34.6937,
      birth_lon: 135.5023,
      base_lat: 35.6812,
      base_lon: 139.7671,
      dest_lat: 43.0621,
      dest_lon: 141.3544,
      dest_label: "北海道札幌市中央区",
    }),
  );
  window.localStorage.setItem(PRESETS_KEY, JSON.stringify([PRESET]));
}

describe("AccountPanel", () => {
  it("登録した値を実際の数字で出す", async () => {
    seed();
    render(<AccountPanel />);

    await waitFor(() =>
      expect(screen.getByText("1990-01-02")).toBeInTheDocument(),
    );
    expect(screen.getByText("北緯 35.681 / 東経 139.767")).toBeInTheDocument();
    expect(screen.getByText("北緯 34.694 / 東経 135.502")).toBeInTheDocument();
  });

  it("目的地を出す。端末にだけ残ることも添える", async () => {
    seed();
    render(<AccountPanel />);

    await waitFor(() =>
      expect(
        screen.getByText("北海道札幌市中央区（北緯 43.062 / 東経 141.354）"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/アカウントに送っていません/)).toBeInTheDocument();
  });

  it("目的地が空なら「まだ入れていません」を出す（欄ごと消さない）", async () => {
    render(<AccountPanel />);

    await waitFor(() =>
      expect(screen.getByText(/まだ入れていません/)).toBeInTheDocument(),
    );
    /* 消す説明には目的地も入るので、未設定でも欄は出しておく */
    expect(screen.getByText("引越し先の候補（目的地）")).toBeInTheDocument();
  });

  it("控えは名前だけでなく中身も出す", async () => {
    seed();
    render(<AccountPanel />);

    await waitFor(() => expect(screen.getByText("家族A")).toBeInTheDocument());
    expect(screen.getByText(/1988-03-04/)).toBeInTheDocument();
    /* 住んでいる場所と出生地の両方。名前だけだと家族ぶんが並んだときに
       どれがどれだか分からない。**座標ではなく地名で**出す（利用者の
       指摘、2026-09-12）。控えに地名が無いので最寄りの市区町村「付近」 */
    await waitFor(() =>
      expect(
        screen.getByText(
          "出発地 東京都千代田区 付近 ／ 出生地 大阪府大阪市北区 付近",
        ),
      ).toBeInTheDocument(),
    );
  });
});
