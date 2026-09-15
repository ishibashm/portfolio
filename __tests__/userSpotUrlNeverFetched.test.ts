import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
  登録した地点に持たせる「物件ページへの印」（`user_spots.url`）。

  ## いちばん大事な決め — 取りに行かない

  取りに行けばスクレイピングで、nifty の特約は「プログラム等を用いて
  自動的にデータを収集する行為（スクレイピング）」を名指しで禁じている。
  **利用者が 1 件ずつ押すのだとしても、取りに行くのはこちらのプログラム**
  なので、量は違っても規約上の扱いは変わらない。

  backlog 25 節で一度間違えた形（「負荷が軽いから大丈夫」と判断したが、
  規約は名指しで禁じていた）。同じことを繰り返さないよう、**機械で
  固定する。**

  ## 置き場

  DDL は `ADD COLUMN IF NOT EXISTS` だけ。**既定値を置かない**
  （当てた日に既存の全行がその値を持ったことになる。CLAUDE.md 6 節）。
*/

const DDL = "prisma/sql/20260915_add_user_spot_url.sql";

function allSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(name)) out.push(full);
    }
  };
  walk(join(process.cwd(), dir));
  return out;
}

describe("印の URL を取りに行かない", () => {
  /*
    母集団はソース全部。字面で「fetch(spot.url)」を探すのではなく、
    **地点の URL を扱っているファイル**を先に絞ってから、その中に
    取得の呼び出しが無いことを見る（語で探すと取りこぼす。
    CLAUDE.md 4 節）。
  */
  const files = [...allSourceFiles("src"), ...allSourceFiles("scripts")];

  it("見張りが空回りしていない（走査できている）", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  /*
    **取りに行く先が URL 自身**のときだけを見る（第 1 引数）。

    最初 `[^)]*` で書いたら、`fetch("/api/spots", { body: … url … })` を
    拾って落ちた。こちらの API へ「印を送る」呼び出しで、取りに行っては
    いない。**カンマの手前まで**に絞ると第 1 引数だけを見られる。
  */
  const FETCHES_SPOT_URL =
    /(?:fetch|axios(?:\.\w+)?|got|request)\s*\(\s*[^,)]*\b(?:spot|userSpot)\w*\.url\b/i;

  it("見張りの形が正しい（拾うものと拾わないもの）", () => {
    /* 空回り防止。取りに行く形を拾い、送るだけの形を拾わないこと */
    expect(FETCHES_SPOT_URL.test("await fetch(spot.url)")).toBe(true);
    expect(FETCHES_SPOT_URL.test("fetch(`${userSpot.url}`)")).toBe(true);
    expect(FETCHES_SPOT_URL.test("axios.get(spot.url, {})")).toBe(true);
    expect(
      FETCHES_SPOT_URL.test(
        'fetch("/api/spots", { body: j({ url: spot.url }) })',
      ),
    ).toBe(false);
  });

  it("地点の URL を取得している所が無い", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (FETCHES_SPOT_URL.test(readFileSync(f, "utf8"))) {
        offenders.push(relative(process.cwd(), f));
      }
    }
    expect(
      offenders,
      `地点の URL を取りに行っている:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("物件ポータルのホストへ要求を出していない", () => {
    /* 表示用のリンク（portalLinks の台帳）は文字列として持つだけ。
       取得の呼び出しの中にホストが現れたら落とす */
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (
        /(?:fetch|axios(?:\.\w+)?|got)\s*\(\s*[`"'][^`"']*(?:suumo\.jp|homes\.co\.jp|eheya\.net|shamaison\.com|myhome\.nifty\.com)/i.test(
          src,
        )
      ) {
        offenders.push(relative(process.cwd(), f));
      }
    }
    expect(
      offenders,
      `ポータルへ要求を出している:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("足すだけの DDL", () => {
  const raw = readFileSync(join(process.cwd(), DDL), "utf8");
  /*
    **コメントを落としてから見る。**この DDL の註には「既定値（DEFAULT）を
    置かない」と書いてあるので、字面のままだと自分の説明文を拾って落ちる
    （実際に落ちた。CLAUDE.md の「字面で見るとコメントを拾う」）。
  */
  const sql = raw
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("ADD COLUMN IF NOT EXISTS だけ（消さない・型を変えない）", () => {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const st of statements) {
      expect(st, st).toMatch(
        /^ALTER TABLE user_spots ADD COLUMN IF NOT EXISTS/,
      );
    }
    /* 戻せない操作が混ざっていない（CLAUDE.md 6 節） */
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    expect(sql).not.toMatch(/\bDELETE\b|\bUPDATE\b|\bTRUNCATE\b/i);
  });

  it("既定値を置いていない", () => {
    /* 置くと当てた日に既存の全行がその値を選んだことになる */
    expect(sql).not.toMatch(/\bDEFAULT\b/i);
  });

  it("スキーマと列がそろっている（片方だけ直さない）", () => {
    /* db push はスキーマに無い列を消す。DDL だけ当てて schema.prisma を
       直し忘れると、次の run-seed で消える（CLAUDE.md 3 節） */
    const schema = readFileSync(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    const model = schema.slice(
      schema.indexOf("model UserSpot {"),
      schema.indexOf('@@map("user_spots")'),
    );
    for (const col of ["url", "memo"]) {
      expect(sql, col).toContain(`ADD COLUMN IF NOT EXISTS ${col} `);
      /* NULL 可であること。DDL に NOT NULL が無いので `?` でそろえる */
      expect(model, col).toMatch(new RegExp(`\\b${col}\\s+String\\?`));
    }
  });
});
