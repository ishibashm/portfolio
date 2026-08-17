import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * 「データベースに保存」を撤去したことの固定。
 *
 * 撤去した理由は 3 つで、どれも直しても意味のある機能にならなかった。
 *
 *   - **DB に入っていなかった。**保存先の `/api/metaphysical-log` は
 *     process.cwd()/data/metaphysical_logs.jsonl への追記で、Cloud Run の
 *     コンテナは使い捨てなので次の起動で消えていた。Prisma の
 *     MetaphysicalStateLog には誰も書き込んでいなかった
 *   - **認可が無かった。**誰でも POST できて、本命星・座標・盤の全体を
 *     そのまま行として書き足せた
 *   - **失敗しても「保存しました」と出ていた**（res.ok しか見ていない）
 *
 * 同じものが戻ってこないよう、口とその呼び出しの両方をここで見張る。
 * 盤を残す用途は隣の「テレメトリ書き出し」（CSV / JSON）が担う。
 */

const ROOT = process.cwd();

/** src 配下の .ts / .tsx を全部読む。 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("データベースに保存（撤去済み）", () => {
  it("/api/metaphysical-log の口が無い", () => {
    expect(
      fs.existsSync(path.join(ROOT, "src/app/api/metaphysical-log")),
      "認可の無い書き込み口が戻っている",
    ).toBe(false);
  });

  it("どこからも /api/metaphysical-log を呼んでいない", () => {
    // 経緯を書いたコメントは残してあるので、文字列を含むかではなく
    // **呼び出しの形**（fetch の引数に来ているか）で見る。
    const calls = /fetch\(\s*[`"']\/api\/metaphysical-log/;
    const callers = sourceFiles(path.join(ROOT, "src")).filter((f) =>
      calls.test(fs.readFileSync(f, "utf8")),
    );
    expect(callers.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("書き出しの導線は残っている（撤去しすぎていないこと）", () => {
    // 盤を残す用途はこちらが担う。両方消すと利用者の手が無くなる。
    const clock = fs.readFileSync(
      path.join(ROOT, "src/components/SolarTimeClock.tsx"),
      "utf8",
    );
    expect(clock).toContain("exportMasterTelemetry");
  });
});
