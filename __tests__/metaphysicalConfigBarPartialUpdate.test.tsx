import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MetaphysicalConfigBar,
  mergeConfigUpdate,
  type MetaphysicalConfig,
} from "@/components/layout/MetaphysicalConfigBar";

/**
 * 設定バーは、他の部品からの「設定が変わった」通知（項目が一部しか無い）
 * で、載っていない項目を消さない。
 *
 * 物件検索の日付変更は 4 項目だけの detail を投げる。以前はその detail で
 * setConfig を丸ごと差し替えていたので、日付を変えた瞬間にバーの
 * 生年月日・出生地・出発地・時支の基準・月盤の連動が state から消えた。
 * その後バーで何かを保存すると physical_month_mode が既定（independent）
 * に戻り、利用者が選んだ「連動」が黙って外れていた。
 */

const SAVED: MetaphysicalConfig = {
  targetDate: "2026-09-08",
  useClassicalBoard: true,
  zodiacTimeBasis: "solar",
  physicalMonthMode: "coupled",
  directionFilterMode: "composite",
  actionIntent: "DEFAULT",
  birthDate: "1990-05-15T12:00",
  birthLat: 34.7,
  birthLon: 135.5,
  baseLat: 35.0,
  baseLon: 135.8,
};

describe("mergeConfigUpdate", () => {
  it("detail に無い項目は前の値を残す", () => {
    const merged = mergeConfigUpdate(SAVED, {
      targetDate: "2026-10-01",
      useClassicalBoard: false,
      directionFilterMode: "personal_kigaku",
      actionIntent: "MIGRATION",
    });
    expect(merged.targetDate).toBe("2026-10-01");
    expect(merged.useClassicalBoard).toBe(false);
    expect(merged.directionFilterMode).toBe("personal_kigaku");
    expect(merged.actionIntent).toBe("MIGRATION");
    // 以前はここが全部 undefined になっていた
    expect(merged.birthDate).toBe(SAVED.birthDate);
    expect(merged.birthLat).toBe(SAVED.birthLat);
    expect(merged.baseLat).toBe(SAVED.baseLat);
    expect(merged.physicalMonthMode).toBe("coupled");
    expect(merged.zodiacTimeBasis).toBe("solar");
  });

  it("undefined の項目は「変えない」", () => {
    const merged = mergeConfigUpdate(SAVED, {
      targetDate: "2026-10-01",
      birthLat: undefined,
      birthLon: undefined,
    });
    expect(merged.birthLat).toBe(SAVED.birthLat);
    expect(merged.birthLon).toBe(SAVED.birthLon);
  });

  it("知らない値は既定に倒す（normalize は今までどおり）", () => {
    const merged = mergeConfigUpdate(SAVED, {
      directionFilterMode:
        "optimal_only" as MetaphysicalConfig["directionFilterMode"],
    });
    expect(merged.directionFilterMode).toBe("composite");
  });
});

describe("MetaphysicalConfigBar と一部だけの通知", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("日付だけの通知で生年月日・出発地・月盤の連動が消えない", async () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({
        birth_date: SAVED.birthDate,
        birth_lat: SAVED.birthLat,
        birth_lon: SAVED.birthLon,
        base_lat: SAVED.baseLat,
        base_lon: SAVED.baseLon,
        physical_month_mode: "coupled",
        zodiac_time_basis: "solar",
        use_classical_board: true,
        direction_filter_mode: "composite",
        action_intent: "DEFAULT",
      }),
    );
    const onConfigChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<MetaphysicalConfigBar onConfigChange={onConfigChange} />);
      await Promise.resolve();
    });
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ birthDate: SAVED.birthDate }),
    );

    // 物件検索の日付変更と同じ 4 項目だけの通知
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("metaphysical-config-updated", {
          detail: {
            targetDate: "2026-10-01",
            useClassicalBoard: true,
            directionFilterMode: "composite",
            actionIntent: "DEFAULT",
          },
        }),
      );
      await Promise.resolve();
    });

    const last = onConfigChange.mock.calls.at(-1)?.[0] as MetaphysicalConfig;
    expect(last.targetDate).toBe("2026-10-01");
    expect(last.birthDate).toBe(SAVED.birthDate);
    expect(last.baseLat).toBe(SAVED.baseLat);
    expect(last.physicalMonthMode).toBe("coupled");
    expect(last.zodiacTimeBasis).toBe("solar");

    await act(async () => root.unmount());
    container.remove();
  });
});
