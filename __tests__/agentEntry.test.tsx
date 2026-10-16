import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { AgentEntry } from "@/components/home/AgentEntry";
import { McpExplorer } from "@/app/houi/mcp-explorer/McpExplorer";
import { SETTINGS_KEY } from "@/lib/userSettings";
import { clearLocalAccountData } from "@/lib/accountData";
vi.mock("next/dynamic", () => ({
  default: () =>
    function LazyChat() {
      return <div>遅延チャット</div>;
    },
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("初期HTMLには軽いフォームだけ。操作で初めてdynamicを描く", () => {
  const source = readFileSync("src/components/home/AgentEntry.tsx", "utf8");
  expect(source).toContain('dynamic(() => import("./HomeAgentChat")');
  expect(source).toContain("ssr: false");
  render(<AgentEntry />);
  expect(screen.queryByText("遅延チャット")).toBeNull();
  expect(
    screen.getByRole("link", { name: "詳しく見る" }).getAttribute("href"),
  ).toBe("/houi/mcp-explorer");
  fireEvent.click(screen.getByRole("button", { name: "質問の画面を開く" }));
  expect(screen.getByText("遅延チャット")).toBeTruthy();
});
it("同意前は保存値を読まず、記事の質問では生年月日を送らない。すべて消すも反映", async () => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ birth_date: "1990-05-05", base_label: "名古屋市中区" }),
  );
  const fetcher = vi
    .fn()
    .mockImplementation(async (url: string, init?: RequestInit) => {
      void init;
      if (url.includes("municipalities")) return Response.json({ names: [] });
      return new Response('{"type":"done","calls":0,"reasons":[]}\n', {
        headers: { "X-Agent-Remaining-Requests": "2" },
      });
    });
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer agentEnabled />);
  expect(screen.queryByText(/1990-05-05/)).toBeNull();
  fireEvent.click(screen.getByLabelText("保存済みの生年月日・出発地を使う"));
  fireEvent.change(screen.getByLabelText("質問"), {
    target: { value: "引越しの記事を教えて" },
  });
  fireEvent.click(screen.getByRole("button", { name: "AIに聞く" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  const posted = fetcher.mock.calls.find((c) => c[0] === "/api/mcp-chain");
  expect(JSON.parse(posted![1]!.body as string)).toEqual({
    mode: "llm",
    question: "引越しの記事を教えて",
  });
  await waitFor(() => expect(screen.getByText(/残り2回/)).toBeTruthy());
  fireEvent.change(screen.getByLabelText("質問"), {
    target: { value: "本命星を教えて" },
  });
  expect(screen.getByText(/今回送る保存値/).textContent).toContain(
    "1990-05-05",
  );
  fireEvent.click(screen.getByRole("button", { name: "AIに聞く" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter((c) => c[0] === "/api/mcp-chain"),
    ).toHaveLength(2),
  );
  const last = fetcher.mock.calls.filter((c) => c[0] === "/api/mcp-chain")[1];
  expect(JSON.parse(last[1]!.body as string).question).toContain("1990-05-05");
  // 実際の「すべて消す」の入口を使う。
  act(() => clearLocalAccountData(localStorage));
  await waitFor(() => expect(screen.queryByText(/今回送る保存値/)).toBeNull());
  expect((screen.getByLabelText("質問") as HTMLTextAreaElement).value).toBe("");
  expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
});
it("市区町村補完は同梱データのAPI、現在地は明示操作後だけ丸めて送る", async () => {
  const getCurrentPosition = vi
    .fn()
    .mockImplementation((callback) =>
      callback({ coords: { latitude: 35.123456, longitude: 139.123456 } }),
    );
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ data: { name: "東京都千代田区" } }));
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer />);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /現在地から/ }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/geocode/reverse?lat=35.12&lon=139.12",
    ),
  );
});
