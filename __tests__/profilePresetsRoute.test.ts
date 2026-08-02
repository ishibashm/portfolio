import { beforeEach, describe, expect, it, vi } from "vitest";

// 行の特定は user_email の findUnique から user_id 優先の findFirst に、
// 保存は upsert から update / create に変わっている。モックが古いままだと
// 実装が呼ぶメソッドが未定義になり、常に 503 に落ちて通らない。
const { getUser, findFirst, update, create } = vi.hoisted(() => ({
  getUser: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user_configs: {
      findFirst,
      update,
      create,
    },
  },
}));

vi.mock("@/utils/encryption", () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ""),
}));

import { GET, POST } from "@/app/api/profile-presets/route";

// user_id は uuid 形式でないと toUserId が null を返し、行の照合に使われない。
const authenticatedUser = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "owner@example.com",
};

describe("/api/profile-presets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({
      data: { user: authenticatedUser },
      error: null,
    });
  });

  it("rejects an unauthenticated config read", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("missing session"),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns cloud presets for the signed-in user", async () => {
    const presets = [
      {
        id: "preset_1",
        name: "Kyoto",
        birthDate: "1990-01-01",
        birthLat: 35,
        birthLon: 135,
        baseLat: 35,
        baseLon: 135,
        encryptedGeminiKey: "encrypted:server-secret",
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    ];
    findFirst.mockResolvedValue({
      id: "row-1",
      user_id: authenticatedUser.id,
      presets,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      presets: [
        expect.objectContaining({
          id: "preset_1",
          geminiKey: "server-secret",
        }),
      ],
      presets_initialized: true,
    });
    expect(findFirst).toHaveBeenCalled();
  });

  it("persists encrypted presets for the signed-in user", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({});
    const request = new Request("http://localhost/api/profile-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presets: [
          {
            id: "preset_1",
            name: "Kyoto",
            birthDate: "1990-01-01",
            birthLat: 35,
            birthLon: 135,
            baseLat: 35,
            baseLon: 135,
            geminiKey: "must-not-be-stored-in-plaintext",
            createdAt: "2026-07-27T00:00:00.000Z",
          },
        ],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: authenticatedUser.id,
          user_email: authenticatedUser.email,
          presets: [
            expect.objectContaining({
              encryptedGeminiKey:
                "encrypted:must-not-be-stored-in-plaintext",
            }),
          ],
        }),
      }),
    );
  });

  it("reports a cloud persistence failure instead of claiming success", async () => {
    findFirst.mockResolvedValue(null);
    create.mockRejectedValue(new Error("database unavailable"));
    const request = new Request("http://localhost/api/profile-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presets: [] }),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Cloud"),
    });
  });

  it("returns a service error when authentication cannot be checked", async () => {
    getUser.mockRejectedValue(new Error("auth unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
