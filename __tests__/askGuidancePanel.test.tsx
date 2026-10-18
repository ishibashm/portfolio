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
  expect(screen.getByRole("button", { name: "1990年代" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "計算ページを開く" }),
  ).toBeDisabled();
  expect(screen.queryByLabelText("検討する日")).toBeNull();
  pickBirth();
  await pickOrigin();
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

function pickBirth() {
  for (const name of ["1990年代", "1990年", "5月", "5日"])
    fireEvent.click(screen.getByRole("button", { name }));
}
async function pickOrigin() {
  fireEvent.click(screen.getByRole("button", { name: "選ぶ" }));
  fireEvent.click(await screen.findByRole("button", { name: "愛知県" }));
  fireEvent.click(screen.getByRole("button", { name: "名古屋市中村区" }));
}
function mockComplete() {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const { intent, values } = JSON.parse(String(init?.body));
    return Response.json({
      intent,
      values,
      fields: [],
      links: [
        {
          label: "計算結果",
          href: "/relocation/arbitrage?baseLat=35.17&baseLon=136.88",
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function completeBirth() {
  render(
    <AskGuidancePanel
      initial={guidancePlan("star", {})}
      onDismiss={() => {}}
    />,
  );
  pickBirth();
  fireEvent.click(
    screen.getByRole("button", { name: "条件を確認する（AI不要）" }),
  );
  await screen.findByRole("link", { name: "計算結果" });
}
const config = () =>
  JSON.parse(localStorage.getItem("tactical_config_v1") ?? "{}");

it("自分で選んだ日付だけを端末に保存し、保存選択を次回も使う", async () => {
  const fetcher = mockComplete();
  await completeBirth();
  expect(localStorage.length).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "保存する" }));
  expect(config()).toMatchObject({
    birth_date: "1990-05-05",
    consult_save_choice: "save",
  });
  cleanup();
  localStorage.setItem(
    "tactical_config_v1",
    JSON.stringify({ consult_save_choice: "save" }),
  );
  await completeBirth();
  expect(config().birth_date).toBe("1990-05-05");
  expect(screen.queryByText("この条件をこの端末に保存しますか？")).toBeNull();
  expect(screen.getByText(/保存しました/)).toBeTruthy();
  expect(fetcher.mock.calls.every(([url]) => url === "/api/ask-guidance")).toBe(
    true,
  );
});
it("今回だけを記憶し、保存するから変更できる", async () => {
  mockComplete();
  await completeBirth();
  fireEvent.click(screen.getByRole("button", { name: "今回だけ" }));
  expect(config().consult_save_choice).toBe("once");
  expect(config().birth_date).toBeUndefined();
  cleanup();
  await completeBirth();
  expect(screen.queryByText("この条件をこの端末に保存しますか？")).toBeNull();
  expect(config().birth_date).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "保存する" }));
  expect(config()).toMatchObject({
    birth_date: "1990-05-05",
    consult_save_choice: "save",
  });
});
it("月日不明の本命星は代表日を送り、保存しない", async () => {
  const fetcher = mockComplete();
  localStorage.setItem(
    "tactical_config_v1",
    JSON.stringify({ consult_save_choice: "save" }),
  );
  render(
    <AskGuidancePanel
      initial={guidancePlan("star", {})}
      onDismiss={() => {}}
    />,
  );
  for (const name of [
    "1990年代",
    "1990年",
    "月日がわからない",
    "条件を確認する（AI不要）",
  ])
    fireEvent.click(screen.getByRole("button", { name }));
  await screen.findByRole("link", { name: "計算結果" });
  expect(
    JSON.parse(String(fetcher.mock.calls[0][1]?.body)).values.birthDate,
  ).toBe("1990-07-01");
  expect(screen.getByText(/年の代表日（7月1日）/)).toBeTruthy();
  expect(config().birth_date).toBeUndefined();
  expect(screen.queryByText("この条件をこの端末に保存しますか？")).toBeNull();
});
it("登録プロフィールの再利用では保存も保存選択の質問もしない", async () => {
  mockComplete();
  render(
    <AskGuidancePanel
      initial={guidancePlan("star", {})}
      saved={{ name: "本人", birthDate: "1990-05-05" }}
      onDismiss={() => {}}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "本人の登録情報を使いますか？" }),
  );
  await screen.findByRole("link", { name: "計算結果" });
  expect(localStorage.length).toBe(0);
  expect(screen.queryByText("この条件をこの端末に保存しますか？")).toBeNull();
});
it("既存の生年月日や別地点の座標を上書きしない", async () => {
  mockComplete();
  const existing = {
    birth_date: "1988-02-29",
    base_label: "東京駅",
    base_lat: 35.681236,
    base_lon: 139.767125,
    consult_save_choice: "save",
  };
  localStorage.setItem("tactical_config_v1", JSON.stringify(existing));
  render(
    <AskGuidancePanel
      initial={guidancePlan("move", {})}
      onDismiss={() => {}}
    />,
  );
  pickBirth();
  await pickOrigin();
  fireEvent.click(
    screen.getByRole("button", { name: "条件を確認する（AI不要）" }),
  );
  await screen.findByRole("link", { name: "計算結果" });
  expect(config()).toEqual(existing);
});
it("自分で選んだ出発地とリンクの代表座標を保存する", async () => {
  mockComplete();
  render(
    <AskGuidancePanel
      initial={guidancePlan("towns", { direction: "E" })}
      onDismiss={() => {}}
    />,
  );
  await pickOrigin();
  fireEvent.click(
    screen.getByRole("button", { name: "条件を確認する（AI不要）" }),
  );
  await screen.findByRole("link", { name: "計算結果" });
  fireEvent.click(screen.getByRole("button", { name: "保存する" }));
  expect(config()).toMatchObject({
    base_label: "愛知県名古屋市中村区",
    base_lat: 35.17,
    base_lon: 136.88,
  });
});
it("検討日はチップで選んで送る", async () => {
  const fetcher = mockComplete();
  render(
    <AskGuidancePanel
      initial={guidancePlan("move", {
        birthDate: "1990-05-05",
        municipality: "名古屋市中村区",
      })}
      onDismiss={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "今日" }));
  fireEvent.click(screen.getByRole("radio", { name: "東" }));
  fireEvent.click(
    screen.getByRole("button", { name: "条件を確認する（AI不要）" }),
  );
  await screen.findByRole("link", { name: "計算結果" });
  expect(
    JSON.parse(String(fetcher.mock.calls[0][1]?.body)).values.date,
  ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(localStorage.length).toBe(0);
});

