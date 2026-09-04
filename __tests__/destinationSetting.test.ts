import { beforeEach, describe, expect, it } from "vitest";
import { SYNCED_FIELDS } from "@/lib/userSettings";
import {
  DEST_LABEL,
  DEST_LAT,
  DEST_LON,
  DEVICE_ONLY_DESTINATION_KEYS,
  destinationSnapshot,
  isDeviceOnlyDestinationKey,
  parseDestinationSnapshot,
  readDestination,
  writeDestination,
  DESTINATION_SERVER_SNAPSHOT,
} from "@/lib/destinationSetting";

/**
 * 引越し先の候補（目的地）の保存。
 *
 * ## いちばん大事なのは「クラウドに出ていかない」こと
 *
 * 「どこへ引越すつもりか」は、生年月日や出発地よりさらに踏み込んだ
 * 情報になる。同期の対象（`SYNCED_FIELDS`）に**入れないと決めた**ので、
 * それを検査で固定する。あとから足すとこの検査が落ちる。
 *
 * 列は消せても、集めてしまったデータは revert では消えない。
 *
 * ## 壊れた値で「未設定」に倒す
 *
 * localStorage は人が編集できるし、古い版の書き込みも残る。緯度経度と
 * して成り立たない値をそのまま返すと、地図と判定に NaN が流れる。
 */

/** localStorage の代わり。テストごとに空にする。 */
function resetStorage() {
  window.localStorage.clear();
}

beforeEach(resetStorage);

describe("目的地はクラウドに送らない", () => {
  it("同期の対象に入っていない", () => {
    for (const key of DEVICE_ONLY_DESTINATION_KEYS) {
      expect(
        (SYNCED_FIELDS as readonly string[]).includes(key),
        `${key} が同期対象に入っている`,
      ).toBe(false);
      expect(isDeviceOnlyDestinationKey(key), key).toBe(true);
    }
  });

  it("鍵は 3 つだけ（増やすときはここも直す）", () => {
    expect([...DEVICE_ONLY_DESTINATION_KEYS]).toEqual([
      DEST_LAT,
      DEST_LON,
      DEST_LABEL,
    ]);
  });
});

describe("読み書き", () => {
  it("書いた値がそのまま読める", () => {
    writeDestination({ lat: 35.011, lon: 135.768, label: "京都市中京区" });
    expect(readDestination()).toEqual({
      lat: 35.011,
      lon: 135.768,
      label: "京都市中京区",
    });
  });

  it("変えたぶんだけ書く（ほかの設定を巻き添えにしない）", () => {
    /* 生年月日は別の画面が書く値。目的地を保存して消えたら事故 */
    window.localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ birth_date: "1990-01-19" }),
    );
    writeDestination({ lat: 34.7, lon: 135.5 });

    const raw = JSON.parse(
      window.localStorage.getItem("tactical_config_v1") ?? "{}",
    );
    expect(raw.birth_date).toBe("1990-01-19");
    expect(raw[DEST_LAT]).toBe(34.7);
  });

  it("何も渡さなければ書かない", () => {
    writeDestination({});
    expect(window.localStorage.getItem("tactical_config_v1")).toBeNull();
  });
});

describe("壊れた値は未設定に倒す", () => {
  it("範囲の外は読まない", () => {
    writeDestination({ lat: 999, lon: 135.7 });
    expect(readDestination().lat).toBeNull();
    expect(readDestination().lon).toBeNull();
  });

  it("片方だけでは使わない", () => {
    writeDestination({ lat: 35.0 });
    expect(readDestination().lat).toBeNull();
  });

  it("数値でない値は読まない", () => {
    window.localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ [DEST_LAT]: "35.0", [DEST_LON]: "135.7" }),
    );
    expect(readDestination().lat).toBeNull();
  });
});

describe("購読のための覚え", () => {
  it("同じ内容なら同じ文字列（再描画が止まる）", () => {
    writeDestination({ lat: 35.011, lon: 135.768, label: "京都" });
    expect(destinationSnapshot()).toBe(destinationSnapshot());
  });

  it("文字列から元の形に戻せる", () => {
    writeDestination({ lat: 35.011, lon: 135.768, label: "京都" });
    expect(parseDestinationSnapshot(destinationSnapshot())).toEqual({
      lat: 35.011,
      lon: 135.768,
      label: "京都",
    });
  });

  it("地名に区切り文字が入っても壊れない", () => {
    /* 覚えは | で区切る。地名に | が入ると分解でずれる */
    writeDestination({ lat: 35.011, lon: 135.768, label: "京都|中京" });
    expect(parseDestinationSnapshot(destinationSnapshot()).label).toBe(
      "京都|中京",
    );
  });

  it("サーバ側は未設定", () => {
    expect(parseDestinationSnapshot(DESTINATION_SERVER_SNAPSHOT)).toEqual({
      lat: null,
      lon: null,
      label: "",
    });
  });
});
