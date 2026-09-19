import { describe, expect, it } from "vitest";
import {
  LEGACY_PROFILE_KEYS,
  legacyProfilePatch,
} from "@/lib/legacyProfileKeys";
import { ACCOUNT_LOCAL_KEYS } from "@/lib/accountData";

/*
  生年月日と座標の写しを、正の設定（tactical_config_v1）へ畳む
  （利用者の依頼。2026-09-19）。

  同じ値が 7 か所にあることが、記録に残っている 4 件の事故の原因だった
  （#1100・#1114・#1126 の初期値の流入、2026-09-07 の消し漏れ、
  2026-09-17 の同行者、2026-09-19 の出発地）。**保存したこと自体では
  なく、写しが増えたのに片方しか直さなかったこと**が原因。

  ここで固定するのは「引き上げても値を失わない」こと。
*/

function storage(values: Record<string, string>) {
  return {
    getItem: (k: string) => (k in values ? values[k] : null),
  };
}

describe("旧い写しの引き上げ", () => {
  it("クラウドで消した跡（null）の欄は拾い直さない", () => {
    /*
      別の端末で消した生年月日は、正の設定に null で残る
      （userSettings が「消した跡」として書く）。null を「無い」と同じに
      扱っていたころは、読み込みのたびに旧い鍵から戻ってきた。
      **欄ごと無いとき（undefined）だけ**引き上げる。
    */
    const got = legacyProfilePatch(
      storage({ arb_birthDate: "1985-05-20T09:00", arb_baseLat: "35.1815" }),
      { birth_date: null },
    );
    expect(got.birth_date).toBeUndefined();
    // 消していない欄は今までどおり引き上げる
    expect(got.base_lat).toBe(35.1815);
  });

  it("正の設定に無い欄を、旧い鍵から埋める", () => {
    const got = legacyProfilePatch(
      storage({
        arb_birthDate: "1985-05-20T09:00",
        arb_baseLat: "35.1815",
        arb_baseLon: "136.9066",
      }),
      {},
    );
    expect(got).toEqual({
      birth_date: "1985-05-20T09:00",
      base_lat: 35.1815,
      base_lon: 136.9066,
    });
  });

  it("座標は数値にする（旧い鍵は文字列で持っている）", () => {
    const got = legacyProfilePatch(storage({ wealth_birthLat: "34.991" }), {});
    expect(typeof got.birth_lat).toBe("number");
    expect(got.birth_lat).toBe(34.991);
  });

  it("**正の設定に既にある欄は上書きしない**", () => {
    /* ここが崩れると、別の端末で設定し直した出発地を古い写しが潰す。 */
    const got = legacyProfilePatch(
      storage({ arb_baseLat: "35.1815", arb_baseLon: "136.9066" }),
      { base_lat: 43.0618, base_lon: 141.3545 },
    );
    expect(got.base_lat).toBeUndefined();
    expect(got.base_lon).toBeUndefined();
  });

  it("0 は「値がある」として扱う（緯度 0 を消さない）", () => {
    const got = legacyProfilePatch(storage({ arb_baseLat: "35.1" }), {
      base_lat: 0,
    });
    expect(got.base_lat).toBeUndefined();
  });

  it("空文字・空白・数にならない座標は引き上げない", () => {
    const got = legacyProfilePatch(
      storage({
        arb_birthDate: "   ",
        arb_baseLat: "",
        arb_baseLon: "あ",
        wealth_birthLat: "NaN",
      }),
      {},
    );
    expect(got).toEqual({});
  });

  it("同じ欄を指す鍵は先に並んだほうを採る（arb が先）", () => {
    const got = legacyProfilePatch(
      storage({
        arb_birthDate: "1985-05-20T09:00",
        wealth_birthDate: "1990-01-02T05:30",
      }),
      {},
    );
    expect(got.birth_date).toBe("1985-05-20T09:00");
  });

  it("読めない端末（例外）でも落ちない", () => {
    const throwing = {
      getItem() {
        throw new Error("private mode");
      },
    };
    expect(() => legacyProfilePatch(throwing, {})).not.toThrow();
    expect(legacyProfilePatch(throwing, {})).toEqual({});
  });

  it("何も無ければ何も返さない（毎回走っても同じ）", () => {
    expect(legacyProfilePatch(storage({}), {})).toEqual({});
  });
});

describe("畳む対象と、消す対象がそろっている", () => {
  it("引き上げる鍵はすべて「すべて消す」の対象に入っている", () => {
    /*
      引き上げたあとも旧い鍵は端末に残る（読み手がまだいる）。
      **消す側に入っていないと、消したつもりの生年月日が残る。**
      2026-09-07 に実際に起きた事故。
    */
    for (const [key] of LEGACY_PROFILE_KEYS) {
      expect(ACCOUNT_LOCAL_KEYS, key).toContain(key);
    }
  });

  it("見張りが空回りしていない（鍵を読めている）", () => {
    expect(LEGACY_PROFILE_KEYS.length).toBe(8);
    const fields = new Set(LEGACY_PROFILE_KEYS.map(([, f]) => f));
    expect([...fields].sort()).toEqual([
      "base_lat",
      "base_lon",
      "birth_date",
      "birth_lat",
      "birth_lon",
    ]);
  });
});
