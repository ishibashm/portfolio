import { describe, expect, it } from "vitest";
import {
  QUERIES_PER_CALL,
  bestByQuery,
  buildCoverageRequest,
  chunkQueries,
  isRentQuery,
  mockCoverage,
  parseQueriesCsv,
  questionId,
  type SearchQuery,
} from "../scripts/queryCoverage";
import { parseAnswer } from "../scripts/linkCandidates";

const q = (query: string, impressions = 1): SearchQuery => ({
  query,
  clicks: 0,
  impressions,
  position: 10,
});

describe("parseQueriesCsv（Search Console の「クエリ.csv」）", () => {
  it("書き出しのままの形を読む（BOM・空白入りの検索語・% の CTR）", () => {
    const csv =
      "﻿上位のクエリ,クリック数,表示回数,CTR,掲載順位\r\n" +
      "天 中 殺 引越し 影響,0,14,0%,45.21\r\n" +
      "大殺界と天中殺の違い,0,8,0%,10\r\n";
    expect(parseQueriesCsv(csv)).toEqual([
      {
        query: "天 中 殺 引越し 影響",
        clicks: 0,
        impressions: 14,
        position: 45.21,
      },
      {
        query: "大殺界と天中殺の違い",
        clicks: 0,
        impressions: 8,
        position: 10,
      },
    ]);
  });

  it('引用符で囲んだ検索語（中の , と ""）を 1 欄として読む', () => {
    const csv =
      "上位のクエリ,クリック数,表示回数,CTR,掲載順位\n" +
      '"方位, ""吉"" とは",1,3,33%,2\n';
    expect(parseQueriesCsv(csv)[0]).toEqual({
      query: '方位, "吉" とは',
      clicks: 1,
      impressions: 3,
      position: 2,
    });
  });

  it("列は見出しの名前で引く（並びが違っても同じ値）", () => {
    const csv =
      "表示回数,掲載順位,上位のクエリ,CTR,クリック数\n5,7.5,日取り,0%,0\n";
    expect(parseQueriesCsv(csv)).toEqual([
      { query: "日取り", clicks: 0, impressions: 5, position: 7.5 },
    ]);
  });

  it("別の表（ページ.csv）を渡したら黙って読まずに止まる", () => {
    const csv =
      "上位のページ,クリック数,表示回数,CTR,掲載順位\nhttps://x/,1,2,50%,3\n";
    expect(() => parseQueriesCsv(csv)).toThrow(/上位のクエリ/);
  });
});

describe("chunkQueries", () => {
  it("全部の検索語を 1 回ずつ、通し番号つきで分ける", () => {
    const qs = Array.from({ length: QUERIES_PER_CALL * 2 + 3 }, (_, i) =>
      q(`語${i}`),
    );
    const chunks = chunkQueries(qs);
    expect(chunks.map((c) => c.length)).toEqual([
      QUERIES_PER_CALL,
      QUERIES_PER_CALL,
      3,
    ]);
    const indices = chunks.flat().map((c) => c.index);
    expect(indices).toEqual(qs.map((_, i) => i));
    for (const { index, query } of chunks.flat()) {
      expect(query).toBe(qs[index]);
    }
  });
});

describe("buildCoverageRequest", () => {
  const post = {
    title: "天中殺と大殺界の違いは何か",
    description: "説明文",
    body: "## 先に結論\n\n- 別の体系です\n\n## 二つ目\n\n本文の続き",
  };
  const chunk = chunkQueries([q("大殺界と天中殺の違い"), q("日取り")])[0];
  const req = buildCoverageRequest(post, chunk, "typesafe/jev-1.13");

  it("検索語 1 つにつき問いを 2 つ。id は [a-z0-9_] だけ", () => {
    expect(Object.keys(req.questions)).toEqual([
      "q0_answers",
      "q0_lead",
      "q1_answers",
      "q1_lead",
    ]);
    for (const id of Object.keys(req.questions)) {
      expect(id).toMatch(/^[a-z0-9_]+$/);
    }
    expect(req.questions.q1_answers.instructions).toContain("「日取り」");
  });

  it("state に題・説明文・冒頭・本文の全体が入る（冒頭は最初の節まで）", () => {
    expect(req.state).toContain("【題】天中殺と大殺界の違いは何か");
    expect(req.state).toContain("【説明文】説明文");
    const lead = req.state
      .split("【冒頭（最初の節）】")[1]
      .split("【本文の全体】")[0];
    expect(lead).toContain("別の体系です");
    expect(lead).not.toContain("本文の続き");
    expect(req.state.split("【本文の全体】")[1]).toContain("本文の続き");
  });

  it("答えの名前を parseAnswer で読める（実測の応答の形）", () => {
    const res = {
      answers: { [questionId(1, "lead")]: { type: "noul", noul: 0.31 } },
    };
    expect(parseAnswer(res, questionId(1, "lead"))?.probability).toBe(0.31);
  });
});

describe("bestByQuery", () => {
  const qs = [q("a"), q("b"), q("c")];
  const scores = [
    { slug: "x", index: 0, answers: 0.4, lead: 0.1 },
    { slug: "y", index: 0, answers: 0.8, lead: 0.2 },
    { slug: "z", index: 0, answers: 0.6, lead: 0.9 },
    { slug: "x", index: 1, answers: 0.2, lead: 0.2 },
  ];
  const cov = bestByQuery(qs, scores, 0.5);

  it("answers が最も高い記事を選び、冒頭の値もその記事のものを持つ", () => {
    expect(cov[0].best).toEqual({
      slug: "y",
      index: 0,
      answers: 0.8,
      lead: 0.2,
    });
    expect(cov[0].answering).toBe(2);
  });

  it("答えていない検索語も、採点の無い検索語も落とさない", () => {
    expect(cov).toHaveLength(3);
    expect(cov[1].best?.slug).toBe("x");
    expect(cov[1].answering).toBe(0);
    expect(cov[2].best).toBeNull();
  });
});

describe("isRentQuery", () => {
  it.each([
    ["家賃 相場 千葉", true],
    ["千葉県 物件相場", true],
    ["愛知 賃貸相場", true],
    ["天 中 殺 引越し 影響", false],
    ["日取りとは", false],
  ])("%s → %s", (query, want) => {
    expect(isRentQuery(query)).toBe(want);
  });
});

describe("mockCoverage", () => {
  it("決定的で、0〜1 に収まる", () => {
    const post = { title: "題", body: "## 先に結論\n\n天中殺の引越し" };
    const a = mockCoverage(post, q("天中殺 引越し"));
    expect(a).toEqual(mockCoverage(post, q("天中殺 引越し")));
    for (const v of Object.values(a)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
