import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  ACCOUNT_LOCAL_KEYS,
  clearLocalAccountData,
  deleteAccountData,
} from "@/lib/accountData";

/**
 * 「登録した内容をすべて消す」。見張るのは 3 つ。
 *
 *   1. **端末は必ず消す。**クラウドの削除が失敗しても消す。残すと
 *      利用者には「押したのに何も消えていない」に見えるうえ、次の
 *      保存で端末の値がクラウドへ上がって元に戻る
 *   2. 消す鍵を取りこぼさない（設定・保存済みプロフィール 2 つ・
 *      初期化済みの印・目的地 3 つ）
 *   3. **消すつもりの無いものを巻き込まない**（地図に自分で置いた地点）
 */

function fakeStorage() {
  const removed: string[] = [];
  return {
    removed,
    storage: {
      removeItem(key: string) {
        removed.push(key);
      },
    },
  };
}

describe("消す鍵", () => {
  it("設定・保存済みプロフィール・目的地をすべて消す", () => {
    const { removed, storage } = fakeStorage();
    clearLocalAccountData(storage);

    expect(removed).toEqual([
      "tactical_config_v1",
      "profile_presets_v1",
      "wealth_presets",
      "profile_presets_cloud_ids_v1",
      "presets_initialized",
      "arb_birthDate",
      "arb_baseLat",
      "arb_baseLon",
      "wealth_birthDate",
      "wealth_birthLat",
      "wealth_birthLon",
      "wealth_baseLat",
      "wealth_baseLon",
      "relocation_simulator_draft",
      "dest_lat",
      "dest_lon",
      "dest_label",
    ]);
  });

  it("地図に自分で置いた地点は消さない", () => {
    expect(ACCOUNT_LOCAL_KEYS).not.toContain("user_spots_v1");
  });

  it("1 つ消せなくても残りを消す（プライベートモード）", () => {
    const removed: string[] = [];
    const storage = {
      removeItem(key: string) {
        if (key === "profile_presets_v1") throw new Error("QuotaExceeded");
        removed.push(key);
      },
    };

    expect(() => clearLocalAccountData(storage)).not.toThrow();
    expect(removed).toContain("dest_label");
    expect(removed).toHaveLength(ACCOUNT_LOCAL_KEYS.length - 1);
  });
});

describe("クラウドと端末の両方", () => {
  it("成功したら cloudCleared", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { removed, storage } = fakeStorage();

    const result = await deleteAccountData(
      fetcher as unknown as typeof fetch,
      storage,
    );

    expect(fetcher).toHaveBeenCalledWith("/api/user-config", {
      method: "DELETE",
    });
    expect(result).toEqual({ cloudCleared: true, unauthenticated: false });
    expect(removed).toHaveLength(ACCOUNT_LOCAL_KEYS.length);
  });

  it("未ログイン（401）でも端末は消す", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const { removed, storage } = fakeStorage();

    const result = await deleteAccountData(
      fetcher as unknown as typeof fetch,
      storage,
    );

    expect(result).toEqual({ cloudCleared: false, unauthenticated: true });
    expect(removed).toHaveLength(ACCOUNT_LOCAL_KEYS.length);
  });

  it("通信が落ちても端末は消す", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const { removed, storage } = fakeStorage();

    const result = await deleteAccountData(
      fetcher as unknown as typeof fetch,
      storage,
    );

    expect(result).toEqual({ cloudCleared: false, unauthenticated: false });
    expect(removed).toHaveLength(ACCOUNT_LOCAL_KEYS.length);
  });
});

/**
 * **端末に残る鍵を数え上げて、消す／残すのどちらかに必ず入れる。**
 *
 * 生年月日と座標は `tactical_config_v1` のほかに画面ごとの鍵にも
 * 写されていて（`arb_birthDate` など）、消す一覧に入っていなかった。
 * 「すべて消す」を押しても生年月日が端末に残り、九星の診断や
 * シミュレータの入口が次に開いたときそれを拾っていた。
 *
 * 字面で数え上げるのは、**画面を足した人がこの一覧を知らないから。**
 * 知らないまま `localStorage.setItem("xxx_birthDate", …)` と書けるので、
 * 一覧の側で気付けるようにする（#552 の教訓と同じ考え方）。
 */
