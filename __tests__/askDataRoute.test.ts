import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getAuthUser, findUserConfig, update, create } = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  findUserConfig: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/userConfig", () => ({
  getAuthUser,
  findUserConfig,
  toUserId: (user: { id: string }) => user.id,
}));

vi.mock("@/lib/prisma", () => ({
  default: { user_configs: { update, create } },
}));

import { GET, POST } from "@/app/api/ask-data/route";

const user = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "owner@example.com",
};
const workspace = {
  version: 2,
  activeConversationId: "conversation_1",
  updatedAt: "2026-10-17T00:00:00.000Z",
  conversations: [
    {
      id: "conversation_1",
      title: "家族の引越し",
      titleEdited: true,
      createdAt: "2026-10-17T00:00:00.000Z",
      updatedAt: "2026-10-17T00:00:00.000Z",
      messages: [{ role: "user", content: "家族の引越しを相談" }],
      draft: "",
      personIds: ["person_1"],
    },
  ],
  people: [
    {
      id: "person_1",
      name: "本人",
      birthDate: "1990-05-05",
      residence: "長崎市",
      createdAt: "2026-10-17T00:00:00.000Z",
      updatedAt: "2026-10-17T00:00:00.000Z",
    },
  ],
  memories: [],
};

function request(data: unknown, origin = "https://cloud-palette.com") {
  return new NextRequest("https://cloud-palette.com/api/ask-data", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ data, persist: true }),
  });
}

describe("/api/ask-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthUser.mockResolvedValue(user);
    update.mockResolvedValue({});
    create.mockResolvedValue({});
  });

  it("未ログインの読み書きを拒否する", async () => {
    getAuthUser.mockResolvedValue(null);
    expect(
      (await GET(new Request("https://example.invalid/api/ask-data"))).status,
    ).toBe(401);
    expect((await POST(request(workspace))).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("本人のversion付きデータだけを返す", async () => {
    findUserConfig.mockResolvedValue({ ask_data: workspace });
    const response = await GET(
      new Request("https://example.invalid/api/ask-data"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: workspace, expiry: null });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("既存の設定更新時刻を動かさず相談データを保存する", async () => {
    findUserConfig.mockResolvedValue({ id: "config_1" });
    const response = await POST(request(workspace));
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: "config_1" },
      data: {
        ask_data: expect.objectContaining({ version: 2 }),
        ask_data_last_used_at: expect.any(Date),
      },
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty("updated_at");
  });

  it("別originと壊れた形式を保存しない", async () => {
    expect(
      (await POST(request(workspace, "https://attacker.example"))).status,
    ).toBe(403);
    expect((await POST(request({ version: 1 }))).status).toBe(400);
    expect(
      (
        await POST(
          new NextRequest("https://cloud-palette.com/api/ask-data", {
            method: "POST",
            headers: {
              Origin: "https://cloud-palette.com",
              "Content-Type": "application/json",
            },
            body: "{broken",
          }),
        )
      ).status,
    ).toBe(400);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

it("persist の明示なしでは保存しない", async () => {
  vi.clearAllMocks();
  getAuthUser.mockResolvedValue(user);
  const response = await POST(
    new NextRequest("https://cloud-palette.com/api/ask-data", {
      method: "POST",
      headers: {
        Origin: "https://cloud-palette.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: workspace }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    code: "ASK_DATA_PERSIST_REQUIRED",
  });
  expect(findUserConfig).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

it("読込だけでは利用日を進めず、期限前の案内を返す", async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T00:00:00Z"));
  try {
    getAuthUser.mockResolvedValue(user);
    findUserConfig.mockResolvedValue({
      id: "owner-row",
      ask_data: workspace,
      ask_data_last_used_at: new Date("2026-08-19T00:00:00Z"),
    });
    const response = await GET(
      new Request("https://example.invalid/api/ask-data"),
    );
    expect(await response.json()).toMatchObject({
      expiry: { status: "notice", expiresAt: "2026-11-17T00:00:00.000Z" },
    });
    expect(update).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("書き出しは同じ所有者確認と private なダウンロードを使う", async () => {
  vi.clearAllMocks();
  getAuthUser.mockResolvedValue(user);
  findUserConfig.mockResolvedValue({ id: "owner-row", ask_data: workspace });
  const exportRequest = new Request(
    "https://example.invalid/api/ask-data?format=export",
  );
  const response = await GET(exportRequest);
  expect(response.headers.get("Content-Disposition")).toContain(
    'attachment; filename="ask-data.json"',
  );
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.json()).toMatchObject({ data: workspace });
  expect(findUserConfig).toHaveBeenCalledWith(user);
  vi.clearAllMocks();
  getAuthUser.mockResolvedValue(null);
  expect((await GET(exportRequest)).status).toBe(401);
  expect(findUserConfig).not.toHaveBeenCalled();
});
