import { describe, it, expect } from "vitest";
import {
  buildWhereSql,
  candidateOrderSql,
  cleanPropertyName,
  innerSql,
  municipalityStatsSql,
  selectSql,
  statsSql,
  GeoFilters,
} from "@/utils/arbitrageQuery";
import { CANDIDATE_STRATEGIES } from "@/utils/arbitrageScoring";

const baseFilters: GeoFilters = {
  maxSeenDays: 0,
  maxBuildingAge: null,
  radiusKm: 0,
  baseLat: NaN,
  baseLon: NaN,
  minLat: NaN,
  maxLat: NaN,
  minLon: NaN,
  maxLon: NaN,
  prefecture: "all",
};

describe("cleanPropertyName", () => {
  it("階数・築年数の後置きを落とす", () => {
    expect(cleanPropertyName("サンプルマンション 3階 築10年の賃貸物件")).toBe(
      "サンプルマンション",
    );
    expect(cleanPropertyName("サンプルマンション 新築の賃貸物件")).toBe(
      "サンプルマンション",
    );
    expect(cleanPropertyName("サンプルマンション 地下1階 築5年3ヶ月の賃貸物件")).toBe(
      "サンプルマンション",
    );
  });

  it("後置きが無ければそのまま", () => {
    expect(cleanPropertyName("サンプルマンション")).toBe("サンプルマンション");
    expect(cleanPropertyName("")).toBe("");
  });
});

describe("buildWhereSql", () => {
  it("値は必ずプレースホルダで渡す（都道府県名を SQL に埋め込まない）", () => {
    const { sql, params } = buildWhereSql({
      ...baseFilters,
      prefecture: "愛知県'; DROP TABLE rental_properties;--",
    });
    expect(sql).not.toContain("DROP TABLE");
    expect(params).toContain("愛知県'; DROP TABLE rental_properties;--");
  });

  it("プレースホルダ番号が 1 から連番になる", () => {
    const { sql, params } = buildWhereSql({
      ...baseFilters,
      maxSeenDays: 30,
      maxBuildingAge: 15,
      prefecture: "愛知県",
    });
    const placeholders = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(placeholders).toEqual(
      Array.from({ length: params.length }, (_, i) => i + 1),
    );
  });

  it("prefecture が all のときは住所条件を付けない", () => {
    const { sql } = buildWhereSql({ ...baseFilters, prefecture: "all" });
    expect(sql).not.toContain("address LIKE");
  });

  it("半径指定があれば緯度経度の範囲条件になる", () => {
    const { sql, params } = buildWhereSql({
      ...baseFilters,
      radiusKm: 10,
      baseLat: 35.18,
      baseLon: 136.9,
    });
    expect(sql).toContain("lat >=");
    expect(sql).toContain("lon <=");
    expect(params).toHaveLength(4);
  });

  it("半径が無ければ矩形（地図の表示範囲）を使う", () => {
    const { sql, params } = buildWhereSql({
      ...baseFilters,
      minLat: 34,
      maxLat: 36,
      minLon: 135,
      maxLon: 137,
    });
    expect(sql).toContain("lat >=");
    expect(params).toEqual([34, 36, 135, 137]);
  });

  it("掲載期限切れを常に除外する（リンク切れを掴ませない）", () => {
    const { sql } = buildWhereSql(baseFilters);
    expect(sql).toContain("expire_date IS NULL OR expire_date >= now()");
  });
});

describe("innerSql", () => {
  const where = buildWhereSql(baseFilters).sql;

  it("dedupe 時は DISTINCT ON で名寄せし、掲載社数を数える", () => {
    const sql = innerSql(where, true);
    expect(sql).toContain("DISTINCT ON");
    expect(sql).toContain("count(*) OVER (PARTITION BY");
    expect(sql).toContain("AS listing_count");
  });

  it("dedupe しない場合は掲載社数を 1 に固定する", () => {
    const sql = innerSql(where, false);
    expect(sql).not.toContain("DISTINCT ON");
    expect(sql).toContain("1 AS listing_count");
  });

  it("どちらでも㎡単価と市区町村を返す（評価軸の入力）", () => {
    for (const dedupe of [true, false]) {
      const sql = innerSql(where, dedupe);
      expect(sql).toContain("AS sqm_rent");
      expect(sql).toContain("AS municipality");
    }
  });
});

describe("candidateOrderSql", () => {
  it("戦略ごとに並び順が変わる（同じ候補集合にならない）", () => {
    const orders = CANDIDATE_STRATEGIES.map((s) => candidateOrderSql(s.id));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("未知の戦略は㎡単価順に落ちる", () => {
    expect(candidateOrderSql("no-such-strategy" as never)).toContain(
      "sqm_rent ASC",
    );
  });
});

describe("selectSql", () => {
  const where = buildWhereSql(baseFilters).sql;

  it("LIMIT を渡された番号のプレースホルダにする", () => {
    expect(selectSql(where, true, 7, "value")).toContain("LIMIT $7");
  });

  it("戦略が ORDER BY に反映される", () => {
    expect(selectSql(where, true, 1, "spacious")).toContain("size_sqm DESC");
    expect(selectSql(where, true, 1, "station")).toContain(
      "COALESCE(minutes_to_station, 999) ASC",
    );
  });
});

describe("statsSql / municipalityStatsSql", () => {
  const where = buildWhereSql(baseFilters).sql;

  it("相場統計は㎡単価だけでなく面積・築年・駅徒歩も返す", () => {
    const sql = statsSql(where, true);
    for (const column of [
      "AS mean",
      "AS stddev",
      "AS size_mean",
      "AS size_stddev",
      "AS age_mean",
      "AS station_mean",
    ]) {
      expect(sql).toContain(column);
    }
  });

  it("ばらつきが計算できない場合に NULL を返さない", () => {
    // stddev_pop は 1 行だと NULL を返す。偏差値の計算が NaN になるため
    // COALESCE で 0 に倒しておく必要がある。
    expect(statsSql(where, true)).toContain("coalesce(stddev_pop");
  });

  it("近隣相場は平均ではなく中央値で出す（高額物件の裾に引きずられない）", () => {
    const sql = municipalityStatsSql(where, true);
    expect(sql).toContain("percentile_cont(0.5)");
    expect(sql).toContain("GROUP BY municipality");
    expect(sql).toContain("municipality IS NOT NULL");
  });
});
