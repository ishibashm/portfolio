import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ASK_CONVERSATION_STORAGE_KEY,
  McpExplorer,
} from "@/app/ask/McpExplorer";

afterEach(() => {
  cleanup();
  localStorage.clear();
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

it("会話とプロフィールを端末に復元し、新しいチャットで会話だけを消す", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("status"))
      return Response.json({ remaining: { requests: 20 } });
    if (url.includes("municipalities")) return Response.json({ names: [] });
    return new Response(
      '{"type":"text-delta","text":"保存される回答"}\n{"type":"done","calls":0,"reasons":[]}\n',
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const first = render(<McpExplorer agentEnabled persistConversation />);
  fireEvent.change(screen.getByLabelText("生年月日"), {
    target: { value: "1990-05-05" },
  });
  fireEvent.change(screen.getByLabelText("現在お住まいの市区町村"), {
    target: { value: "長崎市" },
  });
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "私の吉方位は？" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByText("保存される回答");
  await waitFor(() =>
    expect(localStorage.getItem(ASK_CONVERSATION_STORAGE_KEY)).toContain(
      "保存される回答",
    ),
  );
  first.unmount();
  render(<McpExplorer agentEnabled persistConversation />);
  expect(await screen.findByText("保存される回答")).toBeTruthy();
  expect((screen.getByLabelText("生年月日") as HTMLInputElement).value).toBe(
    "1990-05-05",
  );
  expect(
    (screen.getByLabelText("現在お住まいの市区町村") as HTMLInputElement).value,
  ).toBe("長崎市");
  fireEvent.click(screen.getByRole("button", { name: /新しいチャット/ }));
  expect(screen.queryByText("保存される回答")).toBeNull();
  await waitFor(() => {
    const stored = JSON.parse(
      localStorage.getItem(ASK_CONVERSATION_STORAGE_KEY) ?? "{}",
    );
    expect(stored.messages).toEqual([]);
    expect(stored.profile.birthDate).toBe("1990-05-05");
  });
});
