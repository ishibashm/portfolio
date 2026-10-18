import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AskGuidancePanel } from "@/components/home/AskGuidancePanel";
import { guidancePlan } from "@/lib/askGuidance";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("不足2項目だけを入力し、揃うまで飛び先ボタンを無効にする", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      guidancePlan("move", {
        birthDate: "1990-05-05",
        municipality: "名古屋市中区",
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <AskGuidancePanel
      initial={guidancePlan("move", {})}
      onDismiss={() => {}}
    />,
  );
  expect(screen.getByLabelText("生年月日")).toHaveAttribute("type", "date");
  expect(
    screen.getByRole("button", { name: "計算ページを開く" }),
  ).toBeDisabled();
  expect(screen.queryByLabelText("検討する日")).toBeNull();
  fireEvent.change(screen.getByLabelText("生年月日"), {
    target: { value: "1990-05-05" },
  });
  fireEvent.change(screen.getByLabelText("出発地の市区町村"), {
    target: { value: "名古屋市中区" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "条件を確認する（AI不要）" }),
  );
  await screen.findByLabelText("検討する日");
  expect(screen.queryByLabelText("生年月日")).toBeNull();
  expect(screen.getAllByRole("radio")).toHaveLength(8);
  expect(localStorage.length).toBe(0);
});
it("プロフィールと前の相談は明示的な1タップでだけ再利用する", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      guidancePlan("move", {
        birthDate: "1990-05-05",
        municipality: "名古屋市中区",
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <AskGuidancePanel
      initial={guidancePlan("move", {})}
      saved={{
        name: "本人",
        birthDate: "1990-05-05",
        residence: "名古屋市中区",
      }}
      previous={{ date: "2026-11-05", direction: "E" }}
      onDismiss={() => {}}
    />,
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "前の相談の条件を使いますか？" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "本人の登録情報を使いますか？" }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
});
it("候補が揃えばリンクを表示し、今はしないで閉じられる", () => {
  const close = vi.fn();
  render(
    <AskGuidancePanel
      initial={{
        intent: "towns",
        values: {},
        fields: [],
        links: [
          {
            label: "東の街を見る",
            href: "/relocation/arbitrage?direction=E&baseLat=35&baseLon=136",
          },
        ],
      }}
      onDismiss={close}
    />,
  );
  expect(screen.getByRole("link", { name: "東の街を見る" })).toHaveAttribute(
    "href",
    "/relocation/arbitrage?direction=E&baseLat=35&baseLon=136",
  );
  fireEvent.click(screen.getByRole("button", { name: "今はしない" }));
  expect(close).toHaveBeenCalledOnce();
});
