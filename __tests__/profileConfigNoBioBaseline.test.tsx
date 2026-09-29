import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PersonalProfileConfig } from "@/components/PersonalProfileConfig";

/**
 * 今日の方位と時刻の「本命星と天中殺」の詳細設定から、体調の基準値
 * （HRV・GSR）を外した（利用者の判断、2026-09-28「履歴・生体は頁から
 * 外す」）。比べる先の「履歴」タブを外したので入れても見る所が無く、
 * GSR 標準偏差の欄は親から値が渡されずに常に空だった。開閉ボタンの
 * 「API キー」も、欄が消えた後に文言だけ残っていた。
 */

it("詳細設定を開いても、体調の基準値と API キーは出ない", () => {
  const noop = vi.fn();
  render(
    <PersonalProfileConfig
      birthDate="1985-04-10"
      setBirthDate={noop}
      birthLat={35.0116}
      setBirthLat={noop}
      birthLon={135.7681}
      setBirthLon={noop}
      baseLat={35.0116}
      setBaseLat={noop}
      baseLon={135.7681}
      setBaseLon={noop}
    />,
  );
  const toggle = screen.getByRole("button", { name: /詳細設定/ });
  expect(toggle.textContent).not.toMatch(/API キー|体調の基準値/);
  fireEvent.click(toggle);
  expect(screen.queryByText(/HRV/)).toBeNull();
  expect(screen.queryByText(/GSR/)).toBeNull();
  expect(screen.queryByText(/体調の基準値/)).toBeNull();
  /* 残した詳細設定（天中殺の上書きなど）は開いている */
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});
