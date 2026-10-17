import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ASK_DATA_STORAGE_KEY,
  ASK_CONVERSATION_STORAGE_KEY,
  McpExplorer,
} from "@/app/ask/McpExplorer";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.cookie = "sb-test-auth-token=; Max-Age=0; path=/";
  vi.unstubAllGlobals();
});

it("計算のみは分割NDJSONを受け取り、完了前から経過を描く", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(current) {
      controller = current;
    },
  });
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, body: stream, headers: new Headers() });
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer />);
  fireEvent.change(screen.getByLabelText("生年月日"), {
    target: { value: "1990-06-15" },
  });
  fireEvent.change(screen.getByLabelText("現在お住まいの市区町村"), {
    target: { value: "長崎市" },
  });
  fireEvent.click(screen.getByRole("button", { name: "道具を順番に呼び出す" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    birthDate: "1990-06-15",
    municipality: "長崎市",
    depth: 3,
  });
  const encoder = new TextEncoder();
  const line =
    JSON.stringify({
      type: "call",
      id: 1,
      parentId: null,
      depth: 0,
      tool: "search_municipality",
      input: { query: "長崎市" },
      output: { results: [] },
      summary: "検索が終わりました。",
      durationMs: 3,
    }) + "\n";
  const bytes = encoder.encode(line);
  await act(async () => {
    controller.enqueue(bytes.slice(0, 40));
  });
  expect(screen.queryByText("検索が終わりました。")).toBeNull();
  await act(async () => {
    controller.enqueue(bytes.slice(40));
  });
  expect(screen.getByText("検索が終わりました。")).toBeTruthy();
  expect(screen.getByRole("button", { name: "計算を中止" })).toBeTruthy();
  await act(async () => {
    controller.enqueue(
      encoder.encode(
        JSON.stringify({
          type: "done",
          calls: 1,
          reasons: ["深さの上限で打ち切りました。"],
        }) + "\n",
      ),
    );
    controller.close();
  });
  expect(screen.getByRole("status").textContent).toBe(
    "計算が完了しました。確認状況にお知らせがあります。",
  );
  expect(screen.getByText("深さの上限で打ち切りました。")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "計算を中止" })).toBeNull();
});

it("AIが無効なら計算フォームと短い注記を出す", () => {
  render(<McpExplorer agentEnabled={false} />);
  expect(
    screen.getByText("AI回答は現在無効です。計算の連鎖だけを表示します。"),
  ).toBeTruthy();
  expect(screen.getByLabelText("生年月日")).toBeTruthy();
  expect(screen.queryByLabelText("メッセージ")).toBeNull();
});

it("AI回答を逐次描き、道具の状態を利用者向けに折り畳む", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(current) {
      controller = current;
    },
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ remaining: { requests: 20 } }))
    .mockResolvedValue({ ok: true, body: stream, headers: new Headers() });
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer agentEnabled />);
  expect(screen.getByText(/Googleの生成AIに送ります/)).toBeTruthy();
  expect(screen.getByLabelText("生年月日")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /1990年5月5日生まれ/ }));
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
    mode: "llm",
    question: expect.stringContaining("深谷市"),
  });
  const encoder = new TextEncoder();
  const send = async (event: unknown) => {
    await act(async () => {
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
    });
  };
  await send({
    type: "tool-call",
    id: "1",
    tool: "get_honmei_star",
    input: { birthDate: "1990-05-05" },
  });
  expect(screen.getByText("確認に使った道具：1件")).toBeTruthy();
  expect(screen.getByText("本命星を確認")).toBeTruthy();
  await send({
    type: "tool-result",
    id: "1",
    tool: "get_honmei_star",
    summary: "本命星を確認しました。",
    output: { honmeiStar: 1 },
    durationMs: 12,
  });
  await send({ type: "text-delta", text: "道具で調べました。" });
  expect(screen.getByText("道具で調べました。")).toBeTruthy();
  expect(screen.getByText("本命星を確認しました。")).toBeTruthy();
  await send({ type: "text-delta", text: "参考情報です。" });
  expect(screen.getByText("道具で調べました。参考情報です。")).toBeTruthy();
  await send({ type: "text-delta", text: "\n\n**太" });
  await send({
    type: "text-delta",
    text: "字**\n\n- 項目\n\n[外部](https://example.com)",
  });
  expect(screen.getByText("太字").tagName).toBe("STRONG");
  expect(screen.getByText("項目").tagName).toBe("LI");
  expect(screen.getByText("外部").closest("a")).toBeNull();
  await send({
    type: "blocks",
    blocks: [
      { type: "callout", text: "確認済みの補足" },
      { type: "callout", text: "<script>bad</script>" },
    ],
  });
  expect(screen.getByText("確認済みの補足")).toBeTruthy();
  expect(screen.queryByText("<script>bad</script>")).toBeNull();
  await send({ type: "done", calls: 1, reasons: [] });
  await act(async () => controller.close());
  expect(screen.getByRole("status").textContent).toBe("回答ができました。");
  expect(screen.getByRole("status").textContent).not.toContain("1回");
  expect(screen.getByLabelText("次の質問の候補")).toBeTruthy();
});