const SRC = path.join(process.cwd(), "src");

/** 消さないと決めた鍵。**理由を必ず書く。** */
const KEPT: Record<string, string> = {
  /* 個人の値だが、「登録した内容」に含めていない別系統の控え */
  user_spots_v1: "地図に自分で置いた地点。サーバーに送っていない",
  favorite_properties_v1: "お気に入り物件。同上",
  /* **消してはいけない側。**消すと黙って計測が再開する */
  "cp:metrics-opt-out": "「集めないでほしい」という意思表示",
  /* 画面の状態。個人の値ではない */
  arb_layerMode: "盤の見せ方",
  arb_prefecture: "絞り込みの都道府県",
  arb_radiusKm: "絞り込みの半径",
  arb_targetDate: "見ている日付",
  arb_useTrueNorth: "真北で見るか",
  arb_searchArea: "地図の表示範囲",
  arb_base_map: "下地の種類",
  arb_zoning_on: "用途地域を重ねるか",
  arb_axis_prefs_v1: "一覧の並べ方",
  arbitrage_show_rings: "距離の輪を出すか",
  arbitrage_show_sectors: "方位の扇を出すか",
  arbitrage_show_spots: "名所を出すか",
  arbitrage_show_stations: "駅を出すか",
  dashboard_show_spots: "名所を出すか（ダッシュボード）",
  dashboard_show_stations: "駅を出すか（ダッシュボード）",
  simulator_show_spots: "名所を出すか（シミュレータ）",
  simulator_show_stations: "駅を出すか（シミュレータ）",
  map_theme: "地図の明暗",
  map_hazard_tab_v1: "災害情報のタブ",
  stc_activeTab: "ホームの時計のタブ",
  "cloud-palette:chunk-reload-at": "読み込み失敗の再試行時刻",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** src の中で localStorage の鍵として書かれている字面を集める。 */
function storageKeysInSource(): string[] {
  const found = new Set<string>();
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    /* localStorage.getItem("x") / storage.setItem("x", …) の直書き */
    for (const m of text.matchAll(
      /(?:localStorage|storage)\.(?:get|set|remove)Item\(\s*"([^"]+)"/g,
    )) {
      found.add(m[1]);
    }
    /* 定数に置いてから使う形（const XXX_KEY = "x"） */
    for (const m of text.matchAll(
      /(?:const|let)\s+[A-Z0-9_]*KEY[A-Z0-9_]*\s*=\s*"([^"]+)"/g,
    )) {
      found.add(m[1]);
    }
  }
  return [...found];
}

describe("端末に残る鍵の数え上げ", () => {
  it("消す一覧にも残す一覧にも入っていない鍵が無い", () => {
    const known = new Set<string>([
      ...ACCOUNT_LOCAL_KEYS,
      ...Object.keys(KEPT),
      /* 鍵ではないもの（開発用の伏せ字） */
      "dev_only_insecure_key_do_not_use_in_production",
    ]);
    const unknown = storageKeysInSource().filter((k) => !known.has(k));
    expect(unknown).toEqual([]);
  });

  it("数え上げが空回りしていない", () => {
    const keys = storageKeysInSource();
    expect(keys).toContain("tactical_config_v1");
    expect(keys).toContain("arb_birthDate");
    expect(keys.length).toBeGreaterThan(20);
  });

  it("生年月日と座標の写しは、必ず消す側にある", () => {
    /* 名前に birth / baseLat / baseLon を含む鍵は個人の値。残す側に
       置いてはいけない */
    const personal = storageKeysInSource().filter((k) =>
      /birth|baseLat|baseLon/i.test(k),
    );
    expect(personal.length).toBeGreaterThan(0);
    for (const key of personal) {
      expect(ACCOUNT_LOCAL_KEYS, key).toContain(key);
    }
  });

  it("計測の停止は消さない（消すと黙って再開する）", () => {
    expect(ACCOUNT_LOCAL_KEYS).not.toContain("cp:metrics-opt-out");
  });
});
