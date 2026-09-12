/**
 * 「使用中のプロフィール」の決め事を固定する（lib/activeProfile）。
 *
 * 利用者の指摘（2026-09-12）: /profile で登録しても保存済みプロフィールの
 * 一覧に出ず、名前も付けられず、道具がどのプロフィールで判定しているのか
 * 分からない。ここで固定するのは次の 4 つ。
 *
 * 1. 使用中は一覧の中で 1 件だけ（markActive が他の旗を落とす）
 * 2. 旗の無い古い控えでも、設定と同じ値なら使用中と見なす
 * 3. 使用中にすると設定に書かれる。出生地の無い控えを当てたら設定の
 *    出生地も消える（前の人の出生地で加点が付き続けない）
 * 4. 上書き保存は、画面に出ていない項目（基準値など）を残す
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyProfile,
  describeProfile,
  findActiveProfile,
  markActive,
  settingsPatchFor,
  upsertActiveProfile,
} from "@/lib/activeProfile";
import type { ProfilePreset } from "@/lib/profilePresetSync";

const me: ProfilePreset = {
  id: "p-me",
  name: "自分",
  birthDate: "1990-01-02",
  birthLat: 35.1,
  birthLon: 136.9,
  baseLat: 35.6,
  baseLon: 139.7,
  baselineHrvMean: 42,
  createdAt: "2026-09-01T00:00:00.000Z",
};
const partner: ProfilePreset = {
  id: "p-partner",
  name: "妻",
  birthDate: "1992-05-06",
  baseLat: 35.6,
  baseLon: 139.7,
  createdAt: "2026-09-02T00:00:00.000Z",
};

/** クラウドの一覧と、届いた POST を記録する偽の fetch。 */
function fakeApi(cloud: ProfilePreset[]) {
  const posted: { url: string; body: unknown }[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posted.push({ url, body: JSON.parse(String(init.body)) });
        if (url === "/api/profile-presets") {
          cloud = (
            JSON.parse(String(init.body)) as { presets: ProfilePreset[] }
          ).presets;
        }
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ presets: cloud }) };
    },
  ) as unknown as typeof fetch;
  return { fetcher, posted, current: () => cloud };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findActiveProfile", () => {
  it("旗が立っている 1 件を返す", () => {
    expect(findActiveProfile([me, { ...partner, active: true }], {})?.id).toBe(
      "p-partner",
    );
  });

  it("旗が無ければ、設定と同じ値の控えを使用中と見なす", () => {
    const settings = {
      birth_date: "1992-05-06",
      base_lat: 35.6,
      base_lon: 139.7,
    };
    expect(findActiveProfile([me, partner], settings)?.id).toBe("p-partner");
  });

  it("どれも合わなければ null", () => {
    expect(findActiveProfile([me, partner], { birth_date: "2000-01-01" })).toBe(
      null,
    );
  });
});

describe("markActive", () => {
  it("1 件だけ真にし、他の旗は落とす", () => {
    const list = markActive([{ ...me, active: true }, partner], "p-partner");
    expect(list.map((p) => p.active)).toEqual([undefined, true]);
  });
});

describe("settingsPatchFor", () => {
  it("出生地が無い控えは設定の出生地を null で消す", () => {
    expect(settingsPatchFor(partner)).toEqual({
      birth_date: "1992-05-06",
      base_lat: 35.6,
      base_lon: 139.7,
      birth_lat: null,
      birth_lon: null,
    });
  });
});

describe("applyProfile", () => {
  it("設定に書いて、一覧の中でその 1 件だけを使用中にする", async () => {
    const api = fakeApi([{ ...me, active: true }, partner]);
    vi.stubGlobal("fetch", api.fetcher);
    const r = await applyProfile(partner, api.fetcher, localStorage);
    expect(r.save.synced).toBe(true);
    const userConfig = api.posted.find((p) => p.url === "/api/user-config");
    expect(userConfig?.body).toMatchObject({
      birth_date: "1992-05-06",
      birth_lat: null,
      birth_lon: null,
    });
    expect(r.presets.find((p) => p.id === "p-partner")?.active).toBe(true);
    expect(r.presets.find((p) => p.id === "p-me")?.active).toBeUndefined();
  });
});

describe("upsertActiveProfile", () => {
  it("新規は名前つきで足して使用中にし、設定には書かない", async () => {
    const api = fakeApi([me]);
    vi.stubGlobal("fetch", api.fetcher);
    const r = await upsertActiveProfile(
      {
        name: "  母  ",
        values: { birthDate: "1965-03-04", baseLat: 34.7, baseLon: 135.5 },
      },
      api.fetcher,
      localStorage,
    );
    expect(r.profile.name).toBe("母");
    expect(r.profile.active).toBe(true);
    expect(r.profile.birthLat).toBeUndefined();
    expect(r.presets).toHaveLength(2);
    expect(api.posted.some((p) => p.url === "/api/user-config")).toBe(false);
  });

  it("上書きは画面に出ていない項目を残し、空にした出生地は落とす", async () => {
    const api = fakeApi([{ ...me, active: true }, partner]);
    vi.stubGlobal("fetch", api.fetcher);
    const r = await upsertActiveProfile(
      {
        id: "p-me",
        name: "自分",
        values: { birthDate: "1990-01-02", baseLat: 35.6, baseLon: 139.7 },
      },
      api.fetcher,
      localStorage,
    );
    expect(r.profile.baselineHrvMean).toBe(42);
    expect(r.profile.birthLat).toBeUndefined();
    expect(r.profile.createdAt).toBe(me.createdAt);
  });

  it("名前が空なら既定の名前", async () => {
    const api = fakeApi([]);
    vi.stubGlobal("fetch", api.fetcher);
    const r = await upsertActiveProfile(
      { name: "", values: { birthDate: "1990-01-02", baseLat: 1, baseLon: 2 } },
      api.fetcher,
      localStorage,
    );
    expect(r.profile.name).toBe("自分");
  });
});

describe("describeProfile", () => {
  it("名前・生年月日・出発地を 1 行にする", () => {
    expect(describeProfile({ ...me, birthDate: "1990-01-02T05:30" })).toContain(
      "自分（1990-01-02 生・出発地 ",
    );
  });
});
