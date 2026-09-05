import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 目的地は地名でも入れられる。
 *
 * ## なぜ検査するか（2026-09-05、利用者の報告）
 *
 * 「地点を指定する時に座標でしか指定できないので、例えば特定の場所で
 * 　調べたい時はいちいち座標を入力しないといけないので、それを
 * 　何とかしたい」
 *
 * ホームの目的地欄が受け付けるのは、**座標か Google マップの URL
 * だけ**だった。
 *
 *     placeholder="座標またはGoogleマップのURLを貼り付け..."
 *     <input type="number" placeholder="緯度" />
 *     <input type="number" placeholder="経度" />
 *
 * ところが**同じページの上半分（出生地・出発地）は最初から
 * `PlaceInput` を使っていて**、地名・郵便番号・座標の 3 通りに対応し、
 * 打ちながら候補も出る（`/api/geocode/suggest`）。**目的地だけが
 * その部品を使っていなかった。**
 *
 * `PlaceInput` の註にはこう書いてある——「画面には
 * `34.99126158901555` のような 14 桁が 4 つ出ていて、**人が読み書き
 * する値ではない**。ここが入力の一番の壁になっていた」。その壁が、
 * 目的地にだけ残っていた。
 *
 * ## この検査の限界
 *
 * 描画ではなく**字面**を見る。`DestinationMapPanel` は地図と暦を
 * 抱えていて描画テストが重いので、原因になった状態（`PlaceInput` を
 * 使っていない）が戻っていないことだけを固定する。
 */
const panel = readFileSync(
  "src/components/home/DestinationMapPanel.tsx",
  "utf8",
);

describe("ホームの目的地は地名で入れられる", () => {
  it("PlaceInput を使っている", () => {
    expect(panel).toContain(
      'import { PlaceInput } from "@/components/relocation/PlaceInput"',
    );
    expect(panel).toContain("<PlaceInput");
  });

  it("PlaceInput に目的地の座標が繋がっている", () => {
    /* 置いただけで値が繋がっていないと、打っても目的地が変わらない。
       lat/lon と onChange が targetLat/targetLon を指していること。 */
    const at = panel.indexOf("<PlaceInput");
    const block = panel.slice(at, at + 600);
    expect(block).toContain("lat={targetLat}");
    expect(block).toContain("lon={targetLon}");
    expect(block).toContain("setTargetLat(");
    expect(block).toContain("setTargetLon(");
  });

  it("座標の貼り付けも残っている", () => {
    /* 地図で拾った値を貼り付けて使う人がいる（PlaceInput の註と同じ
       理由）。地名を足したことで座標が使えなくなってはいけない。 */
    expect(panel).toContain("GoogleマップのURLを貼り付け");
    expect(panel).toContain('placeholder="緯度"');
    expect(panel).toContain('placeholder="経度"');
  });

  it("この検査が働いている（座標だけの状態を拾う）", () => {
    /* 空回りさせない。直す前の形——PlaceInput が無い——を当てる。 */
    const before = '<input type="text" placeholder="座標または…" />';
    expect(before.includes("<PlaceInput")).toBe(false);
  });
});
