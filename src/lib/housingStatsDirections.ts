import {
  bearingBetween,
  COMPASS_DIRECTIONS,
  directionFromBearing,
  distanceKmBetween,
  type CompassDirection,
} from "@/utils/directionGeo";

/**
 * 市区町村別の住宅の統計（家賃・空き家）を、出発地から見た**方位ごと**に
 * まとめる。
 *
 * ## なぜ要るか（2026-09-11）
 *
 * 物件の在庫はどのポータルからも規約上取れない（CLAUDE.md 3 節）。
 * 利用者の判断で、**方位別の相場を公的データで出し、個別物件はリンクで
 * 渡す**方向へ変えた（backlog 26 節）。「その方位はいくらで住めるか」
 * 「空き家が多いか」を、地価公示・成約価格の隣に並べる。
 *
 * 出どころは e-Stat「統計でみる市区町村のすがた」Ｈ 居住（表 0000020108）。
 * 表には元の値だけを積んであり（丸めた値を積むと出どころに戻れない）、
 * 割り算はここで行う。
 *
 * ## 方位の出し方
 *
 * `bearingBetween` → `directionFromBearing` の 1 本だけを使う。八方位へ
 * 落とす実装を新しく書かない（CLAUDE.md 3 節）。市区町村の点は呼ぶ側が
 * 渡す（`areaContent` の代表点。掲載側の座標を優先する理由は
 * `municipalityCoords.mergeWithListed` の註）。
 */

/** 表の列そのまま（municipality_housing_stats）。欠測は null。 */
export interface HousingStatRow {
  area_code: string;
  area_name: string | null;
  total_dwellings: number | null;
  vacant_dwellings: number | null;
  rent_per_tatami_yen: number | null;
  tatami_per_rental: number | null;
  floor_area_per_rental: number | null;
}

/**
 * 市区町村の代表点。`areaContent` / `municipalityCoords` と同じ形。
 *
 * `pref` / `city` は `mergeWithListed` が返す点には入っている。名前の出どころを
 * **統計の行（`area_name`）ではなく代表点**に取るのは、`area_name` が県名を
 * 持たないため（「中央区」だけでは全国のどこか分からない）。
 */
export interface HousingPoint {
  code: string;
  lat: number;
  lon: number;
  pref?: string;
  city?: string;
}

/**
 * 方位に入った市区町村 1 件。
 *
 * **街を 1 件ずつ並べるために足した**（2026-09-14）。それまでは方位ごとの
 * 集計（何件・中央値）と上位 3 件の名前しか返しておらず、「その方位に
 * どの街があるか」を画面で出せなかった。
 *
 * 賃貸の巡回を止めたので（backlog 29 節）、物件検索は 10 月中旬に掲載が
 * 0 件になる。並べる先を**部屋から街へ**移すのが移行の本体で、ここはその
 * 材料（利用者の判断 A、2026-09-14）。
 *
 * `code` は JIS の 5 桁。`CityPortalLinks`（募集を見に行く導線）と
 * `/houi/area/{code}` がそのまま使える。
 */
export interface DirectionMunicipality {
  code: string;
  /** 県名込みの表示名。代表点に無ければ統計の行の名前に落ちる。 */
  name: string;
  distanceKm: number;
  /** 真北からの方位角（度）。境目の近さを画面で断るのに使う。 */
  bearing: number;
  /**
   * 代表点（方位と距離を測った点そのもの）。画面が「出発地から見た
   * この街」を「この地点を調べる」に渡すのに使う（2026-09-24）。
   * 街の名前だけで市区町村ページへ飛ばすと、**その街を起点にした方位**
   * の頁が開き、出発地から見た方位と食い違って見えていた。
   */
  lat: number;
  lon: number;
  /** 借家の家賃（円/㎡・月）。1 畳当たり家賃 ÷ 1.62。無ければ null。 */
  rentPerSqm: number | null;
  /** 空き家率（0〜1）。無ければ null。 */
  vacancyRate: number | null;
  /** 総住宅数。街の規模の目安。 */
  totalDwellings: number | null;
}

/**
 * 1 畳の面積（㎡）。不動産の表示規約（公正競争規約）が 1 畳 = 1.62 ㎡
 * 以上と定めていて、賃貸の㎡単価に直すときの定数として使う。
 */
export const TATAMI_SQM = 1.62;

