import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { McpExplorer, ASK_DATA_STORAGE_KEY } from "@/app/ask/McpExplorer";
import { SETTINGS_KEY } from "@/lib/userSettings";

vi.mock("@/components/home/AgentBirthYear", () => ({
  AgentBirthYear: () => null,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const now = "2026-10-18T00:00:00.000Z";
function workspace(
  count: number,
  active = false,
  messages: { role: string; content: string }[] = [],
) {
  localStorage.setItem(
    ASK_DATA_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      activeConversationId: "chat",
      updatedAt: now,
      conversations: [
        {
          id: "chat",
          title: "相談",
          createdAt: now,
          updatedAt: now,
          messages,
          personIds: [],
        },
      ],
      people: Array.from({ length: count }, (_, i) => ({
        id: `p${i}`,
        name: `見本${i}`,
        birthDate: "1990-04-15",
        active: active && i === 1,
        createdAt: now,
        updatedAt: now,
      })),
      memories: [],
    }),
  );
}
function mockRequests() {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("status"))
        return Response.json({ remaining: { requests: 20 } });
      if (url === "/api/mcp-chain") {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(
          '{"type":"text-delta","text":"下のボタンで選んでください。"}\n{"type":"done","calls":0,"reasons":[],"answerFields":["birthYear","origin","period"]}\n',
        );
      }
      return Response.json({}, { status: 401 });
    }),
  );
  return requests;
}
it.each([
  { count: 2, active: true, selected: "見本1" },
  { count: 1, active: false, selected: "見本0" },
  { count: 2, active: false, selected: undefined },
])(
  "新規会話の自動選択: $count 人 / active=$active",
  async ({ count, active, selected }) => {
    workspace(count, active);
    mockRequests();
    render(<McpExplorer agentEnabled persistConversation />);
    await screen.findByLabelText("メッセージ");
    if (selected)
      await screen.findByRole("button", {
        name: `${selected}を相談対象から外す`,
      });
    else
      expect(
        screen.queryByRole("button", { name: /相談対象から外す/ }),
      ).toBeNull();
    fireEvent.change(screen.getByLabelText("メッセージ"), {
      target: { value: "別の相談" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "＋ 新しいチャット" })[0],
    );
    if (selected)
      await screen.findByRole("button", {
        name: `${selected}を相談対象から外す`,
      });
    else
      expect(
        screen.queryByRole("button", { name: /相談対象から外す/ }),
      ).toBeNull();
  },
);
it("登録人物が非同期で届いてから選択し、×解除は再読込後も保ち、生年ボタンを出す", async () => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      birth_date: "1990-04-15",
      base_lat: 35.1709,
      base_lon: 136.8815,
      base_label: "名古屋駅",
    }),
  );
  const requests = mockRequests();
  const first = render(<McpExplorer agentEnabled persistConversation />);
  fireEvent.click(
    await screen.findByRole("button", { name: "本人を相談対象から外す" }),
  );
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem(ASK_DATA_STORAGE_KEY)!);
    expect(saved.conversations[0]).toMatchObject({
      personIds: [],
      personSelectionChanged: true,
    });
  });
  first.unmount();
  render(<McpExplorer agentEnabled persistConversation />);
  await screen.findByLabelText("メッセージ");
  expect(screen.queryByRole("button", { name: /相談対象から外す/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "引越しを考えています。日付と方位を相談したいです。" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByText("生まれ年は？");
  expect(requests[0].people).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "1990年代" }));
  expect(screen.getByRole("button", { name: "1990年" })).toBeTruthy();
});
it("メッセージがある既存会話の相談対象は変更しない", async () => {
  workspace(2, true, [{ role: "user", content: "引越しを相談したい" }]);
  mockRequests();
  render(<McpExplorer agentEnabled persistConversation />);
  await screen.findByLabelText("メッセージ");
  expect(screen.queryByRole("button", { name: /相談対象から外す/ })).toBeNull();
});

it("空の会話で解除しても、新しいチャットでは再び自動選択する", async () => {
  workspace(1);
  mockRequests();
  render(<McpExplorer agentEnabled persistConversation />);
  fireEvent.click(
    await screen.findByRole("button", { name: "見本0を相談対象から外す" }),
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: "＋ 新しいチャット" })[0],
  );
  await screen.findByRole("button", { name: "見本0を相談対象から外す" });
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem(ASK_DATA_STORAGE_KEY)!);
    expect(saved.conversations).toHaveLength(2);
    expect(
      saved.conversations.find((c: { id: string }) => c.id === "chat"),
    ).toMatchObject({ personIds: [], personSelectionChanged: true });
  });
});

it("受信候補も道具結果で地名を照合し、根拠のない候補を表示しない", async () => {
  workspace(0);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("status"))
        return Response.json({ remaining: { requests: 20 } });
      if (url !== "/api/mcp-chain") return Response.json({}, { status: 401 });
      return new Response(
        [
          {
            type: "tool-result",
            id: "place",
            tool: "search_municipality",
            output: { results: [{ name: "名古屋市中村区" }] },
          },
          { type: "text-delta", text: "候補を確認できます。" },
          {
            type: "done",
            calls: 1,
            reasons: [],
            suggestions: [
              "出発地を東京都新宿区に指定する",
              "南西の街を3つ教えて",
              "名古屋市中村区の吉日を詳しく",
            ],
          },
        ]
          .map((event) => JSON.stringify(event))
          .join("\n") + "\n",
      );
    }),
  );
  render(<McpExplorer agentEnabled persistConversation />);
  fireEvent.change(await screen.findByLabelText("メッセージ"), {
    target: { value: "引越しを相談したい" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByRole("button", { name: "名古屋市中村区の吉日を詳しく" });
  expect(
    screen.getByRole("button", { name: "南西の街を3つ教えて" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "出発地を東京都新宿区に指定する" }),
  ).toBeNull();
});
