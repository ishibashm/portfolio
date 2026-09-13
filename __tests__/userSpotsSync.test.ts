import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MAX_USER_SPOTS,
  addUserSpot,
  mergeUserSpots,
  readUserSpots,
  removeUserSpot,
  resetUserSpotsSyncForTest,
  syncUserSpots,
  USER_SPOTS_STORAGE_KEY,
  type UserSpot,
} from "@/lib/userSpots";

/*
  端末（localStorage）と DB の同期。

  ## 気にしていること

  1. **ログインしていない人は、今までどおり端末だけ。**401 が返ったら
     以後サーバーへ行かない
  2. **端末にしか無い地点は上げる。**初めてログインしたときに消えない
  3. **id はサーバーのものに差し替える。**端末で作った id のままだと、
     消しても DB に残る（DELETE は id で指す）
  4. **通信が失敗しても画面は動く。**端末の値が先
*/

function spot(over: Partial<UserSpot> = {}): UserSpot {
  return {
    id: "local-1",
    name: "実家",
    lat: 35.1,
    lon: 139.1,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  resetUserSpotsSyncForTest();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function seedLocal(list: UserSpot[]) {
  localStorage.setItem(USER_SPOTS_STORAGE_KEY, JSON.stringify(list));
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("端末とサーバーの突き合わせ（純粋関数）", () => {
  it("同じ地点は 1 件にし、名前はサーバー側を採る", () => {
    const local = [spot({ id: "local-1", name: "手元の名前" })];
    const server = [spot({ id: "server-1", name: "サーバーの名前" })];
    const { list, toPush } = mergeUserSpots(local, server);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("サーバーの名前");
    expect(list[0].id).toBe("server-1");
    expect(toPush).toEqual([]);
  });

  it("端末にしか無い地点は送る側に入れる", () => {
    const local = [spot({ id: "local-2", lat: 36.5, lon: 138.2 })];
    const { list, toPush } = mergeUserSpots(local, []);
    expect(list).toHaveLength(1);
    expect(toPush.map((s) => s.id)).toEqual(["local-2"]);
  });

  it("上限を超える分は送らない", () => {
    const server = Array.from({ length: MAX_USER_SPOTS }, (_, i) =>
      spot({ id: `s-${i}`, lat: 35 + i * 0.01 }),
    );
    const local = [spot({ id: "local-x", lat: 40, lon: 140 })];
    const { list, toPush } = mergeUserSpots(local, server);
    expect(list).toHaveLength(MAX_USER_SPOTS);
    expect(toPush).toEqual([]);
  });

  it("並びは登録した順", () => {
    const server = [
      spot({ id: "b", lat: 36, createdAt: "2026-09-02T00:00:00.000Z" }),
      spot({ id: "a", lat: 35, createdAt: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(mergeUserSpots([], server).list.map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("同期のふるまい", () => {
  it("ログインしていなければ端末だけで動く", async () => {
    seedLocal([spot()]);
    fetchMock.mockResolvedValue(jsonResponse({}, 401));

    await syncUserSpots();

    expect(readUserSpots()).toHaveLength(1);
    /* 401 を 1 度見たら、以後の書き込みでサーバーへ行かない */
    fetchMock.mockClear();
    addUserSpot({ name: "別の場所", lat: 36.5, lon: 138.2 });
    removeUserSpot("local-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("1 回だけ読みに行く", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ spots: [] }));
    await Promise.all([syncUserSpots(), syncUserSpots()]);
    await syncUserSpots();
    expect(
      fetchMock.mock.calls.filter((c) => c[1]?.method === undefined),
    ).toHaveLength(1);
  });

  it("端末にしか無い地点を上げ、id をサーバーのものに差し替える", async () => {
    seedLocal([spot({ id: "local-1" })]);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init?.method) return jsonResponse({ spots: [] });
      return jsonResponse({
        spot: {
          id: "server-9",
          name: "実家",
          lat: 35.1,
          lon: 139.1,
          createdAt: "2026-09-13T00:00:00.000Z",
        },
      });
    });

    await syncUserSpots();

    const list = readUserSpots();
    expect(list).toHaveLength(1);
    /* ここが本題。差し替えないと、消しても DB に残る */
    expect(list[0].id).toBe("server-9");
  });

  it("消すときはサーバーにも伝える", async () => {
    seedLocal([spot({ id: "server-9" })]);
    fetchMock.mockResolvedValue(
      jsonResponse({ spots: [spot({ id: "server-9" })] }),
    );
    await syncUserSpots();

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    removeUserSpot("server-9");

    expect(readUserSpots()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spots?id=server-9",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("通信が落ちても端末の値は残る", async () => {
    seedLocal([spot()]);
    fetchMock.mockRejectedValue(new Error("network"));
    await syncUserSpots();
    expect(readUserSpots()).toHaveLength(1);
  });

  it("壊れた応答は 1 件ずつ捨てる", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        spots: [
          { id: "ok", name: "実家", lat: 35, lon: 139, createdAt: "" },
          { id: "bad-lat", name: "x", lat: "35", lon: 139, createdAt: "" },
          { id: 1, name: "x", lat: 35, lon: 139, createdAt: "" },
          null,
        ],
      }),
    );
    await syncUserSpots();
    expect(readUserSpots().map((s) => s.id)).toEqual(["ok"]);
  });
});