it("追質問では履歴を送り、Enter送信・Shift+Enter改行・IME変換を区別する", async () => {
  const replies = ["最初の回答", "追質問への回答"];
  const fetcher = vi.fn(async (...[url]: [url: string, init?: RequestInit]) => {
    if (url.includes("status"))
      return Response.json({ remaining: { requests: 20 } });
    const reply = replies.shift() ?? "回答";
    return new Response(
      [
        JSON.stringify({ type: "text-delta", text: reply }),
        JSON.stringify({ type: "done", calls: 0, reasons: [] }),
        "",
      ].join("\n"),
      { headers: { "X-Agent-Remaining-Requests": "19" } },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer agentEnabled />);
  const input = screen.getByLabelText("メッセージ");
  fireEvent.change(input, { target: { value: "東京から西はどう？" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(
    fetcher.mock.calls.filter(([url]) => url === "/api/mcp-chain"),
  ).toHaveLength(0);
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
  expect(
    fetcher.mock.calls.filter(([url]) => url === "/api/mcp-chain"),
  ).toHaveLength(0);
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByText("最初の回答");
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "その中で家賃が安い街は？" },
  });
  fireEvent.keyDown(screen.getByLabelText("メッセージ"), { key: "Enter" });
  await screen.findByText("追質問への回答");
  const posts = fetcher.mock.calls.filter(([url]) => url === "/api/mcp-chain");
  expect(posts).toHaveLength(2);
  expect(JSON.parse(posts[1][1]!.body as string)).toMatchObject({
    question: "その中で家賃が安い街は？",
    history: [
      { role: "user", content: "東京から西はどう？" },
      { role: "assistant", content: "最初の回答" },
    ],
  });
});

it("複数会話・人物・相談メモを端末に復元し、新しい会話へメモを渡す", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (url.includes("status"))
      return Response.json({ remaining: { requests: 20 } });
    if (url.includes("municipalities")) return Response.json({ names: [] });
    return new Response(
      '{"type":"text-delta","text":"保存される回答"}\n{"type":"done","calls":0,"reasons":[]}\n',
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const first = render(<McpExplorer agentEnabled persistConversation />);
  fireEvent.change(screen.getByLabelText("人物の呼び名"), {
    target: { value: "本人" },
  });
  fireEvent.change(screen.getByLabelText("人物の生年月日"), {
    target: { value: "1990-05-05" },
  });
  fireEvent.change(screen.getByLabelText("人物の現住所"), {
    target: { value: "長崎市" },
  });
  fireEvent.click(screen.getByRole("button", { name: "人物を登録" }));
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "私の吉方位は？" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByText("保存される回答");
  await waitFor(() =>
    expect(localStorage.getItem(ASK_DATA_STORAGE_KEY)).toContain(
      "保存される回答",
    ),
  );
  expect(localStorage.getItem(ASK_CONVERSATION_STORAGE_KEY)).toBeNull();
  first.unmount();
  render(<McpExplorer agentEnabled persistConversation />);
  expect(await screen.findByText("保存される回答")).toBeTruthy();
  expect(screen.getByLabelText("本人を相談対象にする")).toBeTruthy();
  expect(screen.getByText(/相談内容：私の吉方位は？/)).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: /新しいチャット/ })[0]);
  expect(screen.queryByText("保存される回答")).toBeNull();
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "前回の相談を踏まえて次の候補は？" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await waitFor(() => {
    const posts = fetcher.mock.calls.filter(
      ([url]) => url === "/api/mcp-chain",
    );
    expect(JSON.parse(posts[1][1]!.body as string).memories[0]).toContain(
      "私の吉方位は？",
    );
  });
  await waitFor(() => {
    const stored = JSON.parse(
      localStorage.getItem(ASK_DATA_STORAGE_KEY) ?? "{}",
    );
    expect(stored.version).toBe(2);
    expect(stored.conversations).toHaveLength(2);
    expect(stored.people[0]).toMatchObject({
      name: "本人",
      birthDate: "1990-05-05",
      residence: "長崎市",
    });
  });
});

