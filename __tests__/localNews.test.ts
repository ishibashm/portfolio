import { describe, expect, it } from "vitest";
import { AREAS } from "@/lib/areaContent";
import {
  cityNameCandidates,
  filterLocalNews,
  localNewsKeys,
} from "@/lib/localNews";
import type { MergedNewsItem } from "@/lib/fetchNews";

/**
 * その地域のニュースを、全国のフィードから地名で拾う層。
 *
 * ## いちばん大事なのは「他の地域を出さない」こと
 *
 * 「東区」「中央区」「北区」は全国に何度も出る。素朴に部分一致を取ると
 * **新潟市東区の頁に広島市東区のニュースが出る。**区や市の名前を鍵に
 * 使ってよいのは全国で 1 つしかないときだけ、という規則を固定する。
 *
 * 禁止語の一覧は手で書かない。`areaDirections.json` の実データから
 * 数えるので、掲載が増えても自動で追随する。
 */

const src = (id: string) => ({
  id,
  name: id,
  feedUrl: `https://example.com/${id}`,
  siteUrl: `https://example.com/${id}/`,
  note: "",
});

const news = (
  title: string,
  summary: string | null = null,
): MergedNewsItem => ({
  item: {
    title,
    link: `https://example.com/${encodeURIComponent(title)}`,
    publishedAt: "2026-09-01T00:00:00+09:00",
    summary,
  },
  source: src("test"),
});

describe("地名の候補", () => {
  it("県名を外した全体と、政令市の市の部分を返す", () => {
    expect(cityNameCandidates("新潟県", "新潟県新潟市東区")).toEqual([
      "新潟市東区",
      "新潟市",
    ]);
  });

  it("区だけの市区町村は 1 つだけ", () => {
    expect(cityNameCandidates("東京都", "東京都台東区")).toEqual(["台東区"]);
  });

  it("市で終わるものは市の部分を重ねない", () => {
    expect(cityNameCandidates("静岡県", "静岡県菊川市")).toEqual(["菊川市"]);
  });
});

describe("鍵の作り方", () => {
  it("1 つの都道府県にしか無い名前だけを市の鍵にする", () => {
    const keys = localNewsKeys("新潟県", "新潟県新潟市東区");
    expect(keys.pref).toBe("新潟県");
    /* 「東区」は複数の県に出るので入らない。「新潟市」は 8 区から
       候補に上がるが、県は新潟県だけなので鍵になる */
    expect(keys.city).toContain("新潟市東区");
    expect(keys.city).toContain("新潟市");
    expect(keys.city).not.toContain("東区");
  });

  it("同名の区が複数ある市区町村では、県だけで拾うことになる", () => {
    /*
      実データに「中央区」を持つ市区町村が複数あることを確かめてから
      判定する。ここが 1 件になったら前提が変わるので、検査も直す。
    */
    const chuo = AREAS.filter((a) => a.full.endsWith("中央区"));
    expect(chuo.length).toBeGreaterThan(1);
  });

  it("県名は接尾辞ごと使う（「大分」だけにしない）", () => {
    const keys = localNewsKeys("大分県", "大分県別府市");
    expect(keys.pref).toBe("大分県");
  });
});

describe("絞り込み", () => {
  const keys = localNewsKeys("新潟県", "新潟県新潟市東区");

  it("市の名前で当たる", () => {
    const got = filterLocalNews([news("新潟市東区で再開発が始まる")], keys, 10);
    expect(got).toHaveLength(1);
    expect(got[0].scope).toBe("city");
    expect(got[0].matched).toBe("新潟市東区");
  });

  it("別の県の同名の区は拾わない（これが本題）", () => {
    /* 「東区」を鍵にしていたら、これが混ざる */
    const got = filterLocalNews(
      [news("広島市東区で新しい団地の募集")],
      keys,
      10,
    );
    expect(got).toEqual([]);
  });

  it("県名で当たったものは市より後ろに回る", () => {
    const got = filterLocalNews(
      [news("新潟県で地価が動く"), news("新潟市で工事の発注")],
      keys,
      10,
    );
    expect(got.map((g) => g.scope)).toEqual(["city", "pref"]);
  });

  it("要約の側に地名があっても拾う", () => {
    const got = filterLocalNews(
      [news("団地の建替えについて", "新潟市東区の団地が対象です")],
      keys,
      10,
    );
    expect(got).toHaveLength(1);
  });

  it("同じ見出しを 2 回出さない", () => {
    /* 市と県の両方に当たる文。市として 1 回だけ出る */
    const got = filterLocalNews([news("新潟県新潟市東区の再開発")], keys, 10);
    expect(got).toHaveLength(1);
    expect(got[0].scope).toBe("city");
  });

  it("関係のない見出しは落とす", () => {
    const got = filterLocalNews([news("福岡市で新しい入札")], keys, 10);
    expect(got).toEqual([]);
  });

  it("limit で打ち切る", () => {
    const got = filterLocalNews(
      [news("新潟市の話1"), news("新潟市の話2"), news("新潟市の話3")],
      keys,
      2,
    );
    expect(got).toHaveLength(2);
  });

  it("市の鍵が無い頁でも県で拾える", () => {
    const generic = { pref: "東京都", city: [] };
    const got = filterLocalNews([news("東京都の住宅施策")], generic, 10);
    expect(got).toHaveLength(1);
    expect(got[0].scope).toBe("pref");
  });
});
