"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeoJSON, useMap, useMapEvents } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import { toLogMessage } from "@/lib/errorMessage";
import {
  formatPercent,
  zoningFillFiltered,
  ZONING_MAX_ZOOM,
  ZONING_MIN_ZOOM,
  type ZoningName,
  type ZoningProperties,
} from "@/utils/zoning";
import { latToTileY, lonToTileX } from "@/lib/tileCoords";

/**
 * 用途地域を地図に重ねる層。
 *
 * 中継（`/api/zoning`）から 1 タイルずつ取って描く。**判定には入らない。**
 * 方位の吉凶とは無関係な、参考として重ねるだけの層。
 *
 * ## 広域では出さない
 *
 * 上流の 1 タイルが z=13 で 435KB、z=12 で 1.9MB、z=11 で 3.6MB（実測）。
 * 画面には十数タイル並ぶので、広域で出すと 1 画面が数十 MB になる。
 * `ZONING_MIN_ZOOM` 未満では取りに行かず、「拡大してください」とだけ出す。
 *
 * ## 取ったタイルは捨てない
 *
 * 一度取ったタイルは覚えておく。地図は行ったり来たりするもので、戻る
 * たびに取り直すと同じものを何度も取ることになる。中継側も 30 日
 * 覚えているが、往復そのものを減らしたい。
 *
 * ## 一度に取る数を絞る
 *
 * 12 枚まで。z=14 の広い画面では画面ぶん全部が入り切らないので、
 * **足りないことを黙らない**（`onNotice` で頁に伝える）。
 */

/** 一度の描き直しで取りに行くタイルの上限。 */
const MAX_TILES = 12;
/**
 * 地図が動き終わってから待つ時間。
 *
 * 掴んで動かしている間、moveend は何度も来る。そのたびに取りに行くと
 * 通り道のタイルまで全部取ってしまう。少し待って、止まった先だけを取る。
 */
const SETTLE_MS = 250;
/** 同時に投げる数。上流にも中継にも一気に投げない。 */
const CONCURRENCY = 4;

interface ZoningFeatureCollection extends GeoJsonObject {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: unknown;
    properties: ZoningProperties;
  }[];
}

/* 緯度経度 → タイルの変換は lib/tileCoords に寄せてある。ここに写し
   直さないこと（航空写真の切り出しが同じ計算を使う）。 */
function tileKey(z: number, x: number, y: number) {
  return `${z}/${x}/${y}`;
}

export interface ZoningLayerProps {
  /** 出すかどうか。切ってあるときは取りにも行かない。 */
  enabled: boolean;
  /** 1 区分だけを見るときの選択。null なら全部そのままの色。 */
  selected: ZoningName | null;
  /**
   * 画面に伝えたいこと。縮尺が足りない・全部は出せていない・取れなかった。
   * **黙って足りない絵を出さない**ための口。
   */
  onNotice?: (notice: string | null) => void;
}

