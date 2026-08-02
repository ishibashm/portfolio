import { calculateSolarTime } from "@/utils/solarTime";

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
  const anchor = new Date(baseTime);
  anchor.setHours(12, 0, 0, 0);
  const local = new Date(
    anchor.getTime() + (timeOffsetDays + dayOffset) * 86400000,
  );
  return calculateSolarTime(local, lon).solarTime;
}
