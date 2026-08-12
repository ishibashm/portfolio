import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 物件スキャナーが、入力していない人に他人の命式で判定を出さないこと。
 *
 * 以前は運営者の生年月日（1988-11-25T04:26）と出生地（広島）が既定値として
 * 入っていた。本命殺・本命的殺・天中殺はここから決まるので、生年月日を
 * 一度も入れていない人にも判定が出ていた。本番で実測した状態:
 *
 *   入力欄の生年月日: 1988-11-25T04:26   ← 一度も入力していない
 *   「方位の吉凶で塗り分けます」は出ない  ← 判定は止まっていない
 *   「三盤吉」が出ている                  ← 本命星を使った判定が出ている
 *
 * 未入力を検知する仕組みはあったが、
 *
 *   const canJudgeDirections = Boolean(hasBaseLocation && birthDate && targetDate);
 *   if (!birthDate) missing.push("生年月日");
 *
 * 既定値が入っているぶん !birthDate が永久に偽で、発火しなかった。
 * 出発地の座標を空のままにしているのと同じ理由（設定していない人が
 * 「自分の吉方位」だと思ってしまう）で、生年月日も空にする。
 *
 * #166 でシミュレータの同じ形を直している。これはスキャナー本体の分。
 *
 * ここはソースを読んで見ている。8,000 行のクライアント component で、
 * 描画して初期 state を確かめるのが現実的でないため。
 */

const PAGE = join(
  process.cwd(),
  "src",
  "app",
  "relocation",
  "arbitrage",
  "page.tsx",
);
const src = readFileSync(PAGE, "utf8").split("\r\n").join("\n");

describe("物件スキャナーの既定値", () => {
  it("ページを読めている（空回りしていない）", () => {
    expect(src.length).toBeGreaterThan(10000);
    expect(src).toContain("canJudgeDirections");
  });

  it("生年月日に既定値を置いていない", () => {
    expect(src).toContain('const [birthDate, setBirthDate] = useState("");');
    expect(src).toContain(
      'const [localBirthDate, setLocalBirthDate] = useState("");',
    );
  });

  it("保存値が無いときも生年月日は空のまま読み込む", () => {
    // localStorage に何も無いときの初期値。ここに日付を置くと
    // useState を空にしても、マウント直後に上書きされて元に戻る。
    expect(src).toContain('let bDate = "";');
  });

  it("運営者の生年月日が値として残っていない", () => {
    // 文字列リテラルとして出てこないこと。上の経緯コメントは
    // 引用符の外に書いてあるので当たらない。
    expect(src).not.toContain('"1988-11-25');
    expect(src).not.toContain("'1988-11-25");
  });

  it("未入力を検知する側は触っていない", () => {
    // 既定値を外しただけで、判定を出す条件そのものは変えていない。
    expect(src).toContain("hasBaseLocation && birthDate && targetDate");
    expect(src).toContain('if (!birthDate) missing.push("生年月日");');
  });

  it("走査ボタンが無効な理由に生年月日が入っている", () => {
    // 以前は出発地の分しか無く、生年月日だけ未入力だとボタンが灰色の
    // まま理由が読めなかった（#160 で時期分析を直したのと同じ形）。
    expect(src).toContain("{(!hasBaseLocation || !birthDate) && (");
    expect(src).toContain("生年月日が未入力です。");
  });
});