export function ZoningLayer({ enabled, selected, onNotice }: ZoningLayerProps) {
  const map = useMap();
  const [tiles, setTiles] = useState<Record<string, ZoningFeatureCollection>>(
    {},
  );
  /*
    取得済み・取得中の鍵。state に入れると取得のたびに描き直しが走るので、
    ref で持つ。描くのに要るのは中身（tiles）だけ。
  */
  const seen = useRef<Set<string>>(new Set());
  /** 描き直しの世代。古い応答を捨てるのに使う。 */
  const generation = useRef(0);

  const notify = useCallback(
    (text: string | null) => {
      onNotice?.(text);
    },
    [onNotice],
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      notify(null);
      return;
    }
    const zoom = Math.round(map.getZoom());
    if (zoom < ZONING_MIN_ZOOM) {
      notify("用途地域は拡大すると出ます。");
      return;
    }
    const z = Math.min(zoom, ZONING_MAX_ZOOM);
    const b = map.getBounds();
    const x0 = lonToTileX(b.getWest(), z);
    const x1 = lonToTileX(b.getEast(), z);
    const y0 = latToTileY(b.getNorth(), z);
    const y1 = latToTileY(b.getSouth(), z);

    const wanted: [number, number][] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) wanted.push([x, y]);
    }

    const trimmed = wanted.slice(0, MAX_TILES);
    const dropped = wanted.length - trimmed.length;
    const todo = trimmed.filter(
      ([x, y]) => !seen.current.has(tileKey(z, x, y)),
    );

    notify(
      dropped > 0
        ? `この縮尺では ${dropped} 区画ぶんを出せていません。拡大すると全部出ます。`
        : null,
    );
    if (todo.length === 0) return;

    const mine = ++generation.current;
    for (const [x, y] of todo) seen.current.add(tileKey(z, x, y));

    /* 一気に投げない。4 枚ずつ。 */
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      if (mine !== generation.current) return;
      const batch = todo.slice(i, i + CONCURRENCY);
      const got = await Promise.all(
        batch.map(async ([x, y]) => {
          const key = tileKey(z, x, y);
          try {
            const res = await fetch(`/api/zoning?z=${z}&x=${x}&y=${y}`);
            if (!res.ok) {
              /*
                取れなかったタイルは「見た」から外す。次に来たときに
                もう一度試せるようにするため。
              */
              seen.current.delete(key);
              return null;
            }
            return [
              key,
              (await res.json()) as ZoningFeatureCollection,
            ] as const;
          } catch (e) {
            seen.current.delete(key);
            console.error("用途地域のタイルを取得できず:", toLogMessage(e));
            return null;
          }
        }),
      );
      if (mine !== generation.current) return;
      const add: Record<string, ZoningFeatureCollection> = {};
      for (const g of got) if (g) add[g[0]] = g[1];
      if (Object.keys(add).length > 0)
        setTiles((prev) => ({ ...prev, ...add }));
    }
  }, [enabled, map, notify]);

  /*
    取得は必ずここを通す。地図の移動でも初回でも、少し待ってから 1 回だけ
    走らせる。effect の中で直に呼ぶと、その場で setState する形になって
    react-hooks/set-state-in-effect に掛かる（実際に掛けた）。
  */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), SETTLE_MS);
  }, [refresh]);

  useMapEvents({
    moveend: schedule,
    zoomend: schedule,
  });

  useEffect(() => {
    schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [schedule]);

  if (!enabled) return null;

  return (
    <>
      {Object.entries(tiles).map(([key, data]) => (
        <GeoJSON
          /*
            選択が変わったら描き直す。Leaflet の GeoJSON は data が同じ
            参照だと style を引き直さないので、鍵に選択を混ぜる。
          */
          key={`${key}-${selected ?? "all"}`}
          data={data}
          style={(feature) => {
            const props = feature?.properties as ZoningProperties | undefined;
            return {
              fillColor: zoningFillFiltered(props?.name ?? null, selected),
              fillOpacity: 0.45,
              /* 細い白縁。区画の境目が地図の道路と混ざらないように */
              color: "#ffffff",
              weight: 0.6,
              opacity: 0.8,
            };
          }}
          onEachFeature={(feature, layer) => {
            const p = feature.properties as ZoningProperties | undefined;
            const name = p?.rawName ?? p?.name ?? "不明な区分";
            const coverage = formatPercent(p?.coverage ?? null);
            const floorArea = formatPercent(p?.floorArea ?? null);
            /*
              値が無いときは「—」。0 と書くと「建てられない」に読める。
            */
            layer.bindPopup(
              [
                `<b>${name}</b>`,
                p?.city ? `<div>${p.city}</div>` : "",
                `<div>建蔽率 ${coverage ?? "—"} ／ 容積率 ${floorArea ?? "—"}</div>`,
              ].join(""),
            );
          }}
        />
      ))}
    </>
  );
}
