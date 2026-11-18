// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/userSettings", async (orig) => {
  const actual = await orig<typeof import("@/lib/userSettings")>();
  return {
    ...actual,
    readSettingsSync: vi.fn(() => ({
      birth_date: "1990-05-15T12:00",
      base_lat: 35.15,
      base_lon: 136.87,
    })),
    loadSettings: vi.fn(() => Promise.resolve({ settings: {} })),
  };
});

import { RelocationFormEnhancer } from "@/components/houi/RelocationFormEnhancer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function setup(search: string, resolvedPlace?: string) {
  window.history.replaceState(null, "", `/houi/relocation-calendar${search}`);
  document.body.innerHTML = `
    <form id="f">
      <input name="birthDate" type="date" />
      <input name="birthTime" type="time" />
      <input name="place" type="text" />
      <details><input name="lon" type="number" /></details>
    </form>
    <datalist id="l">
      <option value="東京都千代田区" data-lat="35.69" data-lon="139.75"></option>
      <option value="愛知県名古屋市中川区" data-lat="35.14" data-lon="136.86"></option>
    </datalist>
    <div id="root"></div>`;
  const root = createRoot(document.getElementById("root")!);
  act(() => {
    root.render(
      <RelocationFormEnhancer
        formId="f"
        listId="l"
        resolvedPlace={resolvedPlace}
      />,
    );
  });
  const value = (n: string) =>
    (document.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
  return { root, value };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("RelocationFormEnhancer", () => {
  it("prefills birth date and the nearest municipality from the saved profile", () => {
    const { value } = setup("");
    expect(value("birthDate")).toBe("1990-05-15");
    expect(value("place")).toBe("愛知県名古屋市中川区");
    expect(document.body.textContent).toContain("保存したプロフィールから");
  });
  it("restores the submitted values and the resolved place after a search", () => {
    const { value } = setup(
      "?birthDate=1980-01-02&place=%E5%BA%9C%E4%B8%AD&code=13206",
      "東京都府中市",
    );
    expect(value("birthDate")).toBe("1980-01-02");
    expect(value("place")).toBe("東京都府中市");
  });
  it("opens the longitude details for legacy lon URLs", () => {
    const { value } = setup("?birthDate=1980-01-02&lon=139.69");
    expect(value("lon")).toBe("139.69");
    expect(document.querySelector("details")!.open).toBe(true);
  });
});
