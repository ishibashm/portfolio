import React from "react";
import { renderToString } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MagneticCompass } from "@/components/houi/MagneticCompass";
import { GreatCircleGlobe } from "@/components/houi/GreatCircleGlobe";

const getCurrentPosition = vi.fn();
beforeEach(() => {
  localStorage.clear();
  getCurrentPosition.mockReset();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

for (const [name, Component] of [
  ["羅盤", () => <MagneticCompass />],
  ["地球儀", () => <GreatCircleGlobe areas={[]} />],
] as const) {
  describe(name, () => {
    it("未登録では質問を表示し、選択するまで計算しない", () => {
      const write = vi.spyOn(Storage.prototype, "setItem");
      const { container } = render(<Component />);
      expect(screen.getByText("どこから？")).toBeTruthy();
      expect(screen.getByRole("combobox", { name: "出発地" })).toHaveProperty(
        "value",
        "",
      );
      expect(
        container.querySelector("[data-needle], [data-gc-line]"),
      ).toBeNull();
      expect(getCurrentPosition).not.toHaveBeenCalled();
      fireEvent.change(screen.getByRole("combobox", { name: "出発地" }), {
        target: { value: "愛知県" },
      });
      expect(screen.queryByText("どこから？")).toBeNull();
      expect(
        container.querySelector("[data-needle], [data-gc-line]"),
      ).not.toBeNull();
      expect(write).not.toHaveBeenCalled();
    });

    it("保存済みの名古屋駅の座標をマウント後に使い、SSRでは未選択", () => {
      localStorage.setItem(
        "tactical_config_v1",
        JSON.stringify({ base_lat: 35.1709, base_lon: 136.8815 }),
      );
      const html = document.createElement("div");
      html.innerHTML = renderToString(<Component />);
      expect(html.querySelector("select")?.value).toBe("");
      render(<Component />);
      expect(screen.getByRole("combobox", { name: "出発地" })).toHaveProperty(
        "value",
        "愛知県",
      );
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it.each([
      { base_lat: 35.1709 },
      { base_lat: "35.1709", base_lon: 136.8815 },
      { base_lat: 100, base_lon: 136.8815 },
    ])("不完全・不正な保存値を既定県にしない: %j", (settings) => {
      localStorage.setItem("tactical_config_v1", JSON.stringify(settings));
      render(<Component />);
      expect(screen.getByText("どこから？")).toBeTruthy();
    });

    it("現在地はタップしたときだけ取得し、失敗後も県を選べる", () => {
      render(<Component />);
      fireEvent.click(screen.getByRole("button", { name: "現在地" }));
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      act(() => getCurrentPosition.mock.calls[0][1]({ code: 1 }));
      expect(screen.getByRole("alert").textContent).toContain(
        "県を選んでください",
      );
      fireEvent.change(screen.getByRole("combobox", { name: "出発地" }), {
        target: { value: "愛知県" },
      });
      expect(screen.queryByText("どこから？")).toBeNull();
    });

    it("現在地の名古屋駅から愛知県を選ぶが設定を書き換えない", () => {
      const write = vi.spyOn(Storage.prototype, "setItem");
      getCurrentPosition.mockImplementation((success) =>
        success({ coords: { latitude: 35.1709, longitude: 136.8815 } }),
      );
      render(<Component />);
      fireEvent.click(screen.getByRole("button", { name: "現在地" }));
      expect(screen.getByRole("combobox", { name: "出発地" })).toHaveProperty(
        "value",
        "愛知県",
      );
      expect(write).not.toHaveBeenCalled();
    });
  });
}
