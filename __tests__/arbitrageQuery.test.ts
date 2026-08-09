import { describe, it, expect } from "vitest";
import {
  buildWhereSql,
  candidateOrderSql,
  cleanPropertyName,
  innerSql,
  municipalityStatsSql,
  selectSql,
  statsAndMunicipalitySql,
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
    expect(
      cleanPropertyName("サンプルマンション 地下1階 築5年3ヶ月の賃貸物件"),
    ).toBe("サンプルマンション");
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

describe("statsAndMunicipalitySql", () => {
  const { sql: whereSql } = buildWhereSql(baseFilters);

  it("innerSql を 1 回しか評価しない", () => {
    // 分けて投げていたときは同じ DISTINCT ON のソートが 2 回走っていた。
    // ソートキーに名寄せ用の regexp_replace が入っているので、行ごとの
    // 正規表現評価まで丸ごと 2 回になっていた。ここが戻ると遅さも戻る。
    const sql = statsAndMunicipalitySql(whereSql, true);
    const occurrences = sql.split("FROM rental_properties").length - 1;
    expect(occurrences).toBe(1);
  });

  it("CTE を MATERIALIZED で固定する", () => {
    // 付けないと Postgres が CTE をインライン展開し、参照している 2 箇所で
    // それぞれ評価しうる。1 回で確定させたい。
    expect(statsAndMunicipalitySql(whereSql, true)).toContain(
      "AS MATERIALIZED",
    );
  });

  it("分けて投げていたときと同じ射影を返す", () => {
    const combined = statsAndMunicipalitySql(whereSql, true);
    for (const col of [
      "AS mean",
      "AS stddev",
      "AS size_mean",
      "AS size_stddev",
      "AS age_mean",
      "AS age_stddev",
      "AS station_mean",
      "AS station_stddev",
    ]) {
      expect(statsSql(whereSql, true)).toContain(col);
      expect(combined).toContain(col);
    }
    expect(municipalityStatsSql(whereSql, true)).toContain("AS median");
    expect(combined).toContain("AS median");
  });

  it("市区町村が無い行を集計に混ぜない", () => {
    expect(statsAndMunicipalitySql(whereSql, true)).toContain(
      "WHERE municipality IS NOT NULL",
    );
  });

  it("dedupe を切っても組み立てられる", () => {
    const sql = statsAndMunicipalitySql(whereSql, false);
    expect(sql.split("FROM rental_properties").length - 1).toBe(1);
    expect(sql).not.toContain("DISTINCT ON");
  });
});

describe("statsAndMunicipalitySql の CTE の幅", () => {
  const { sql: whereSql } = buildWhereSql(baseFilters);

  it("統計に要らない列を CTE に載せない", () => {
    // 実体化した 39 万行を 2 箇所から読むので、幅がそのまま一時ファイルの量に
    // なる。innerSql をそのまま載せると width=407 まで膨らみ、統合の利得が
    // 往復で相殺される（実測 temp 38,214 blocks）。
    const sql = statsAndMunicipalitySql(whereSql, true);
    const cte = sql.slice(0, sql.indexOf(") \n") + 1);
    expect(cte).not.toContain("listing_count");
    expect(cte).not.toContain("SELECT DISTINCT ON (regexp_replace");
  });

  it("統計が読む 5 列は CTE に載っている", () => {
    const sql = statsAndMunicipalitySql(whereSql, true);
    for (const col of [
      "AS sqm_rent",
      "size_sqm",
      "building_age",
      "minutes_to_station",
      "AS municipality",
    ]) {
      expect(sql).toContain(col);
    }
  });

  it("名寄せのキーと採用順は innerSql と変わらない", () => {
    // 選択リストを絞っても DISTINCT ON / ORDER BY が同じなら、残る 1 件は同じ。
    const narrow = statsAndMunicipalitySql(whereSql, true);
    const wide = innerSql(whereSql, true);
    for (const fragment of ["DISTINCT ON", "floor, layout, size_sqm, rent"]) {
      expect(narrow).toContain(fragment);
      expect(wide).toContain(fragment);
    }
    expect(narrow).toContain("last_seen_at DESC NULLS LAST");
  });
});
