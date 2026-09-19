import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PARTY_PREFS_KEY,
  partyMemberFromPreset,
  partyParam,
  partyPayload,
  readSharedParty,
  readTimingParty,
  TIMING_PARTY_KEY,
  writeSharedParty,
  writeTimingParty,
  type PartyMemberInput,
} from "@/lib/partyMemberInput";
import { PartyMembersEditor } from "@/components/relocation/PartyMembersEditor";
import type { PartyPolicy } from "@/utils/arbitrageParty";

/*
  同行者・合流する人の入力欄と、その保存の口。

  物件検索に埋め込まれていた欄を共有部品にした。時期ツールにも同じ人を
  出すため、保存先は物件検索が使っている鍵（arb_axis_prefs_v1）を
  そのまま読み書きし、**同じ鍵にある他の項目を消さない**ことを固定する。
*/

vi.mock("@/components/relocation/PlaceInput", () => ({
  PlaceInput: ({ label }: { label: string }) => (
    <div data-place-input>{label}</div>
  ),
}));

function member(over: Partial<PartyMemberInput> = {}): PartyMemberInput {
  return {
    id: "m1",
    name: "母",
    birthDate: "1965-02-03T12:00",
    birthLat: "",
    birthLon: "",
    baseLat: "33.59",
    baseLon: "130.40",
    weight: 1,
    stationary: false,
    ...over,
  };
}

describe("partyPayload / partyParam", () => {
  it("生年月日が無い人と、移動するのに出発地が無い人は送らない", () => {
    const ok = member();
    const noBirth = member({ id: "m2", birthDate: "" });
    const noBase = member({ id: "m3", baseLat: "", baseLon: "" });
    const there = member({
      id: "m4",
      baseLat: "",
      baseLon: "",
      stationary: true,
    });
    expect(partyPayload([ok, noBirth, noBase, there]).map((m) => m.id)).toEqual(
      ["m1", "m4"],
    );
    expect(partyPayload([ok])[0]).toMatchObject({
      baseLat: 33.59,
      baseLon: 130.4,
      birthLat: null,
      birthLon: null,
    });
  });

  it("送れる人がいなければ空文字", () => {
    expect(partyParam([member({ birthDate: "" })])).toBe("");
    expect(JSON.parse(partyParam([member()]))).toHaveLength(1);
  });
});

describe("partyMemberFromPreset", () => {
  it("保存済みプロフィールの座標を文字列で写し、無ければ空", () => {
    const m = partyMemberFromPreset(
      {
        id: "p1",
        name: "父",
        birthDate: "1960-01-01",
        baseLat: 35.1,
        baseLon: 139.2,
        createdAt: "2026-01-01T00:00:00Z",
      },
      0,
    );
    expect(m).toMatchObject({
      id: "p1",
      name: "父",
      baseLat: "35.1",
      baseLon: "139.2",
      birthLat: "",
      birthLon: "",
      stationary: false,
      weight: 1,
    });
    expect(partyMemberFromPreset(undefined, 2).name).toBe("同行者3");
  });
});

describe("readSharedParty / writeSharedParty", () => {
  beforeEach(() => localStorage.clear());

  it("物件検索の鍵から同行者とまとめ方だけを読む。壊れていれば空", () => {
    expect(readSharedParty(localStorage)).toEqual({
      members: [],
      policy: "everyone",
    });
    localStorage.setItem(PARTY_PREFS_KEY, "{broken");
    expect(readSharedParty(localStorage).members).toEqual([]);
    localStorage.setItem(
      PARTY_PREFS_KEY,
      JSON.stringify({
        candidateStrategy: "x",
        partyMembers: [member(), { not: "a member" }],
        partyPolicy: "weighted",
      }),
    );
    const read = readSharedParty(localStorage);
    expect(read.members.map((m) => m.id)).toEqual(["m1"]);
    expect(read.policy).toBe("weighted");
  });

  it("書き戻しても同じ鍵の他の項目（物件検索の設定）を消さない", () => {
    localStorage.setItem(
      PARTY_PREFS_KEY,
      JSON.stringify({
        candidateStrategy: "top",
        horizonDays: 30,
        partyMembers: [],
        partyPolicy: "everyone",
      }),
    );
    writeSharedParty(localStorage, {
      members: [member()],
      policy: "average",
    });
    const saved = JSON.parse(localStorage.getItem(PARTY_PREFS_KEY) ?? "{}");
    expect(saved.candidateStrategy).toBe("top");
    expect(saved.horizonDays).toBe(30);
    expect(saved.partyMembers).toHaveLength(1);
    expect(saved.partyPolicy).toBe("average");
  });
});

