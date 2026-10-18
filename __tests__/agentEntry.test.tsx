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
import { McpExplorer } from "@/app/ask/McpExplorer";
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
it("ホームは入力欄やチャットJSを持たず、固定選択肢で会話を始める", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ enabled: true, paused: null })),
  );
  const source = readFileSync("src/components/home/AgentEntry.tsx", "utf8");
  expect(source).not.toContain("HomeAgentChat");
  render(<AgentEntry />);
  expect(screen.queryByRole("textbox")).toBeNull();
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "引越しを考えている" }),
    ).toHaveAttribute("href", "/ask?start=move"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "よくある質問（AI不要）" }),
  );
  expect(screen.getByText("AIを使わずに調べられますか？")).toBeTruthy();
});
it.each(["billing", true])(
  "停止時はAI導線を計算ページへ切り替える: %s",
  async (paused) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ enabled: true, paused })),
    );
    render(<AgentEntry />);
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /引越しを考えている/ }),
      ).toHaveAttribute("href", "/relocation/arbitrage"),
    );
    expect(
      screen.queryByRole("link", { name: "引越しを考えている" }),
    ).toBeNull();
  },
);
it("登録内容を人物候補へ統合し、必要な質問だけ送る。すべて消すも反映", async () => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ birth_date: "1990-05-05", base_label: "浜松市中央区" }),
  );
  const fetcher = vi
    .fn()
    .mockImplementation(async (url: string, init?: RequestInit) => {
      void init;
      if (url.includes("status"))
        return Response.json({ remaining: { requests: 20 } });
      if (url === "/api/user-config" || url === "/api/profile-presets")
        return Response.json({}, { status: 401 });
      if (url.includes("municipalities")) return Response.json({ names: [] });
      return new Response(
        '{"type":"text-delta","text":"回答"}\n{"type":"done","calls":0,"reasons":[]}\n',
        { headers: { "X-Agent-Remaining-Requests": "2" } },
      );
    });
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer agentEnabled persistConversation />);
  const registeredPerson = await screen.findByRole("button", {
    name: "本人を相談対象に選ぶ",
  });
  expect(registeredPerson.textContent).toContain("1990-05-05・浜松市中央区");
  fireEvent.click(registeredPerson);
  expect(
    screen.getByRole("button", { name: "本人を相談対象から外す" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "引越しの記事を教えて" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  const posted = fetcher.mock.calls.find((c) => c[0] === "/api/mcp-chain");
  expect(JSON.parse(posted![1]!.body as string)).toEqual({
    mode: "llm",
    question: "引越しの記事を教えて",
    // 保存の提案を会話ごとに 1 回へ絞るための鍵だけを足す（人を指さない）。
    conversationKey: expect.stringMatching(/^[A-Za-z0-9_-]{8,100}$/),
  });
  await waitFor(() => expect(screen.getByText(/残り2回/)).toBeTruthy());
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "本命星を教えて" },
  });
  expect(
    screen.getByText(/この質問と一緒に送る相談対象/).textContent,
  ).toContain("本人");
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter((c) => c[0] === "/api/mcp-chain"),
    ).toHaveLength(2),
  );
  const last = fetcher.mock.calls.filter((c) => c[0] === "/api/mcp-chain")[1];
  expect(JSON.parse(last[1]!.body as string).people).toEqual([
    expect.objectContaining({
      name: "本人",
      birthDate: "1990-05-05",
    }),
  ]);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("メッセージ") as HTMLTextAreaElement).disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "九星気学の仕組みを教えて" },
  });
  expect(
    screen.getByText("この質問では人物プロフィールを送信しません。"),
  ).toBeTruthy();
  // 実際の「すべて消す」の入口を使う。
  act(() => clearLocalAccountData(localStorage));
  await waitFor(() =>
    expect(screen.queryByText(/この質問と一緒に送る相談対象/)).toBeNull(),
  );
  expect(
    (screen.getByLabelText("メッセージ") as HTMLTextAreaElement).value,
  ).toBe("");
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
