/**
 * 使用中のプロフィールを切り替える部品（ProfilePicker）。
 *
 * 4 画面にあった独自の「呼び出し・名前を付けて保存」をこれ 1 つにする
 * （利用者の指摘、2026-09-12）。選ぶだけで、名前の欄や保存ボタンは
 * 持たない。選ぶと設定に書かれ、使用中の旗が立つ。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfilePicker } from "@/components/profile/ProfilePicker";
import { SETTINGS_KEY } from "@/lib/userSettings";

const PRESETS_KEY = "profile_presets_v1";
const me = {
  id: "p-me",
  name: "自分",
  birthDate: "1990-01-02",
  baseLat: 35.6,
  baseLon: 139.7,
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
};
const partner = {
  id: "p-partner",
  name: "妻",
  birthDate: "1992-05-06",
  baseLat: 34.7,
  baseLon: 135.5,
  createdAt: "2026-09-02T00:00:00.000Z",
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(PRESETS_KEY, JSON.stringify([me, partner]));
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      birth_date: "1990-01-02",
      base_lat: 35.6,
      base_lon: 139.7,
    }),
  );
  /* 未ログイン。控えは端末、設定の POST も 401 */
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
  );
});

describe("ProfilePicker", () => {
  it("使用中の 1 件が選ばれていて、名前の欄や保存ボタンは無い", async () => {
    render(<ProfilePicker />);
    const select = (await screen.findByLabelText(
      "使用中のプロフィール",
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("p-me"));
    expect(screen.queryByPlaceholderText(/名前/)).toBeNull();
    expect(screen.queryByText(/保存/)).toBeNull();
  });

  it("選ぶと設定に書かれ、使用中が切り替わる", async () => {
    render(<ProfilePicker />);
    const select = (await screen.findByLabelText(
      "使用中のプロフィール",
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("p-me"));
    fireEvent.change(select, { target: { value: "p-partner" } });
    await waitFor(() =>
      expect(screen.getByText(/「妻」を使用中にしました/)).toBeInTheDocument(),
    );
    const settings = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? "{}",
    );
    expect(settings.birth_date).toBe("1992-05-06");
    const stored = JSON.parse(window.localStorage.getItem(PRESETS_KEY) ?? "[]");
    expect(
      stored.find((p: { id: string }) => p.id === "p-partner").active,
    ).toBe(true);
    expect(
      stored.find((p: { id: string }) => p.id === "p-me").active,
    ).toBeUndefined();
  });
});