export interface HousingDirectionStat {
  direction: CompassDirection;
  /** 集計に入った市区町村の数。**0 でも行を落とさない**（CLAUDE.md 2-c）。 */
  count: number;
  /** 1 畳当たり家賃が取れた市区町村の数。 */
  rentCount: number;
  /** 借家の家賃（円/㎡・月）の中央値。1 畳当たり家賃 ÷ 1.62。無ければ null。 */
  medianRentPerSqm: number | null;
  /**
   * 借家 1 戸の月額の目安（円）の中央値。1 畳当たり家賃 × 借家の平均畳数。
   * 平均どうしの積なので**目安**。画面でもそう書く。
   */
  medianMonthlyRentEstimate: number | null;
  /** 空き家率（0〜1）。方位内の空き家数の合計 ÷ 総住宅数の合計。 */
  vacancyRate: number | null;
  /** 空き家率に入った市区町村の数。 */
  vacancyCount: number;
  /** いちばん近い市区町村までの km。 */
  nearestKm: number | null;
  /** 総住宅数の多い順の市区町村名（最大 3 つ）。どこの話かを示す。 */
  topMunicipalities: string[];
  /**
   * その方位に入った市区町村。**近い順**（市区町村ページと同じ並び）。
   *
   * `count` は全部の数で、こちらは `perDirection` で切った分だけ。数と
   * 一覧が食い違って見えないよう、切ったときは `truncated` が立つ。
   */
  municipalities: DirectionMunicipality[];
  /** 一覧を `perDirection` で切ったか。画面が「ほかにも◯件」と書ける。 */
  truncated: boolean;
}

export const DEFAULT_MIN_KM = 5;
export const DEFAULT_MAX_KM = 150;
/** 1 方位あたりに返す市区町村の数の既定。市区町村ページの表と同じ 12。 */
export const DEFAULT_PER_DIRECTION = 12;

export interface HousingDirectionOptions {
  minKm?: number;
  maxKm?: number;
  /**
   * 1 方位あたりに返す市区町村の数。既定 12（市区町村ページの表と同じ）。
   *
   * 150km 圏でも 100 件を超える方位があるので、全部返すと応答が膨らむ。
   * **`count` は切らない**ので、数と一覧が食い違うことはない。
   */
  perDirection?: number;
  /**
   * 方位角を八方位に落とす規則。**判定と同じものを渡すこと。**
   *
   * ここは長らく `"traditional"` の決め打ちだった。ところがスキャナー
   * （`api/rentals/arbitrage`）は古典盤なら `traditional`、独自モデルなら
   * **`physical`（45 度等分）**で切っている。つまり**独自モデルを選んで
   * いる利用者は、同じ画面で 2 通りの方位割り当てを見ていた。**物件は
   * 45 度等分、この統計は伝統区分（四正 30 度・四隅 60 度）。四正と四隅の
   * 境目にある街は、物件一覧では東なのに統計では北東になる。
   *
   * CLAUDE.md 3 節の「同じ画面で地図は合成、スコアカードは全統合」
   * （#1118〜#1121）と同じ形の食い違い。
   *
   * **既定は `"traditional"`**。渡さない呼び出しの答えは 1 件も変わらない。
   */
  nodeMapping?: "traditional" | "physical";
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const at = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[at];
}

interface Bucket {
  items: DirectionMunicipality[];
  rentPerSqm: number[];
  monthly: number[];
  vacant: number;
  total: number;
  vacancyCount: number;
  count: number;
  nearest: number | null;
  names: { name: string; size: number }[];
}

/**
 * 出発地から見た方位ごとに住宅の統計をまとめる。
 *
 * **8 方位を必ず全部返す。**市区町村が無い方位も `count: 0` で返し、
 * 呼ぶ側が「その方位には材料が無い」と書けるようにする。黙って消すと、
 * 同じ画面の他の表と方位の数が食い違う（CLAUDE.md 2-c）。
 *
 * 点が無い市区町村（代表点の出典に無い）は集計に入らない。
 */
