/**
 * 地上気圧と、過去 3 時間の変化量。
 *
 * bioModelingEngine は最初から `pressureDrop`（過去 3 時間の気圧降下量, hPa）
 * を入力に持っていて、1hPa の低下ごとに交感神経負荷を +3%、最大 30% まで
 * 積む「気象病」モデルが実装されている。標高ペナルティや磁気嵐ペナルティと
 * 組み合わさると相乗ぶんも乗る。
 *
 * ただし値を渡す側が無く、SolarTimeClock は `useState(0)` のまま一度も
 * setter を呼んでいなかった。つまりこのモデルは常に「気圧変化なし」で
 * 走っていた。ここが取得側。
 *
 * Open-Meteo を使う。API キーが要らず、非商用の利用が無償で認められている。
 * 気圧は `surface_pressure`（実測の地上気圧, hPa）を取る。海面更正した
 * `pressure_msl` ではない。気象病は「その場所で実際にかかっている圧力」の
 * 変化なので、標高で補正していない値を使う。
 */

export interface SurfacePressureData {
  /** 直近の観測時刻に対応する地上気圧 (hPa)。取れなければ null。 */
  current: number | null;
  /** 3 時間前の地上気圧 (hPa)。取れなければ null。 */
  threeHoursAgo: number | null;
  /**
   * 過去 3 時間の変化量 (hPa)。**負の値が降下**。
   *
   * bioModelingEngine が `pressureDrop < 0` で判定しているので、符号は
   * 「現在 − 3 時間前」で揃える。取れなければ null（0 ではない。0 は
   * 「変化なしと分かっている」であって「分からない」ではない）。
   */
  drop: number | null;
  /** current が対応する時刻 (ISO)。 */
  timestamp: string | null;
}

const EMPTY: SurfacePressureData = {
  current: null,
  threeHoursAgo: null,
  drop: null,
  timestamp: null,
};

export async function fetchSurfacePressure(
  lat: number,
  lon: number,
): Promise<SurfacePressureData> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return EMPTY;

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    "&hourly=surface_pressure&past_days=1&forecast_days=1&timezone=UTC";

  try {
    // revalidate はサーバの fetch でしか効かない。/api/surface-pressure
    // 経由で呼ぶこと（/api/space-weather と同じ理由）。
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return EMPTY;

    const json = await res.json();
    const times: unknown = json?.hourly?.time;
    const values: unknown = json?.hourly?.surface_pressure;
    if (!Array.isArray(times) || !Array.isArray(values)) return EMPTY;

    // 予報ぶんも含まれるので、いまより後の時刻は使わない。
    const now = Date.now();
    let idx = -1;
    for (let i = 0; i < times.length; i++) {
      const t = Date.parse(`${times[i]}Z`);
      if (Number.isNaN(t) || t > now) break;
      if (typeof values[i] === "number") idx = i;
    }
    if (idx < 0) return EMPTY;

    const current = values[idx] as number;
    // hourly なので 3 本前がちょうど 3 時間前。過去 1 日ぶん取っている
    // ので、深夜 0 時台に開いても遡れる。
    const prev = idx >= 3 ? values[idx - 3] : null;
    const threeHoursAgo = typeof prev === "number" ? prev : null;

    return {
      current,
      threeHoursAgo,
      drop:
        threeHoursAgo === null
          ? null
          : Number((current - threeHoursAgo).toFixed(2)),
      timestamp: `${times[idx]}Z`,
    };
  } catch {
    // 取れなくても画面は動く。宇宙天気と同じ扱いで、空を返す。
    return EMPTY;
  }
}
