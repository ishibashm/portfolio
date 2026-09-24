import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";
import { computeDayKigaku } from "@/lib/dayKigakuClient";
const context = {
  birthDate: "1990-01-10",
  targetDate: "2026-10-05",
  baseLat: "35",
  baseLon: "135",
  tenchusatsuMode: "strict",
  involuntaryMove: false,
  directionFilterMode: "composite",
  useClassical: true,
} as const;
const board = computeDayKigaku(context)!.byDirection;
function mount() {
  const onFocus = vi.fn();
  const props = {
    baseLat: 35,
    baseLon: 135,
    useClassical: true,
    candidateContext: context,
    dirKigaku: board,
    onFocus,
  };
  return { ...render(<SpotVerdict {...props} />), props, onFocus };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("listing candidate flow", () => {
  it("portal paste makes zero requests; asks for location and never persists draft", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const store = vi.spyOn(Storage.prototype, "setItem");
    mount();
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: "https://suumo.jp/chintai/123/?utm_source=test" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    expect(
      screen.getByText(/このURLだけでは物件の住所を特定できません/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "候補履歴に保存" }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
  it("requires map confirmation, preserves failed draft and retry key, resets on context change", async () => {
    const requests: Record<string, unknown>[] = [];
    let failures = 1;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      expect(String(url)).toBe("/api/relocation/candidates");
      requests.push(JSON.parse(String(init?.body)));
      return failures-- > 0
        ? new Response(JSON.stringify({ error: "一時的な障害" }), {
            status: 503,
          })
        : new Response(JSON.stringify({ candidate: { id: "ok" } }), {
            status: 201,
          });
    });
    const { rerender, props, onFocus } = mount();
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: "35.4,135.5" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    expect(
      screen.getByRole("button", { name: "候補履歴に保存" }),
    ).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "地図で所在地を確認する" }),
    );
    expect(onFocus).toHaveBeenCalledWith(35.4, 135.5);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(
      screen.getByRole("textbox", { name: "候補タイトル（任意）" }),
      { target: { value: "候補A" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "候補履歴に保存" }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("textbox", { name: "候補タイトル（任意）" }),
    ).toHaveValue("候補A");
    expect(
      screen.queryByText("候補履歴に保存しました。"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "候補履歴に保存" }));
    await screen.findByText("候補履歴に保存しました。");
    expect(requests[0].requestKey).toBe(requests[1].requestKey);
    expect(requests[1].target).toMatchObject({
      lat: 35.4,
      lon: 135.5,
      source: "coordinates",
      confirmed: true,
    });
    expect(requests[1]).not.toHaveProperty("tier");
    rerender(
      <SpotVerdict
        {...props}
        candidateContext={{ ...context, targetDate: "2026-10-06" }}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "候補履歴に保存" }),
      ).toBeDisabled(),
    );
    expect(
      screen.queryByText("候補履歴に保存しました。"),
    ).not.toBeInTheDocument();
  });
  it("same point cannot be judged or saved", () => {
    mount();
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: "35,135" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    expect(screen.getByRole("alert")).toHaveTextContent("方位は未定義");
    expect(
      screen.queryByRole("button", { name: "候補履歴に保存" }),
    ).not.toBeInTheDocument();
  });
});