it("候補検索とサーバーの候補ボタンから続けられる", async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const { intent, values, action } = JSON.parse(String(init?.body));
    return Response.json(
      action === "search"
        ? {
            intent,
            values,
            fields: ["municipality"],
            links: [],
            candidates: [{ code: "23105", name: "愛知県名古屋市中村区" }],
          }
        : {
            intent,
            values,
            fields: [],
            links: [
              {
                label: "計算結果",
                href: "/relocation/arbitrage?baseLat=35.17&baseLon=136.88",
              },
            ],
          },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  localStorage.setItem(
    "tactical_config_v1",
    JSON.stringify({ consult_save_choice: "save" }),
  );
  render(
    <AskGuidancePanel
      initial={guidancePlan("towns", { direction: "E" })}
      onDismiss={() => {}}
    />,
  );
  await pickOrigin();
  fireEvent.click(screen.getByRole("button", { name: "市区町村の候補を探す" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "愛知県名古屋市中村区" }),
  );
  await screen.findByRole("link", { name: "計算結果" });
  expect(config()).toMatchObject({
    base_label: "愛知県名古屋市中村区",
    base_lat: 35.17,
    base_lon: 136.88,
  });
});
it("端末の登録情報を明示的に再利用しても書き直さない", async () => {
  const fetcher = mockComplete();
  const existing = {
    birth_date: "1990-05-05T12:00",
    consult_save_choice: "save",
  };
  localStorage.setItem("tactical_config_v1", JSON.stringify(existing));
  render(
    <AskGuidancePanel
      initial={guidancePlan("star", {})}
      onDismiss={() => {}}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "この端末の登録情報を使いますか？" }),
  );
  await screen.findByRole("link", { name: "計算結果" });
  expect(config()).toEqual(existing);
  expect(screen.queryByText(/保存しました/)).toBeNull();
  expect(
    JSON.parse(String(fetcher.mock.calls[0][1]?.body)).values.birthDate,
  ).toBe("1990-05-05");
});
