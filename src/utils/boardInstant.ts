import { calculateSolarTime, getZonedDateTimeFields } from "@/utils/solarTime";

/** 判定に使う暦の基準（日本標準時）。 */
const JST_OFFSET_HOURS = 9;

/**
 * 方位盤（年盤・月盤・日盤）を出すときの評価時刻。
 *
 * 地図の扇形とヒートマップのセルは、どちらも「その日のその方位が吉か凶か」を
 * 描いているのに、別々の時刻で計算していた。地図は時計の現在時刻、
 * ヒートマップは正午に丸めた時刻を使っていたため、太陽時に直したときに
 * 日をまたぎ、日盤と日の干支が 1 日ずれる。実測では 1 日 30 日ぶんのうち
 * 28 日で判定が食い違い、同じ日・同じ方位で地図が「大凶」ヒートマップが
 * 「大吉」ということが起きていた。
 *
 * 盤は年・月・日の単位でしか変わらないので、時刻は「その日の代表点」で
 * あればよい。正午に固定すると、
 *
 *   - 何時に画面を開いても同じ判定になる
 *   - 時計が進むたびに地図の色が変わることがなくなる
 *   - ヒートマップと必ず一致する
 *
 * の 3 つが同時に満たせる。時盤・八門など時刻そのものが要る表示は、
 * 従来どおり現在時刻を使う（この関数は使わない）。
 *
 * 経度は必ず出発地のものを渡すこと。太陽時は経度で変わるため、片方だけ
 * 目的地の経度で計算すると、やはり日をまたいで判定がずれる。
 *
 * @param baseTime  時計の現在時刻
 * @param timeOffsetDays 画面で選んでいる日のオフセット
 * @param lon       出発地の経度
 * @param dayOffset さらに何日ずらすか（ヒートマップの各列で使う）
 */
export function directionBoardInstant(
  baseTime: Date,
  timeOffsetDays: number,
  lon: number,
  dayOffset = 0,
): Date {
  const anchor = new Date(forecastAnchorMs(baseTime));
  const local = new Date(
    anchor.getTime() + (timeOffsetDays + dayOffset) * 86400000,
  );
  return calculateSolarTime(local, lon).solarTime;
}

/**
 * 上の「その日の代表点（正午）」を ms で返すだけの関数。
 *
 * 30 日ぶんを組み立てる画面（予報・ヒートマップ）は、これを useMemo の
 * 依存に置く。時計の baseTime をそのまま依存にすると、**日付が変わって
 * いないのに 60 秒ごとに 30 日ぶんを作り直す。**実測（クラウド側）で
 * 予報 79ms ＋ 全モデル予報 97ms の計 176ms が毎分メインスレッドを
 * 止めていた。地図の操作が引っかかる原因のひとつ。
 *
 * **正午から動かさないこと。**動かすと予報と地図が別の盤を見る
 * （`__tests__/forecastAnchor.test.ts` が落ちる）。
 *
 * **正午は「日本時間の正午」。**以前は `setHours(12, 0, 0, 0)` で
 * 丸めていたが、`setHours` は**実行環境のタイムゾーン**で動く。本番
 * （Cloud Run）は UTC なので、サーバ側を通る判定
 * （`/api/relocation/auspicious-days` など）だけが 12時 UTC ＝
 * **21時 JST** の盤を見ていた。ブラウザ（日本の利用者）は 12時 JST
 * なので、同じ日を 9 時間ずれた時刻で判定していたことになる。
 *
 * 実害は節入りが 12〜21時 JST に来る日に出る。立春でいうと
 * 1950〜2050 年の 101 年のうち **34 年**で年盤の星が食い違い、
 * 本命星 9 × 8 方位 = 7,272 通りのうち **1,930 通り**が別の判定に
 * なった。直近は **2028年2月4日**（立春 16時31分 JST）で、`/calendar`
 * と ホームの時計・ヒートマップが同じ日に別の年盤を出す。
 *
 * `directionBoardInstant` は「地図とヒートマップが別の時刻で計算して
 * 日をまたぐ」のを防ぐために作った関数なので、これは作った目的その
 * ものが破れていた。#456（`Solar.fromDate` の TZ 依存）と同じ形の
 * 事故で、`setHours` 経由のこちらが残っていた。
 */
export function forecastAnchorMs(baseTime: Date): number {
  const f = getZonedDateTimeFields(baseTime, JST_OFFSET_HOURS);
  // JST の正午 ＝ UTC の (12 - 9) 時。環境のタイムゾーンに依存しない。
  return Date.UTC(f.year, f.month - 1, f.day, 12 - JST_OFFSET_HOURS, 0, 0, 0);
}