it("複数人を同じ質問へ添え、相談メモを画面から削除できる", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (url.includes("status"))
      return Response.json({ remaining: { requests: 20 } });
    return new Response(
      '{"type":"text-delta","text":"家族向けの回答"}\n{"type":"done","calls":0,"reasons":[]}\n',
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer agentEnabled persistConversation />);

  const addPerson = (name: string, birthDate: string, residence: string) => {
    fireEvent.change(screen.getByLabelText("人物の呼び名"), {
      target: { value: name },
    });
    fireEvent.change(screen.getByLabelText("人物の生年月日"), {
      target: { value: birthDate },
    });
    fireEvent.change(screen.getByLabelText("人物の現住所"), {
      target: { value: residence },
    });
    fireEvent.click(screen.getByRole("button", { name: "人物を登録" }));
  };
  addPerson("本人", "1990-05-05", "長崎市");
  fireEvent.click(screen.getByText("人物を追加"));
  const personEditor = screen.getByText("人物を追加").closest("details")!;
  fireEvent.change(screen.getByLabelText("人物の呼び名"), {
    target: { value: "配偶者" },
  });
  expect(personEditor.open).toBe(true);
  fireEvent.change(screen.getByLabelText("人物の呼び名"), {
    target: { value: "" },
  });
  addPerson("配偶者", "1992-08-10", "長崎市");
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "家族で引越すおすすめの方位を相談したい" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByText("家族向けの回答");
  const post = fetcher.mock.calls.find(([url]) => url === "/api/mcp-chain");
  expect(JSON.parse(post![1]!.body as string).people).toEqual([
    expect.objectContaining({ name: "本人", birthDate: "1990-05-05" }),
    expect.objectContaining({ name: "配偶者", birthDate: "1992-08-10" }),
  ]);
  expect(screen.getByText(/相談内容：家族で引越す/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "この相談メモを削除" }));
  expect(screen.queryByText(/相談内容：家族で引越す/)).toBeNull();
  await waitFor(() => {
    const stored = JSON.parse(
      localStorage.getItem(ASK_DATA_STORAGE_KEY) ?? "{}",
    );
    expect(stored.memories).toEqual([]);
  });
});

