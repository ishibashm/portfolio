import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CORE_ROUTES } from "@/lib/siteStructure";

/**
 * 頁の metadata が、ルートの layout から**黙って継承したもの**で
 * 出ていないこと。
 *
 * ## canonical（2026-09-29 に見つけた）
 *
 * ルートの layout は `alternates: { canonical: "/" }` を持つ。canonical を
 * 書いていない頁はこれを継承するので、**その頁の canonical がホームを
 * 指す。**検索エンジンからは「ホームの重複」に見え、頁そのものが索引に
 * 載らなくなりうる。中核ルートの `/relocation/purchase` と
 * `/relocation/appraisal` がそうなっていた。どちらもサイトマップに
 * 載っていて noindex でもない。画面は普通に出るので、HTML の head を
 * 見比べるまで気付けない。
 *
 * ## title にサイト名が 2 回付く
 *
 * ルートの `title.template` は `%s | Cloud Palette`。子の頁が
 * 「… | Cloud Palette」まで書くと、`<title>` は
 * 「… | Cloud Palette | Cloud Palette」になる。openGraph の title には
 * template が掛からないので、そちらはサイト名込みで書いてよい（見ない）。
 *
 * 判定は TypeScript のパーサで metadata の object literal を見る
 * （homeAutoSaveOwnedProfile.test.ts と同じやり方）。字面で探すと、
 * この経緯を書いたコメントや openGraph の title を拾う。
 */

const APP = join(process.cwd(), "src/app");

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(p)) return null;
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text;
  return null;
}

/** ファイル中の `canonical: "..."`（文字列リテラルのもの）を全部返す */
function canonicalsIn(file: string): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isPropertyAssignment(n) &&
      propName(n) === "canonical" &&
      ts.isStringLiteralLike(n.initializer)
    ) {
      out.push(n.initializer.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(parse(file));
  return out;
}

/**
 * metadata の本体（title と description を持ち、openGraph / twitter の
 * 値ではない object literal）の title を、書いたままの字面で返す。
 */
function metadataTitles(file: string): string[] {
  const sf = parse(file);
  /* 題を定数（const TITLE = "…"）に出した頁もあるので、同じファイルの
     const の初期値をたどって読む（2026-09-30。openGraph と題を共有するため） */
  const consts = new Map<string, ts.Expression>();
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer)
      consts.set(n.name.text, n.initializer);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const textOf = (init: ts.Expression): string | null => {
    if (ts.isStringLiteralLike(init)) return init.text;
    if (ts.isTemplateExpression(init)) return init.getText();
    if (ts.isIdentifier(init) && consts.has(init.text))
      return textOf(consts.get(init.text)!);
    return null;
  };
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      const names = n.properties.map(propName);
      const parent = n.parent;
      const nested =
        ts.isPropertyAssignment(parent) &&
        ["openGraph", "twitter"].includes(propName(parent) ?? "");
      if (!nested && names.includes("title") && names.includes("description")) {
        const t = n.properties.find((p) => propName(p) === "title");
        if (t && ts.isPropertyAssignment(t)) {
          const text = textOf(t.initializer);
          if (text !== null) out.push(text);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function metadataFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "api") continue;
      out.push(...metadataFiles(p));
    } else if (name === "page.tsx" || name === "layout.tsx") {
      out.push(p);
    }
  }
  return out;
}

describe("中核ルートの canonical", () => {
  it.each(CORE_ROUTES.map((r) => r.href))(
    "%s は自分の URL を canonical に書いている（ルートの / を継承しない）",
    (href) => {
      const dir = join(APP, href);
      const files = ["page.tsx", "layout.tsx"]
        .map((f) => join(dir, f))
        .filter((f) => existsSync(f));
      expect(
        files.length,
        `${href} の page.tsx が見つからない`,
      ).toBeGreaterThan(0);
      const found = files.flatMap(canonicalsIn);
      expect(found).toContain(href);
    },
  );
});

describe("title にサイト名を重ねない", () => {
  const files = metadataFiles(APP).filter(
    // ルートの layout は template を持つ側なので対象外
    (f) => relative(APP, f) !== "layout.tsx",
  );

  it("検査の対象が見つかっている（空回りしていない）", () => {
    expect(files.flatMap(metadataTitles).length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => relative(process.cwd(), f)))("%s", (file) => {
    for (const title of metadataTitles(join(process.cwd(), file))) {
      expect(
        title,
        `template が「 | Cloud Palette」を付ける: ${title}`,
      ).not.toMatch(/\|\s*(Cloud Palette|\$\{SITE_NAME\})\s*$/);
    }
  });
});

/**
 * canonical を書いた metadata は、openGraph も自分で持つ（2026-09-30）。
 *
 * ルートの layout の openGraph は**ホームの**題・説明・URL を持つ。子が
 * openGraph を書かないとそれを丸ごと継承し、共有したカードがホームになる
 * （about・privacy・terms・/houi・/houi/area・/houi/fengshui・購入の相場・
 * 持ち込み査定の 8 頁がそうだった）。canonical を書いている＝自分の URL を
 * 持つ頁なので、カードも自分のものを出す。共通の項目は lib/siteUrl の
 * pageOpenGraph が埋める。
 */
function metadataObjectsWithCanonical(
  file: string,
): ts.ObjectLiteralExpression[] {
  const out: ts.ObjectLiteralExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      const alt = n.properties.find((p) => propName(p) === "alternates");
      if (
        alt &&
        ts.isPropertyAssignment(alt) &&
        ts.isObjectLiteralExpression(alt.initializer) &&
        alt.initializer.properties.some((p) => propName(p) === "canonical")
      )
        out.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(parse(file));
  return out;
}

describe("canonical を持つ頁は openGraph も持つ（ホームのカードを継承しない）", () => {
  const files = metadataFiles(APP).filter(
    (f) => relative(APP, f) !== "layout.tsx",
  );
  const withCanonical = files.filter(
    (f) => metadataObjectsWithCanonical(f).length > 0,
  );

  it("検査の対象が見つかっている（空回りしていない）", () => {
    expect(withCanonical.length).toBeGreaterThan(20);
  });

  it.each(withCanonical.map((f) => relative(process.cwd(), f)))(
    "%s",
    (file) => {
      for (const obj of metadataObjectsWithCanonical(
        join(process.cwd(), file),
      )) {
        expect(
          obj.properties.some((p) => propName(p) === "openGraph"),
          "openGraph が無いとルートの（ホームの）カードを継承する",
        ).toBe(true);
      }
    },
  );
});
