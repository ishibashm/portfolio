import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Layout from "@/app/relocation/arbitrage/layout";
import { ListingEmailPreview } from "@/components/relocation/ListingEmailPreview";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";
const id = "11111111-2222-4333-8444-555555555555";
const startedAt = "2026-09-24T00:00:00.000Z";
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function network(options: { confirmed?: boolean; expired?: boolean } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const path = String(url);
    expect(path.startsWith("/api/relocation/email/gmail/")).toBe(true);
    expect(init?.cache).toBe("no-store");
    if (path.endsWith("status"))
      return reply({
        connections: [
          { id, labelId: options.confirmed ? "Label_1" : null, startedAt },
        ],
      });
    if (path.includes("labels?"))
      return reply({
        labels: [
          { id: "Label_1", name: "物件通知" },
          { id: "Label_2", name: "別の通知" },
        ],
      });
    if (path.endsWith("select-label"))
      return reply({
        selected: { connectionId: id, labelId: "Label_1", startedAt },
      });
    if (path.endsWith("read"))
      return options.expired
        ? reply({ code: "GMAIL_RECONNECT" }, 503)
        : reply({
            urls: ["https://suumo.jp/a"],
            truncated: false,
            nextCursor: null,
          });
    if (path.endsWith("disconnect")) return reply({ disconnected: true });
    if (path.endsWith("connect"))
      return reply({
        authorizationUrl:
          "https://accounts.google.com/o/oauth2/v2/auth?state=test",
      });
    throw new Error("UNEXPECTED_REQUEST");
  });
}
function mount() {
  const selected: string[] = [];
  render(
    <Layout>
      <ListingEmailPreview onSelect={(url) => selected.push(url)} />
    </Layout>,
  );
  return selected;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});
