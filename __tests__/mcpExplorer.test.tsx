import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { McpExplorer } from "@/app/houi/mcp-explorer/McpExplorer";

afterEach(() => vi.unstubAllGlobals());
it("分割されたNDJSONを受け取り、完了前に呼び出しを描く", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
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
  fireEvent.change(screen.getByLabelText("出発地の市区町村名"), {
    target: { value: "長崎市" },
  });
  fireEvent.click(screen.getByRole("button", { name: "道具を順番に呼び出す" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
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
  expect(screen.getByRole("button", { name: "実行を中止する" })).toBeTruthy();
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
  expect(screen.getByRole("status").textContent).toContain("深さの上限");
  expect(screen.queryByRole("button", { name: "実行を中止する" })).toBeNull();
});

it("AIが無効なら決定的フォームと短い注記を出す", () => {
  render(<McpExplorer agentEnabled={false} />);
  expect(
    screen.getByText("AI回答は現在無効です。計算の連鎖だけを表示します。"),
  ).toBeTruthy();
  expect(screen.getByLabelText("生年月日")).toBeTruthy();
  expect(screen.queryByLabelText("質問")).toBeNull();
});

it("AIフォームは例文と送信先を示し、回答差分と道具の経緯を逐次描く", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ remaining: { requests: 20 } }))
    .mockResolvedValue({ ok: true, body: stream, headers: new Headers() });
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer agentEnabled />);
  expect(screen.getByText(/Googleの生成AIに送信/)).toBeTruthy();
  expect(screen.queryByLabelText("生年月日")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /1990年5月5日生まれ/ }));
  fireEvent.click(screen.getByRole("button", { name: "AIに聞く" }));
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
  expect(screen.getByText("get_honmei_star")).toBeTruthy();
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
  expect(screen.getByText("所要時間：12ms")).toBeTruthy();
  await send({ type: "text-delta", text: "参考情報です。" });
  expect(screen.getByText("道具で調べました。参考情報です。")).toBeTruthy();
  await send({ type: "done", calls: 1, reasons: [] });
  await act(async () => controller.close());
  expect(screen.getByRole("status").textContent).toContain("1回");
});
