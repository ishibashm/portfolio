/**
 * 吉凶判定エンジンのバージョン。
 *
 * 判定は決定的な計算だが、その計算式自体は改良で変わる。実際に
 * 2026-08-10 に凶の重さの定義を五大凶殺へ一本化した際、過去のすべての
 * 日付の判定が遡って変わった。利用者が「あの日は吉と表示されたから
 * 決めた」と言うとき、当時のエンジンが何と言っていたかを再現できる
 * 必要がある。履歴の保存時にこの版を判定スナップショットへ添える。
 *
 * 次のどれかを変えたら必ず版を上げること:
 *   - noiseSeverity.ts（凶の重さ・五大凶殺の集合）
 *   - ephemerisEngine.calculateVectorCollision / filterCollisionByMode
 *   - auspiciousDays.gradeVerdict / judgeDay の判定条件
 *   - tenchusatsuPolicy の既定挙動
 */
export const JUDGMENT_ENGINE_VERSION = "2026.08.10-five-fatal";
