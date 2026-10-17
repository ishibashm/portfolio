import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASK_DATA_STORAGE_KEY, McpExplorer } from "@/app/ask/McpExplorer";
import { parseAskWorkspaceJson, type AskWorkspace } from "@/lib/askData";
import { saveOfferCard } from "@/lib/saveOffer";
import {
  readResumeParam,
  stashConversationForResume,
  withResumedConversation,
} from "@/lib/saveOfferResume";

const originalLocation = window.location;
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.cookie = "sb-test-auth-token=; Max-Age=0; path=/";
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  window.history.replaceState(null, "", "/");
});

function streamingFetch() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(current) {
      controller = current;
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/mcp-chain")
      return { ok: true, body: stream, headers: new Headers() };
    if (url === "/api/save-offer") return Response.json({ ok: true });
    return Response.json({ remaining: { requests: 20 } });
  });
  const encoder = new TextEncoder();
  const send = async (event: unknown) => {
    await act(async () => {
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
    });
  };
  return { fetcher, send, close: () => act(async () => controller.close()) };
}

async function askWithOffer() {
  const { fetcher, send, close } = streamingFetch();
  vi.stubGlobal("fetch", fetcher);
  render(<McpExplorer agentEnabled />);
  fireEvent.click(screen.getByRole("button", { name: "人物情報なしで相談" }));
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "1990年5月5日生まれ、深谷市から東は？" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => url === "/api/mcp-chain")).toBe(
      true,
    ),
  );
  const body = JSON.parse(
    (
      fetcher.mock.calls.find(
        ([url]) => url === "/api/mcp-chain",
      ) as unknown as [string, RequestInit]
    )[1].body as string,
  );
  await send({ type: "text-delta", text: "東は吉方位です。" });
  const card = saveOfferCard(body.conversationKey);
  await send({ type: "save-offer", offer: card });
  // 同じ回答の中で 2 回届いても重ねない。
  await send({ type: "save-offer", offer: card });
  await send({ type: "done", calls: 1, reasons: [] });
  await close();
  return { fetcher, body };
}

describe("保存の提案カード", () => {
  it("会話の鍵を送り、サーバーの文面と保存項目を出し、2 つのボタンは同じ見た目", async () => {
    const { fetcher, body } = await askWithOffer();
    expect(body.conversationKey).toMatch(/^home_/);
    expect(screen.getAllByText("この相談を保存しておきますか？")).toHaveLength(
      1,
    );
    expect(screen.getByText("保存される内容")).toBeTruthy();
    expect(
      screen.getByText(/ログインに使う Google アカウントのメールアドレス/),
    ).toBeTruthy();
    const accept = screen.getByRole("button", { name: "結果を保存する" });
    const decline = screen.getByRole("button", { name: "今はしない" });
    expect(accept.className).toBe(decline.className);
    expect(screen.queryByText(/お知らせを受け取る/)).toBeNull();
    const shown = fetcher.mock.calls.filter(
      ([url]) => url === "/api/save-offer",
    );
    expect(shown).toHaveLength(1);
    expect(
      JSON.parse(
        (shown[0] as unknown as [string, RequestInit])[1].body as string,
      ),
    ).toEqual({
      stage: "shown",
      surface: "home",
      conversationKey: body.conversationKey,
    });
  });

  it("「今はしない」はやさしく受け止めて閉じ、ログインへ移らない", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign, search: "" },
    });
    const { fetcher } = await askWithOffer();
    fireEvent.click(screen.getByRole("button", { name: "今はしない" }));
    expect(
      screen.getByText(
        "わかりました。必要になったら、いつでもログインして保存できます。",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "結果を保存する" })).toBeNull();
    const stages = fetcher.mock.calls
      .filter(([url]) => url === "/api/save-offer")
      .map(
        ([, init]) => JSON.parse((init as RequestInit).body as string).stage,
      );
    expect(stages).toEqual(["shown", "declined"]);
    expect(assign).not.toHaveBeenCalled();
  });

  it("「結果を保存する」はアップロードせず、会話を端末に置いてログインへ進む", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign, search: "" },
    });
    const { fetcher } = await askWithOffer();
    fireEvent.click(screen.getByRole("button", { name: "結果を保存する" }));
    expect(assign).toHaveBeenCalledTimes(1);
    const target = new URL(
      assign.mock.calls[0][0],
      "https://cloud-palette.com",
    );
    expect(target.pathname).toBe("/login");
    const next = new URL(
      target.searchParams.get("next")!,
      "https://cloud-palette.com",
    );
    expect(next.pathname).toBe("/ask");
    const resumeId = next.searchParams.get("resume")!;
    const stored = parseAskWorkspaceJson(
      localStorage.getItem(ASK_DATA_STORAGE_KEY),
    );
    expect(stored?.activeConversationId).toBe(resumeId);
    expect(stored?.conversations[0].messages.map((m) => m.content)).toEqual([
      "1990年5月5日生まれ、深谷市から東は？",
      "東は吉方位です。",
    ]);
    expect(fetcher.mock.calls.some(([url]) => url === "/api/ask-data")).toBe(
      false,
    );
  });
});

