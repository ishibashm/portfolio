/**
 * 地上気圧と、過去 3 時間の変化量。
 *
 * bioModelingEngine は最初から `pressureDrop`（過去 3 時間の気圧降下量, hPa）
 * を入力に持っていて、1hPa の低下ごとに交感神経負荷を +3%、最大 30% まで
 * 積む「気象病」モデルが実装されている。標高ペナルティや磁気嵐ペナルティと
 * 組み合わさると相乗ぶんも乗る。
 *
 * 値は気象庁ホームページの地上気象観測（アメダス地図に含まれる気象官署等）
 * の現地気圧を使う。海面更正した値（normalPressure）ではない。気象病は
 * 「その場所で実際にかかっている圧力」の変化なので、標高で補正していない
 * 値を使う。最寄りの観測点の値をもとに、3 時間変化を算出する。
 *
 * 利用条件は気象庁ホームページの利用規約（公共データ利用規約 第1.0版、
 * 商用利用可、出典と加工の記載が要る）。
 * https://www.jma.go.jp/jma/kishou/info/coment.html
 *
 * 以前は Open-Meteo を使っていたが、無料版が非商用向けのためやめた。
 */

import { JMA_PRESSURE_STATIONS } from "./jmaPressureStations";

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

export const FETCH_TIMEOUT_MS = 3000;
export const JMA_REVALIDATE_SECONDS = 900;
export const JMA_LATEST_TIME_URL =
  "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt";
/** 人が見るアメダスの地図（出典リンク） */
export const JMA_AMEDAS_PAGE_URL =
  "https://www.jma.go.jp/bosai/map.html#contents=amedas";

export const jmaPointUrl = (
  stationId: string,
  day: string,
  hourBlock: string,
) =>
  `https://www.jma.go.jp/bosai/amedas/data/point/${stationId}/${day}_${hourBlock}.json`;

/** 地点表の緯度経度は度と分。距離比較用に二乗距離（経度は緯度で補正）。 */
export function nearestPressureStation(
  lat: number,
  lon: number,
): (typeof JMA_PRESSURE_STATIONS)[number] | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cos = Math.cos((lat * Math.PI) / 180);
  let best: (typeof JMA_PRESSURE_STATIONS)[number] | null = null;
  let bestD = Infinity;
  for (const station of JMA_PRESSURE_STATIONS) {
    const dLat = station.lat - lat;
    const dLon = (station.lon - lon) * cos;
    const d = dLat * dLat + dLon * dLon;
    if (d < bestD) {
      bestD = d;
      best = station;
    }
  }
  return best;
}

/** 観測値は [値, 品質]。品質 0 が通常。 */
export function readPressure(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") return null;
  const pressure = (entry as { pressure?: unknown }).pressure;
  if (!Array.isArray(pressure)) return null;
  const value = pressure[0];
  const quality = pressure[1];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (quality !== 0 && quality !== null && quality !== undefined) return null;
  return value;
}

/**
 * アメダス地点データのキー（YYYYMMDDHHmmss、日本時間）をミリ秒にする。
 * 末尾に Z を付けない（キーは日本時間）。
 */
export function parseAmedasTime(key: string): number | null {
  const m = key.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** 日本時間の観測時刻から、3 時間ごとの地点ファイル名（日付と時刻の枠）を返す。 */
export function pointFileParts(at: Date): { day: string; hourBlock: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(pick("hour"));
  return {
    day: `${pick("year")}${pick("month")}${pick("day")}`,
    hourBlock: String(Math.floor(hour / 3) * 3).padStart(2, "0"),
  };
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Response | null> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: JMA_REVALIDATE_SECONDS },
    } as RequestInit);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function latestObservationTime(fetchImpl: typeof fetch): Promise<Date> {
  const res = await fetchWithTimeout(JMA_LATEST_TIME_URL, fetchImpl);
  if (res) {
    const text = (await res.text()).trim();
    const t = Date.parse(text);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return new Date();
}

type Observation = { time: number; value: number; key: string };

function observationsFromPoint(json: unknown, notAfter: number): Observation[] {
  if (!json || typeof json !== "object") return [];
  const out: Observation[] = [];
  for (const [key, entry] of Object.entries(json as Record<string, unknown>)) {
    const time = parseAmedasTime(key);
    const value = readPressure(entry);
    if (time === null || value === null || time > notAfter) continue;
    out.push({ time, value, key });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

function pickAtOrBefore(
  rows: Observation[],
  target: number,
): Observation | null {
  let found: Observation | null = null;
  for (const row of rows) {
    if (row.time > target) break;
    found = row;
  }
  return found;
}

export async function fetchSurfacePressure(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<SurfacePressureData> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return EMPTY;
  const station = nearestPressureStation(lat, lon);
  if (!station) return EMPTY;

  try {
    const latest = await latestObservationTime(fetchImpl);
    const currentParts = pointFileParts(latest);
    const pastParts = pointFileParts(
      new Date(latest.getTime() - 3 * 60 * 60 * 1000),
    );
    const urls = [
      jmaPointUrl(station.id, currentParts.day, currentParts.hourBlock),
    ];
    if (
      pastParts.day !== currentParts.day ||
      pastParts.hourBlock !== currentParts.hourBlock
    ) {
      urls.push(jmaPointUrl(station.id, pastParts.day, pastParts.hourBlock));
    }

    const responses = await Promise.all(
      urls.map((url) => fetchWithTimeout(url, fetchImpl)),
    );
    const notAfter = latest.getTime();
    const rows: Observation[] = [];
    for (const res of responses) {
      if (!res) continue;
      const json = await res.json();
      rows.push(...observationsFromPoint(json, notAfter));
    }
    rows.sort((a, b) => a.time - b.time);
    const currentRow = pickAtOrBefore(rows, notAfter);
    if (!currentRow) return EMPTY;

    const pastTarget = currentRow.time - 3 * 60 * 60 * 1000;
    const pastCandidate = pickAtOrBefore(rows, pastTarget);
    // ちょうど 3 時間前に近い値だけ使う（20 分より前なら欠測扱い）。
    const pastRow =
      pastCandidate && pastTarget - pastCandidate.time <= 20 * 60 * 1000
        ? pastCandidate
        : null;
    const current = currentRow.value;
    const threeHoursAgo = pastRow ? pastRow.value : null;

    return {
      current,
      threeHoursAgo,
      drop:
        threeHoursAgo === null
          ? null
          : Number((current - threeHoursAgo).toFixed(2)),
      timestamp: new Date(currentRow.time).toISOString(),
    };
  } catch {
    // 取れなくても画面は動く。宇宙天気と同じ扱いで、空を返す。
    return EMPTY;
  }
}
