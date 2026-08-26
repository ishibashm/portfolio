import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RESET_STATE,
  resumeCityMissing,
  resumeIndexOutOfRange,
  writeSweptState,
} from "../scripts/scraperResume";

/**
 * 巡回が「途中から末尾まで」しか回らなくなっていた不具合の回帰テスト
 * （実測 2026-08-26。詳細は scripts/scraperResume.ts の註）。
 *
 * 症状は 3 つの形で出ていた。
 *
 *   長崎  1.2 分で「成功」。DB の最終巡回は 12 日前のまま
 *   北海道 8 秒で 1 ページも取らずに「成功」。91% が終了扱い
 *   愛知  2 晩とも 17 分で「成功」（予算 100 分）
 *
 * どれも原因は同じで、再開位置が更新されずに固定されていた。
 */

const tmpFiles: string[] = [];
afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe("一巡の完了は「消す」ではなく「空を書く」", () => {
  it("完了を記録したあともファイルが残る（消すと CI がキャッシュを保存しない）", () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "resume-")),
      "state.json",
    );
    tmpFiles.push(file);
    fs.writeFileSync(
      file,
      JSON.stringify({ pref: "hokkaido", city: "fukagawashi", page: 2 }),
    );

    writeSweptState(file);

    // 旧実装は unlinkSync していた。ここを消す実装に戻すと落ちる。
    expect(fs.existsSync(file), "完了後もファイルが残ること").toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual(RESET_STATE);
  });

  it("空の状態は、名前で再開する側（nifty）にも添字の側（eheya）にも効く", () => {
    // 読み side（loadState）は pref/city が falsy なら再開しない。
    expect(RESET_STATE.pref).toBeNull();
    expect(RESET_STATE.city).toBeNull();
    expect(RESET_STATE.page).toBe(1);
    // eheya は市区町村を添字で持つ。0 が「先頭から」。
    expect(RESET_STATE.cityIndex).toBe(0);
    expect(resumeIndexOutOfRange(RESET_STATE.cityIndex, 10)).toBe(false);
  });
});

describe("再開位置の市区町村が一覧から消えたとき", () => {
  // 2026-08-25 の北海道の実データ。再開位置 fukagawashi はこの中に無い。
  const hokkaidoCities = [
    "chitoseshi",
    "asahikawashi",
    "kitamishi",
    "hakodateshi",
    "obihiroshi",
    "takikawashi",
    "eniwashi",
    "dateshi",
    "sapporoshichuoku",
    "sapporoshihigashiku",
  ];

  it("報告の再現: fukagawashi は一覧に無いので先頭から回す", () => {
    expect(resumeCityMissing("fukagawashi", hokkaidoCities)).toBe(true);
  });

  it("一覧にあるときは再開位置を尊重する（毎回先頭に戻さない）", () => {
    expect(resumeCityMissing("obihiroshi", hokkaidoCities)).toBe(false);
  });

  it("再開位置が無い（初回・完了直後）ときは何もしない", () => {
    expect(resumeCityMissing(null, hokkaidoCities)).toBe(false);
  });
});

describe("添字で再開する側（eheya）の範囲外", () => {
  it("一覧が短くなって添字が届かないときは先頭から", () => {
    expect(resumeIndexOutOfRange(12, 10)).toBe(true);
    expect(resumeIndexOutOfRange(10, 10)).toBe(true);
  });

  it("範囲内なら再開位置を尊重する", () => {
    expect(resumeIndexOutOfRange(0, 10)).toBe(false);
    expect(resumeIndexOutOfRange(9, 10)).toBe(false);
  });

  it("壊れた値は先頭から", () => {
    expect(resumeIndexOutOfRange(-1, 10)).toBe(true);
    expect(resumeIndexOutOfRange(NaN, 10)).toBe(true);
  });
});