describe("ログインから戻る", () => {
  const now = "2026-10-17T00:00:00.000Z";
  const conversation = (id: string, text: string, updatedAt = now) => ({
    id,
    title: text,
    titleEdited: false,
    createdAt: now,
    updatedAt,
    messages: [
      { role: "user" as const, content: text },
      { role: "assistant" as const, content: "回答" },
    ],
    draft: "",
    personIds: [],
  });
  const workspace = (
    conversations: ReturnType<typeof conversation>[],
    updatedAt = now,
  ): AskWorkspace => ({
    version: 2,
    activeConversationId: conversations[0].id,
    conversations,
    people: [],
    memories: [],
    updatedAt,
  });

  it("クラウドの方が新しくても、押したときの会話を足して開く", () => {
    const local = workspace([
      conversation("conversation_saved", "保存したい相談"),
    ]);
    const remote = workspace(
      [conversation("conversation_remote", "別の端末の相談")],
      "2026-10-18T00:00:00.000Z",
    );
    const merged = withResumedConversation(remote, local, "conversation_saved");
    expect(merged.activeConversationId).toBe("conversation_saved");
    expect(merged.conversations.map((c) => c.id)).toEqual([
      "conversation_saved",
      "conversation_remote",
    ]);
    expect(withResumedConversation(remote, local, null)).toBe(remote);
    expect(withResumedConversation(remote, local, "conversation_none")).toBe(
      remote,
    );
    expect(readResumeParam("?resume=conversation_saved")).toBe(
      "conversation_saved",
    );
    expect(readResumeParam("?resume=../../evil")).toBeNull();
  });

  it("空の会話は捨て、30 件の枠を守って先頭に置く", () => {
    localStorage.setItem(
      ASK_DATA_STORAGE_KEY,
      JSON.stringify(
        workspace(
          Array.from({ length: 30 }, (_, i) =>
            conversation(`conversation_${i}`, `相談${i}`),
          ),
        ),
      ),
    );
    const id = stashConversationForResume(localStorage, {
      id: "conversation_new",
      messages: [{ role: "user", content: "新しい相談" }],
    });
    const stored = parseAskWorkspaceJson(
      localStorage.getItem(ASK_DATA_STORAGE_KEY),
    )!;
    expect(id).toBe("conversation_new");
    expect(stored.conversations).toHaveLength(30);
    expect(stored.conversations[0].id).toBe("conversation_new");
    expect(
      stashConversationForResume(localStorage, {
        id: "conversation_x",
        messages: [],
      }),
    ).toBeNull();
  });

  it("/ask?resume= で同じ会話を開き、アカウントへの保存が成功してから「おかえりなさい」と言う", async () => {
    localStorage.setItem(
      ASK_DATA_STORAGE_KEY,
      JSON.stringify(
        workspace([conversation("conversation_saved", "保存したい相談")]),
      ),
    );
    window.history.replaceState(null, "", "/ask?resume=conversation_saved");
    document.cookie = "sb-test-auth-token=1; path=/";
    let resolvePost!: (value: Response) => void;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/ask-data" && init?.method === "POST")
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      if (url === "/api/ask-data")
        return Response.json({
          data: workspace(
            [conversation("conversation_remote", "別の端末の相談")],
            "2026-10-18T00:00:00.000Z",
          ),
        });
      if (url === "/api/save-offer") return Response.json({ ok: true });
      return Response.json({ remaining: { requests: 20 } });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<McpExplorer agentEnabled persistConversation />);
    await waitFor(() =>
      expect(screen.getAllByText("保存したい相談").length).toBeGreaterThan(0),
    );
    expect(window.location.search).toBe("");
    expect(screen.queryByText(/おかえりなさい/)).toBeNull();
    await waitFor(() => expect(resolvePost).toBeTypeOf("function"), {
      timeout: 3000,
    });
    const posted = JSON.parse(
      (
        fetcher.mock.calls.find(
          ([url, init]) => url === "/api/ask-data" && init?.method === "POST",
        ) as unknown as [string, RequestInit]
      )[1].body as string,
    );
    expect(posted.data.conversations.map((c: { id: string }) => c.id)).toEqual([
      "conversation_saved",
      "conversation_remote",
    ]);
    await act(async () => resolvePost(Response.json({ ok: true })));
    expect(
      await screen.findByText(
        /おかえりなさい。この相談をアカウントに保存しました/,
      ),
    ).toBeTruthy();
    const stages = fetcher.mock.calls
      .filter(([url]) => url === "/api/save-offer")
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(stages).toEqual([{ stage: "resumed", surface: "ask" }]);
  });
});
