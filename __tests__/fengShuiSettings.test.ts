import { beforeEach, describe, expect, it } from "vitest";
import { SYNCED_FIELDS } from "@/lib/userSettings";
import {
  DEVICE_ONLY_KEYS,
  fengShuiActive,
  isDeviceOnly,
  readFengShuiSettings,
  writeFengShuiSettings,
} from "@/lib/fengShuiSettings";

/**
 * 風水の設定は**端末にだけ置く**という約束を固定する。
 *
 * いちばん大事なのは 1 つめのテスト。性別が `SYNCED_FIELDS` に入ると
 * クラウドへ送られる。**列は消せても、集めてしまったデータは消せない。**
 * あとから「同期できたほうが便利だから」と足されるのを、ここで止める。
 */
describe("同期しない約束", () => {
  it("風水の項目は SYNCED_FIELDS に入っていない", () => {
    for (const key of DEVICE_ONLY_KEYS) {
      expect(SYNCED_FIELDS as readonly string[]).not.toContain(key);
      expect(isDeviceOnly(key)).toBe(true);
    }
  });

  it("同期する項目は端末専用と判定されない（検算が空回りしていない）", () => {
    expect(isDeviceOnly("birth_date")).toBe(false);
  });
});

describe("読み書き", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("既定は未選択・無効", () => {
    expect(readFengShuiSettings()).toEqual({ sex: null, enabled: false });
  });

  it("書いたものが読める", () => {
    writeFengShuiSettings({ sex: "female", enabled: true });
    expect(readFengShuiSettings()).toEqual({ sex: "female", enabled: true });
  });

  it("片方だけ変えても、もう片方が消えない", () => {
    writeFengShuiSettings({ sex: "male", enabled: true });
    writeFengShuiSettings({ enabled: false });
    expect(readFengShuiSettings()).toEqual({ sex: "male", enabled: false });
  });

  it("同じ localStorage にある他の設定を巻き添えにしない", () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ birth_date: "1990-05-05" }),
    );
    writeFengShuiSettings({ sex: "male" });
    const raw = JSON.parse(localStorage.getItem("tactical_config_v1") ?? "{}");
    expect(raw.birth_date).toBe("1990-05-05");
  });

  it("知らない値は未選択として読む", () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ feng_shui_sex: "その他", feng_shui_enabled: "yes" }),
    );
    expect(readFengShuiSettings()).toEqual({ sex: null, enabled: false });
  });
});

describe("出せるかどうか", () => {
  it("性別が無ければ、切り替えが on でも出せない", () => {
    expect(fengShuiActive({ sex: null, enabled: true })).toBe(false);
  });

  it("切り替えが off なら、性別があっても出さない", () => {
    expect(fengShuiActive({ sex: "male", enabled: false })).toBe(false);
  });

  it("両方そろって初めて出す", () => {
    expect(fengShuiActive({ sex: "male", enabled: true })).toBe(true);
  });
});
