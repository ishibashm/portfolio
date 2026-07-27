import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, findUnique, upsert, readFile, writeFile } = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user_configs: {
      findUnique,
      upsert,
    },
  },
}));

vi.mock("fs/promises", () => ({
  default: {
    readFile,
    writeFile,
  },
}));

import { GET, POST } from "@/app/api/user-config/route";

const authenticatedUser = {
  id: "user-1",
  email: "owner@example.com",
};

describe("/api/user-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFile.mockRejectedValue(new Error("no local config"));
    writeFile.mockResolvedValue(undefined);
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
    expect(findUnique).not.toHaveBeenCalled();
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
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    ];
    findUnique.mockResolvedValue({
      user_email: authenticatedUser.email,
      presets,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      presets,
      presets_initialized: true,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { user_email: authenticatedUser.email },
    });
  });

  it("persists sanitized presets for the signed-in user", async () => {
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({});
    const request = new Request("http://localhost/api/user-config", {
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
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_email: authenticatedUser.email },
        update: expect.objectContaining({
          presets: [
            expect.not.objectContaining({
              geminiKey: expect.anything(),
            }),
          ],
        }),
      }),
    );
  });

  it("reports a cloud persistence failure instead of claiming success", async () => {
    findUnique.mockResolvedValue(null);
    upsert.mockRejectedValue(new Error("database unavailable"));
    const request = new Request("http://localhost/api/user-config", {
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
});
