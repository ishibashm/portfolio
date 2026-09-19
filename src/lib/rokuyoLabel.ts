/**
 * 六曜の札から、ローマ字の併記を落とす。
 *
 * `utils/lunar` の `ROKUYO` は `"大安 (Taian)"` の形で持っている。
 * **内部で持つのはこの形のまま**でよい（`rokuyo.includes("大安")` で
 * 判定している所が複数ある）が、**画面に出すときは日本語だけ**にする。
 *
 * ## なぜ utils/lunar に置かないか
 *
 * `utils/lunar` は lunar-javascript を値で import している。ここから
 * 引くと、六曜の字面を整えたいだけの画面（物件検索の
 * `AstroGridCalendar` など）に**暦エンジンが丸ごと乗る**。
 * `__tests__/arbitrageBundleLeaf.test.ts` が実際にそれを止めた
 * （page.tsx → AstroGridCalendar → utils/lunar → lunar-javascript）。
 *
 * 文字列を整えるだけの関数なので、依存の無いここに置く。
 * `utils/lunar` は同じものを再輸出するので、既存の import 先はそのまま
 * 動く。定義は 1 か所のまま。
 */
export function plainRokuyo(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
