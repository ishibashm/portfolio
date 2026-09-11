import { describe, it, expect } from "vitest";
import {
  buildWhereSql,
  candidateOrderSql,
  geoBoundingBox,
  cleanPropertyName,
  innerSql,
  selectSql,
  uniqueCountSql,
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

  /*
    **半径と表示範囲の両方が来たら交差を使う**（2026-09-11）。

    画面は表示範囲を「半径への追加の絞り込み」として送っている
    （geographyParamsForSearch）が、API は半径があると表示範囲を捨てて
    いた。東京・半径 50km では地図をどこへ動かしても 334,118 行の同じ
    問い合わせになり（本番 25〜34 秒）、500 件の窓も半径全体の安い順
    なので写っている範囲の物件が出なかった。

    旧実装（`if (半径) … else if (表示範囲) …`）に戻すと、下の
    「表示範囲が半径の内側」で params が半径の矩形（34.73…/35.63…）に
    なって落ちる。
  */
  it("半径と表示範囲の両方があれば、交差の矩形で絞る", () => {
    const { params } = buildWhereSql({
      ...baseFilters,
      radiusKm: 50,
      baseLat: 35.1815,
      baseLon: 136.9064,
      // 表示範囲は半径の矩形（緯度 ±0.45、経度 ±0.55）のすぐ内側
      minLat: 35.0,
      maxLat: 35.3,
      minLon: 136.7,
      maxLon: 137.1,
    });
    expect(params).toEqual([35.0, 35.3, 136.7, 137.1]);
  });

  it("表示範囲が半径からはみ出す側は、半径の縁で切る", () => {
    const box = geoBoundingBox({
      radiusKm: 50,
      baseLat: 35.1815,
      baseLon: 136.9064,
      minLat: 30, // 半径の南端より南 → 半径の縁になる
      maxLat: 35.3, // 半径の内側 → そのまま
      minLon: 136.7,
      maxLon: 140, // 半径の東端より東 → 半径の縁になる
    });
    expect(box).not.toBeNull();
    expect(box!.minLat).toBeCloseTo(35.1815 - 50 / 111, 6);
    expect(box!.maxLat).toBe(35.3);
    expect(box!.minLon).toBe(136.7);
    expect(box!.maxLon).toBeCloseTo(
      136.9064 + 50 / (111 * Math.cos((35.1815 * Math.PI) / 180)),
      6,
    );
  });

  it("交差が空でも矩形を返す（0 行に当たる。写っている範囲に半径内の物件が無い）", () => {
    const box = geoBoundingBox({
      radiusKm: 10,
      baseLat: 35.1815,
      baseLon: 136.9064,
      minLat: 40,
      maxLat: 41,
      minLon: 140,
      maxLon: 141,
    });
    expect(box).not.toBeNull();
    expect(box!.minLat).toBeGreaterThan(box!.maxLat);
    expect(box!.minLon).toBeGreaterThan(box!.maxLon);
  });

  it("半径も表示範囲も無ければ矩形は無い", () => {
    expect(geoBoundingBox(baseFilters)).toBeNull();
    const { params } = buildWhereSql(baseFilters);
    expect(params).toEqual([]);
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

describe("uniqueCountSql（名寄せ後の件数）", () => {
  const { sql: where } = buildWhereSql(baseFilters);

  // 相場の統計（statsAndMunicipalitySql）は評価軸の廃止で消えた。
  // 残る用途は「条件に一致 N 件」の数え上げだけで、これは DISTINCT ON の
  // 実体化ではなく GROUP BY で数える。名寄せキーの索引の並びのまま
  // 集約できるため、ソートが要らない。
  it("GROUP BY で数える（DISTINCT ON の実体化に戻さない）", () => {
    const sql = uniqueCountSql(where);
    expect(sql).toContain("GROUP BY name_key, floor, layout, size_sqm, rent");
    expect(sql).not.toContain("DISTINCT ON");
    expect(sql).toContain("count(*)::int AS n");
  });

  it("名寄せの単位は候補の取り出しと同じキー", () => {
    // ここがずれると「条件に一致 N 件」と一覧の名寄せ結果が食い違う。
    const count = uniqueCountSql(where);
    const select = innerSql(where, true);
    expect(count).toContain("name_key, floor, layout, size_sqm, rent");
    expect(select).toContain("name_key, floor, layout, size_sqm, rent");
  });

  it("行ごとの正規表現に戻さない", () => {
    const sql = uniqueCountSql(where);
    expect(sql).not.toContain("regexp_replace(property_name");
    expect(sql).not.toContain("regexp_match(address");
  });
});

describe("名寄せキーの前払い（name_key / municipality_key 列）", () => {
  const { sql: where } = buildWhereSql(baseFilters);

  // 以前はリクエストのたびに regexp_replace / regexp_match を対象行
  // それぞれへ評価していて、全国走査 22 秒の律速だった（EXPLAIN の実測）。
  // 書き込み時にトリガーで埋めた列を読む形に変えた。ここが正規表現に
  // 戻ると、速度の退行が「なんとなく遅い」としてしか現れないので固定する。
  it("クエリは列を読む。行ごとの正規表現に戻さない", () => {
    for (const sql of [
      innerSql(where, true),
      selectSql(where, true, 1, "value"),
    ]) {
      expect(sql).toContain("name_key");
      expect(sql).toContain("municipality_key AS municipality");
      expect(sql).not.toContain("regexp_replace(property_name");
      expect(sql).not.toContain("regexp_match(address");
    }
  });

  it("名寄せの単位は変えていない（キーの列構成が同じ）", () => {
    const sql = innerSql(where, true);
    expect(sql).toContain(
      "DISTINCT ON (name_key, floor, layout, size_sqm, rent)",
    );
    // 残す 1 件の選び方（欠損の少ないもの → 新しいもの）もそのまま
    expect(sql).toContain("last_seen_at DESC NULLS LAST");
  });
});
