import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  FORMER_BIRTH_DATE,
  FORMER_BIRTH_LAT,
  FORMER_BIRTH_LON,
  FORMER_BASE_LAT,
  FORMER_BASE_LON,
  FORMER_BASE_AREA,
} from "./helpers/formerDefaults";

/**
 * 運営者の個人情報が、追跡されているファイルに戻ってきていないこと。
 *
 * このリポジトリは公開されている。既定値・検証データ・手順書・デバッグ
 * 出力に、運営者の生年月日・出生地・現住所・メールアドレスが入っていた。
 * 判定の穴（入力していない人に他人の命式で結果を出す）は #202 #208 #221
 * #223 #225 で塞いだが、値そのものは各所に残っていた。
 *
 * **git の履歴には平文で残っている。** ここが見ているのは「いまの
 * 追跡ファイルに入っていないこと」だけで、履歴からは消えない。それは
 * 履歴の書き換えでしか消せず、既に公開されているので取り返しは付かない。
 *
 * 追跡されているファイルだけを見る。手元にあるだけの作業ファイル
 * （docs/sessions のログなど）は公開されていないので対象外。
 */

const REPO = process.cwd();

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 走査対象。バイナリと、地理データそのもの（座標が偶然当たる）は外す。 */
const SKIP = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|geojson)$/i;
/**
 * 全国の公開データそのものも外す。駅名は町丁名と同じものが多く、
 * `src/data/stations.json`（国土数値情報 N02。9,046 駅）に運営者の住所の
 * 町丁名と同じ駅名が偶然入っていて、見張りが鳴った（run 33955677869）。
 * 駅名は公開データで、住所の漏れではない。**個別の名前で除外しない**
 * （ここに町丁名を書くと、それ自体が漏れになる）。
 */
const SKIP_FILES = new Set(["src/data/stations.json"]);

function scan(needle: string): string[] {
  const hits: string[] = [];
  for (const f of trackedFiles()) {
    if (SKIP.test(f) || SKIP_FILES.has(f)) continue;
    // このテスト自身と、見張り用の値を持つヘルパーは対象外。
    if (f === "__tests__/personalDataLeak.test.ts") continue;
    if (f === "__tests__/helpers/formerDefaults.ts") continue;
    let body: string;
    try {
      body = readFileSync(join(REPO, f), "utf8");
    } catch {
      continue;
    }
    if (body.includes(needle)) hits.push(f);
  }
  return hits;
}

describe("公開リポジトリに運営者の個人情報を置かない", () => {
  it("生年月日", () => {
    expect(scan(FORMER_BIRTH_DATE)).toEqual([]);
  });

  it("出生地の座標", () => {
    // 緯度と経度が両方そろって初めて地点になる。片方だけなら
    // 地理データに偶然当たるので、組で見る。
    const both = scan(FORMER_BIRTH_LAT).filter((f) =>
      scan(FORMER_BIRTH_LON).includes(f),
    );
    expect(both).toEqual([]);
  });

  it("現住所の座標", () => {
    const both = scan(FORMER_BASE_LAT).filter((f) =>
      scan(FORMER_BASE_LON).includes(f),
    );
    expect(both).toEqual([]);
  });

  it("現住所の町丁名", () => {
    expect(scan(FORMER_BASE_AREA)).toEqual([]);
  });
});

describe("ログイン画面", () => {
  const src = readFileSync(
    join(REPO, "src", "app", "login", "page.tsx"),
    "utf8",
  );

  it("メールアドレスを直に書かない", () => {
    // 本番のバンドルからは NODE_ENV のガードごと消える（実測済み）が、
    // 公開リポジトリのソースには平文で残り、収集の的になる。
    const emails = src.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
    expect(emails).toEqual([]);
  });

  it("開発用バイパスは環境変数が無ければ使えない", () => {
    expect(src).toContain("disabled={!process.env.NEXT_PUBLIC_ADMIN_EMAIL}");
    expect(src).toContain("if (!devUser) return;");
  });
});

describe("引越しシミュレータの例", () => {
  const src = readFileSync(
    join(REPO, "src", "app", "relocation", "simulator", "page.tsx"),
    "utf8",
  );

  it("出発地の例が 1 か所にまとまっている", () => {
    // 以前は運営者の自宅（町丁名と 4 桁の座標＝およそ 10m）が
    // 8 か所にばらまかれていた。
    expect(src).toContain("const EXAMPLE_START = {");
    expect(src).toContain('name: "京都市下京区",');
  });
});
