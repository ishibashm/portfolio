import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthUser,
  userFindUnique,
  userCreate,
  findMany,
  create,
  updateMany,
  deleteMany,
} = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/userConfig", () => ({ getAuthUser }));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: userFindUnique,
      create: userCreate,
    },
    relocationSimulation: {
      findMany,
      create,
      updateMany,
      deleteMany,
    },
  },
}));

import { DELETE, GET, POST } from "@/app/api/relocation/simulation/route";

const user = { id: "user-1", email: "owner@example.com" };

function post(body: unknown) {
  return new Request("http://localhost/api/relocation/simulation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/relocation/simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthUser.mockResolvedValue(user);
    userFindUnique.mockResolvedValue(user);
  });

  it("rejects an anonymous list request", async () => {
    getAuthUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("lists only plans owned by the signed-in user", async () => {
    findMany.mockResolvedValue([{ id: "plan-1", userId: user.id }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("attaches the signed-in user when creating a plan", async () => {
    create.mockResolvedValue({ id: "plan-1" });

    const response = await POST(post({ name: "京都", steps: [] }));

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: { name: "京都", steps: [], userId: user.id },
    });
  });

  it("reuses a legacy app user with the same email", async () => {
    userFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "legacy-user", email: user.email });
    findMany.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "legacy-user" },
      orderBy: { updatedAt: "desc" },
    });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("does not update a plan owned by another user", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(
      post({ id: "someone-elses-plan", name: "変更", steps: [] }),
    );

    expect(response.status).toBe(404);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "someone-elses-plan", userId: user.id },
      data: { name: "変更", steps: [] },
    });
  });

  it("does not delete a plan owned by another user", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    const request = new Request(
      "http://localhost/api/relocation/simulation?id=someone-elses-plan",
      { method: "DELETE" },
    );

    const response = await DELETE(request);

    expect(response.status).toBe(404);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "someone-elses-plan", userId: user.id },
    });
  });
});