export function housingStatsByDirection(
  rows: readonly HousingStatRow[],
  points: readonly HousingPoint[],
  baseLat: number,
  baseLon: number,
  options: HousingDirectionOptions = {},
): HousingDirectionStat[] {
  const minKm = options.minKm ?? DEFAULT_MIN_KM;
  const maxKm = options.maxKm ?? DEFAULT_MAX_KM;
  const nodeMapping = options.nodeMapping ?? "traditional";
  const perDirection = Math.max(
    0,
    options.perDirection ?? DEFAULT_PER_DIRECTION,
  );
  const pointByCode = new Map(points.map((p) => [p.code, p]));

  const buckets = new Map<CompassDirection, Bucket>();
  for (const d of COMPASS_DIRECTIONS) {
    buckets.set(d, {
      items: [],
      rentPerSqm: [],
      monthly: [],
      vacant: 0,
      total: 0,
      vacancyCount: 0,
      count: 0,
      nearest: null,
      names: [],
    });
  }

  for (const row of rows) {
    const p = pointByCode.get(row.area_code);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;

    const km = distanceKmBetween(baseLat, baseLon, p.lat, p.lon);
    if (km < minKm || km > maxKm) continue;

    /* 判定と同じ真北の方位角で、**判定と同じ規則**で切る。磁北は使わない
       （CLAUDE.md 3 節）。規則を決め打ちにすると、独自モデルを選んだ人の
       画面で物件と統計が別の方位を指す（`nodeMapping` の註） */
    const bearing = bearingBetween(baseLat, baseLon, p.lat, p.lon);
    const direction = directionFromBearing(bearing, nodeMapping);
    const b = buckets.get(direction)!;
    b.count += 1;
    if (b.nearest === null || km < b.nearest) b.nearest = km;

    const rent = row.rent_per_tatami_yen;
    if (rent !== null && Number.isFinite(rent) && rent > 0) {
      b.rentPerSqm.push(rent / TATAMI_SQM);
      const tatami = row.tatami_per_rental;
      if (tatami !== null && Number.isFinite(tatami) && tatami > 0) {
        b.monthly.push(rent * tatami);
      }
    }

    const total = row.total_dwellings;
    const vacant = row.vacant_dwellings;
    if (
      total !== null &&
      vacant !== null &&
      Number.isFinite(total) &&
      Number.isFinite(vacant) &&
      total > 0 &&
      vacant >= 0
    ) {
      b.total += total;
      b.vacant += vacant;
      b.vacancyCount += 1;
    }

    if (row.area_name) {
      b.names.push({ name: row.area_name, size: total ?? 0 });
    }

    /* 街 1 件ぶん。**名前は代表点（県名込み）を優先する。**統計の行の
       `area_name` は県名を持たないので、「中央区」だけでは全国のどこか
       分からない */
    const rentPerSqm =
      rent !== null && Number.isFinite(rent) && rent > 0
        ? Math.round(rent / TATAMI_SQM)
        : null;
    const vacancyRate =
      total !== null &&
      vacant !== null &&
      Number.isFinite(total) &&
      Number.isFinite(vacant) &&
      total > 0 &&
      vacant >= 0
        ? vacant / total
        : null;
    b.items.push({
      code: row.area_code,
      name:
        p.pref && p.city
          ? `${p.pref}${p.city}`
          : (row.area_name ?? row.area_code),
      distanceKm: Math.round(km),
      bearing: Math.round(bearing),
      /* 小数 4 桁（約 10m）で足りる。代表点そのものが数 km の平均 */
      lat: Math.round(p.lat * 1e4) / 1e4,
      lon: Math.round(p.lon * 1e4) / 1e4,
      rentPerSqm,
      vacancyRate,
      totalDwellings: total !== null && Number.isFinite(total) ? total : null,
    });
  }

  return COMPASS_DIRECTIONS.map((direction) => {
    const b = buckets.get(direction)!;
    const rentSorted = b.rentPerSqm.slice().sort((x, y) => x - y);
    const monthlySorted = b.monthly.slice().sort((x, y) => x - y);
    const topMunicipalities = b.names
      .slice()
      .sort((x, y) => y.size - x.size || x.name.localeCompare(y.name, "ja"))
      .slice(0, 3)
      .map((n) => n.name);
    const medianRent = quantile(rentSorted, 0.5);
    const medianMonthly = quantile(monthlySorted, 0.5);
    return {
      direction,
      count: b.count,
      rentCount: rentSorted.length,
      medianRentPerSqm: medianRent === null ? null : Math.round(medianRent),
      medianMonthlyRentEstimate:
        medianMonthly === null ? null : Math.round(medianMonthly),
      vacancyRate: b.total > 0 ? b.vacant / b.total : null,
      vacancyCount: b.vacancyCount,
      /* 近い順。市区町村ページの表と同じ並び。同距離は名前で安定させる
         （並びが実行ごとに変わると、画面の差分が読めない） */
      municipalities: b.items
        .slice()
        .sort(
          (x, y) =>
            x.distanceKm - y.distanceKm || x.name.localeCompare(y.name, "ja"),
        )
        .slice(0, perDirection),
      truncated: b.items.length > perDirection,
      nearestKm: b.nearest === null ? null : Math.round(b.nearest * 10) / 10,
      topMunicipalities,
    };
  });
}