it("保存した会話を開き、名前変更と削除ができる", async () => {
  const now = "2026-10-17T00:00:00.000Z";
  localStorage.setItem(
    ASK_DATA_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      activeConversationId: "conversation_1",
      updatedAt: now,
      conversations: [
        {
          id: "conversation_1",
          title: "最初の相談",
          titleEdited: true,
          createdAt: now,
          updatedAt: now,
          messages: [{ role: "assistant", content: "最初の回答" }],
          draft: "",
          personIds: [],
        },
        {
          id: "conversation_2",
          title: "二つ目の相談",
          titleEdited: true,
          createdAt: now,
          updatedAt: now,
          messages: [{ role: "assistant", content: "二つ目の回答" }],
          draft: "",
          personIds: [],
        },
      ],
      people: [],
      memories: [
        {
          id: "memory_conversation_2",
          sourceConversationId: "conversation_2",
          text: "相談内容：二つ目の相談\n主な回答・結論：二つ目の結論",
          createdAt: now,
          updatedAt: now,
        },
      ],
    }),
  );
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ remaining: { requests: 20 } }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  render(<McpExplorer agentEnabled persistConversation />);
  expect(await screen.findByText("最初の回答")).toBeTruthy();
  const list = screen.getByLabelText("保存した会話");
  fireEvent.click(within(list).getByRole("button", { name: /二つ目の相談/ }));
  expect(await screen.findByText("二つ目の回答")).toBeTruthy();

  const secondItem = within(list)
    .getByRole("button", { name: /二つ目の相談/ })
    .closest("li")!;
  fireEvent.click(
    within(secondItem).getByRole("button", { name: "名前を変更" }),
  );
  fireEvent.change(within(secondItem).getByLabelText("会話タイトル"), {
    target: { value: "家族の引越し" },
  });
  fireEvent.click(within(secondItem).getByRole("button", { name: "保存" }));
  expect(
    within(list).getByRole("button", { name: /家族の引越し/ }),
  ).toBeTruthy();

  const renamedItem = within(list)
    .getByRole("button", { name: /家族の引越し/ })
    .closest("li")!;
  fireEvent.click(within(renamedItem).getByRole("button", { name: "削除" }));
  expect(await screen.findByText("最初の回答")).toBeTruthy();
  await waitFor(() => {
    const stored = JSON.parse(
      localStorage.getItem(ASK_DATA_STORAGE_KEY) ?? "{}",
    );
    expect(stored.conversations).toHaveLength(1);
    expect(stored.conversations[0].title).toBe("最初の相談");
    expect(stored.memories).toEqual([]);
    expect(stored.updatedAt).not.toBe(now);
  });
});

it("ログイン中でも空の初期値だけではアカウントへ書き込まない", async () => {
  document.cookie = "sb-test-auth-token=test; path=/";
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/ask-data") {
      if (init?.method === "POST") return Response.json({ success: true });
      return Response.json({ data: null });
    }
    return Response.json({ remaining: { requests: 20 } });
  });
  vi.stubGlobal("fetch", fetcher);

  render(<McpExplorer agentEnabled persistConversation />);
  expect(await screen.findByLabelText("メッセージ")).toBeTruthy();
  await act(() => new Promise((resolve) => window.setTimeout(resolve, 900)));

  expect(
    fetcher.mock.calls.filter(
      ([url, init]) => url === "/api/ask-data" && init?.method === "POST",
    ),
  ).toHaveLength(0);
});

it("回答中に別チャットへ移ると元の回答を中止状態にする", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(current) {
      controller = current;
    },
  });
  const fetcher = vi.fn(async (url: string) =>
    url.includes("status")
      ? Response.json({ remaining: { requests: 20 } })
      : new Response(stream),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer agentEnabled persistConversation />);

  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "引越し時期を相談したい" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  expect(
    await screen.findByRole("button", { name: "回答を中止" }),
  ).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: /新しいチャット/ })[0]);
  fireEvent.click(
    within(screen.getByLabelText("保存した会話")).getByRole("button", {
      name: /引越し時期を相談したい/,
    }),
  );
  expect(screen.getByText("回答を中止しました。")).toBeTruthy();
  await act(async () => controller.close());
});