describe("PartyMembersEditor", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function Harness({
    initial,
    onChange,
  }: {
    initial: PartyMemberInput[];
    onChange: (m: PartyMemberInput[]) => void;
  }) {
    const [members, setMembers] = React.useState(initial);
    const [policy, setPolicy] = React.useState<PartyPolicy>("everyone");
    return (
      <PartyMembersEditor
        members={members}
        onChange={(next) => {
          setMembers(next);
          onChange(next);
        }}
        policy={policy}
        onPolicyChange={setPolicy}
        savedProfiles={[
          {
            id: "p1",
            name: "父",
            birthDate: "1960-01-01",
            baseLat: 35.1,
            baseLon: 139.2,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]}
      />
    );
  }

  it("保存済みプロフィールのボタンで 1 人足し、足した人は候補から消える", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<Harness initial={[]} onChange={onChange} />);
    });
    const preset = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("父"),
    );
    expect(preset).toBeTruthy();
    await act(async () => {
      preset!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      id: "p1",
      name: "父",
      baseLat: "35.1",
    });
    expect(container.querySelectorAll("[data-party-member]")).toHaveLength(1);
    expect(
      [...container.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("＋ 父"),
      ),
    ).toBe(false);
    // 出発地は地名で探す欄（PlaceInput）で入れる
    expect(
      container.querySelector("[data-place-input]")?.textContent,
    ).toContain("出発地");
  });

  it("「移動しない」にすると出発地の欄が消え、削除で人が消える", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<Harness initial={[member()]} onChange={onChange} />);
    });
    const checkbox = container.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    )!;
    await act(async () => {
      checkbox.click();
    });
    expect(onChange.mock.lastCall?.[0][0].stationary).toBe(true);
    expect(container.querySelector("[data-place-input]")).toBeNull();
    expect(container.textContent).toContain("出発地は要りません");

    const remove = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "削除",
    )!;
    await act(async () => {
      remove.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange.mock.lastCall?.[0]).toEqual([]);
  });
});

describe("readTimingParty / writeTimingParty（時期ツール専用の鍵）", () => {
  beforeEach(() => localStorage.clear());

  it("鍵がまだ無い端末では、物件検索の同行者を読んで返す（1 回だけ写す）", () => {
    localStorage.setItem(
      PARTY_PREFS_KEY,
      JSON.stringify({ partyMembers: [member()], partyPolicy: "weighted" }),
    );
    const read = readTimingParty(localStorage);
    expect(read.members.map((m) => m.id)).toEqual(["m1"]);
    expect(read.policy).toBe("weighted");
    // 読んだだけでは書かない（読み込み前の空で上書きする事故と同じ形を作らない）
    expect(localStorage.getItem(TIMING_PARTY_KEY)).toBeNull();
  });

  it("自分の鍵があれば物件検索の鍵は見ない（空でも）", () => {
    localStorage.setItem(
      PARTY_PREFS_KEY,
      JSON.stringify({ partyMembers: [member()], partyPolicy: "weighted" }),
    );
    writeTimingParty(localStorage, { members: [], policy: "everyone" });
    expect(readTimingParty(localStorage)).toEqual({
      members: [],
      policy: "everyone",
    });
  });

  it("書いても物件検索の鍵には触らない", () => {
    localStorage.setItem(
      PARTY_PREFS_KEY,
      JSON.stringify({ partyMembers: [], partyPolicy: "everyone" }),
    );
    writeTimingParty(localStorage, { members: [member()], policy: "average" });
    expect(readSharedParty(localStorage).members).toEqual([]);
    expect(readTimingParty(localStorage).members.map((m) => m.id)).toEqual([
      "m1",
    ]);
  });

  it("壊れていれば空", () => {
    localStorage.setItem(TIMING_PARTY_KEY, "{broken");
    expect(readTimingParty(localStorage).members).toEqual([]);
  });
});