it("server flag defaults OFF: Gmail UI is absent and no requests run", () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "");
  const fetch = network();
  mount();
  expect(
    screen.queryByRole("region", { name: "Gmail接続" }),
  ).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText(/自分の通知メールからURLを選ぶ/)).toBeInTheDocument();
});
it("callback preselects 物件通知 but requires confirmation before importing and selecting a URL", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  window.history.replaceState(null, "", `/?emailConnection=${id}`);
  const fetch = network();
  const selected = mount();
  await waitFor(() =>
    expect(screen.getByLabelText("通知ラベル")).toHaveValue("Label_1"),
  );
  expect(screen.getByRole("button", { name: "取り込み" })).toBeDisabled();
  expect(fetch.mock.calls).toHaveLength(2);
  expect(selected).toEqual([]);
  expect(window.location.search).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "このラベルで確定" }));
  await screen.findByText(/ラベルを確定しました/);
  fireEvent.click(screen.getByRole("button", { name: "取り込み" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "https://suumo.jp/a を既存入力へ",
    }),
  );
  expect(selected).toEqual(["https://suumo.jp/a"]);
  expect(
    fetch.mock.calls.map(([url]) => String(url).split("/").at(-1)),
  ).toEqual(["status", `labels?connectionId=${id}`, "select-label", "read"]);
  expect(
    screen.getByText(/Testingモードの場合、7日ごとに再接続/),
  ).toBeInTheDocument();
});
it("connect only requests authorization URL and offers an explicit Google link", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network({ confirmed: true });
  mount();
  await screen.findByText("接続状態: 接続済み");
  fireEvent.click(screen.getByRole("button", { name: "Gmailと接続" }));
  expect(
    await screen.findByRole("link", { name: "Googleの認可画面へ進む" }),
  ).toHaveAttribute(
    "href",
    "https://accounts.google.com/o/oauth2/v2/auth?state=test",
  );
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
    "/api/relocation/email/gmail/status",
    `/api/relocation/email/gmail/labels?connectionId=${id}`,
    "/api/relocation/email/gmail/connect",
  ]);
});
it("expired token prompts reconnection without retrying or importing", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network({ confirmed: true, expired: true });
  const selected = mount();
  await screen.findByText("接続状態: 接続済み");
  fireEvent.click(screen.getByRole("button", { name: "取り込み" }));
  await screen.findByText(/Gmailの認証が失効しました/);
  expect(screen.getByRole("button", { name: "Gmailに再接続" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "取り込み" })).toBeDisabled();
  expect(fetch.mock.calls).toHaveLength(3);
  expect(selected).toEqual([]);
});
it("disconnect requires confirmation; cancelling makes no request", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network({ confirmed: true });
  mount();
  await screen.findByText("接続状態: 接続済み");
  fireEvent.click(screen.getByRole("button", { name: "Gmailを切断" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(fetch.mock.calls).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Gmailを切断" }));
  fireEvent.click(screen.getByRole("button", { name: "切断を確定" }));
  await screen.findByText("Gmailを切断しました。");
  expect(screen.getByText("接続状態: 未接続")).toBeInTheDocument();
});
it("server-disabled response hides UI even if the initial page flag was ON", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    reply({ code: "GMAIL_DISABLED" }, 503),
  );
  mount();
  await waitFor(() =>
    expect(
      screen.queryByRole("region", { name: "Gmail接続" }),
    ).not.toBeInTheDocument(),
  );
});
it("pagination passes the returned cursor and never automatically requests another page", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network({ confirmed: true });
  mount();
  await screen.findByText("接続状態: 接続済み");
  fetch.mockResolvedValueOnce(
    reply({ urls: [], truncated: false, nextCursor: id }),
  );
  fireEvent.click(screen.getByRole("button", { name: "取り込み" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "続きを取り込む" }),
  );
  await screen.findByRole("button", { name: "最初から取り込む" });
  expect(fetch.mock.calls).toHaveLength(4);
  expect(JSON.parse(String(fetch.mock.calls[3][1]?.body))).toMatchObject({
    cursor: id,
    maxMessages: 20,
  });
});
it("Gmail URL selection reaches Phase 1, which still requires a location", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network({ confirmed: true });
  render(
    <Layout>
      <SpotVerdict
        baseLat={35}
        baseLon={135}
        useClassical={true}
        candidateContext={{
          birthDate: "1990-01-10",
          targetDate: "2026-10-05",
          baseLat: "35",
          baseLon: "135",
          tenchusatsuMode: "strict",
          involuntaryMove: false,
          directionFilterMode: "composite",
          useClassical: true,
        }}
      />
    </Layout>,
  );
  await screen.findByText("接続状態: 接続済み");
  fireEvent.click(screen.getByRole("button", { name: "取り込み" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "https://suumo.jp/a を既存入力へ",
    }),
  );
  expect(
    screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
  ).toHaveValue("https://suumo.jp/a");
  fireEvent.click(screen.getByRole("button", { name: "調べる" }));
  expect(
    screen.getByText(/このURLだけでは物件の住所を特定できません/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "候補履歴に保存" }),
  ).not.toBeInTheDocument();
  expect(fetch.mock.calls).toHaveLength(3);
});
it("missing 物件通知 does not choose another label automatically", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network();
  fetch
    .mockResolvedValueOnce(
      reply({ connections: [{ id, labelId: null, startedAt }] }),
    )
    .mockResolvedValueOnce(
      reply({ labels: [{ id: "Other", name: "別ラベル" }] }),
    );
  mount();
  await screen.findByRole("option", { name: "別ラベル" });
  expect(screen.getByLabelText("通知ラベル")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "このラベルで確定" }),
  ).toBeDisabled();
  expect(fetch.mock.calls).toHaveLength(2);
});
it("unmount cancels a pending import and never hands off a late response", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network({ confirmed: true });
  const selected: string[] = [];
  const view = render(
    <Layout>
      <ListingEmailPreview onSelect={(url) => selected.push(url)} />
    </Layout>,
  );
  await screen.findByText("接続状態: 接続済み");
  let resolve!: (r: Response) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "取り込み" }));
  const signal = fetch.mock.calls[1][1]?.signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  resolve(
    reply({ urls: ["https://suumo.jp/a"], truncated: false, nextCursor: null }),
  );
  expect(selected).toEqual([]);
});
it("revoke failure with successful local deletion reports the remaining Google action", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network({ confirmed: true });
  mount();
  await screen.findByText("接続状態: 接続済み");
  fetch.mockResolvedValueOnce(
    reply({ code: "GMAIL_REVOKE_FAILED_LOCAL_DELETED" }, 503),
  );
  fireEvent.click(screen.getByRole("button", { name: "Gmailを切断" }));
  fireEvent.click(screen.getByRole("button", { name: "切断を確定" }));
  await screen.findByText(/Googleアカウントでもアクセスを取り消してください/);
  expect(screen.getByText("接続状態: 未接続")).toBeInTheDocument();
});
/*
  利用者の報告（2026-09-24）: 「Gmailと接続」を押すと「処理できませんでした。
  接続状態を確認して、もう一度お試しください。」が出て進めない。本番のログでは
  connect が 503 を返していた。サイト側の設定（GMAIL_CONFIG）の不足も同じ文言に
  丸めていたので、本人の操作の問題に見えていた。
*/
it.each([
  [
    "GMAIL_CONFIG",
    503,
    /サイト側のGmail接続の設定が済んでいない.*GMAIL_CONFIG/,
  ],
  ["ORIGIN", 403, /cloud-palette\.com/],
  ["RATE_LIMIT", 429, /1分ほど待って/],
  ["SOMETHING_NEW", 503, /（コード: SOMETHING_NEW）/],
])(
  "connect failure %s says what went wrong instead of 接続状態を確認して",
  async (code, status, text) => {
    vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("status")
        ? reply({ connections: [] })
        : reply({ code, error: "メール接続を処理できませんでした。" }, status),
    );
    mount();
    await screen.findByText("接続状態: 未接続");
    fireEvent.click(screen.getByRole("button", { name: "Gmailと接続" }));
    const message = await screen.findByText(text);
    expect(message.textContent).not.toMatch(/接続状態を確認して/);
  },
);
it("resolves the existing athome label and offers explicit switching to 物件通知", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  const fetch = network({ confirmed: true });
  const original = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (url, init) =>
    String(url).includes("labels?")
      ? reply({
          labels: [
            { id: "Label_1", name: "athome" },
            { id: "Label_2", name: "物件通知" },
          ],
        })
      : original(url, init),
  );
  mount();
  await screen.findByText(/対象ラベル: athome/);
  fireEvent.click(screen.getByRole("button", { name: "ラベルを確認・変更" }));
  expect(screen.getByLabelText("通知ラベル")).toHaveValue("Label_2");
  expect(screen.getByRole("button", { name: "取り込み" })).toBeDisabled();
  expect(
    fetch.mock.calls.some(([url]) => String(url).endsWith("select-label")),
  ).toBe(false);
});
/*
  利用者の指摘（2026-09-25）「表示がおかしい。物件メールからデータ取れて
  ない？」。ボタンに見た目が無く地の文と続いて読めていたうえ、取り込むのは
  ラベルを確定した時刻より後のメールだけという決まりが画面に無く、0 件の
  理由が分からなかった。
*/
it("confirmed label says which mail is read (after the confirmation time only)", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  network({ confirmed: true });
  mount();
  await screen.findByText("接続状態: 接続済み");
  /* startedAt 2026-09-24T00:00Z は日本時間 9:00 */
  expect(
    screen.getByText(
      /2026\/9\/24 09:00\s*以降に届き、このラベルが付いたメールだけ/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/それより前のメールは読みません/),
  ).toBeInTheDocument();
});
it("an empty import explains the time window instead of a bare 'no URLs'", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    String(url).endsWith("status")
      ? reply({ connections: [{ id, labelId: "Label_1", startedAt }] })
      : reply({ urls: [], truncated: false, nextCursor: null }),
  );
  mount();
  await screen.findByText("接続状態: 接続済み");
  fireEvent.click(screen.getByRole("button", { name: "取り込み" }));
  const status = await screen.findByRole("status");
  expect(status.textContent).toMatch(
    /以降に届いた、このラベルのメールからは URL が見つかりませんでした/,
  );
});
it("buttons look like buttons (not bare text run into the paragraph)", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  network({ confirmed: true });
  mount();
  await screen.findByText("接続状態: 接続済み");
  for (const name of [
    "Gmailと接続",
    "取り込み",
    "Gmailを切断",
    "ラベルを確認・変更",
  ]) {
    expect(screen.getByRole("button", { name }).className).toMatch(
      /rounded-lg/,
    );
  }
});
