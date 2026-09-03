"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeoJSON, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import { toLogMessage } from "@/lib/errorMessage";
import {
  formatPercent,
  isZoningRasterZoom,
  zoningFillFiltered,
  ZONING_MAX_ZOOM,
  ZONING_MIN_ZOOM,
  ZONING_OVERLAY_OPACITY,
  ZONING_RASTER_MAX_ZOOM,
  ZONING_RASTER_MIN_ZOOM,
  type ZoningName,
  type ZoningProperties,
} from "@/utils/zoning";
import {
  latToTileY,
  lonToTileX,
  tilePointOf,
  tilesByDistanceFromCenter,
} from "@/lib/tileCoords";

/**
 * 用途地域を地図に重ねる層。
 *
 * 中継（`/api/zoning`）から 1 タイルずつ取って描く。**判定には入らない。**
 * 方位の吉凶とは無関係な、参考として重ねるだけの層。
 *
 * ## 縮尺で描き方を切り替える
 *
 *   z13 以上 … 多角形（GeoJSON）。区画を押すと建蔽率・容積率が出て、
 *              凡例の絞り込みは色の引き直しで済む
 *   z11〜12  … **塗り絵（PNG タイル）**。`/api/zoning/raster` がサーバで
 *              塗った絵を画像タイルとして重ねる。多角形だと 1 画面 6.5MB
 *              になる縮尺（`utils/zoning` の実測表）で、ブラウザが数千の
 *              SVG パスを描かずに済む。区画を押しても詳細は出ない
 *              （地図のクリックは地点の吉凶を出すのに使っている）
 *   z10 以下 … 出さない。上流の下限 z11 を束ねないと作れず、冷えた
 *              1 画面で上流を 100 回近く叩くことになる
 *
 * 多角形の下限（`ZONING_MIN_ZOOM`）は、中継が項目を絞り頂点を間引いた
 * 後の、ブラウザが受け取る大きさの実測で決めた。
 *
 * ## 多角形は上流の最上段（z15）を使い回す
 *
 * 取りに行くのは `Math.min(zoom, ZONING_MAX_ZOOM)`。z16〜18 では z15 の
 * タイルをそのまま使う。以前は上限が 18 で、上流に無いズームを投げて
 * いたうえ、1 段拡大するたびに同じ場所を取り直していた。
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

/** 塗り絵のタイル URL。絞り込みは問い合わせで渡す（サーバ側で灰色にする）。 */
function rasterUrl(selected: ZoningName | null): string {
  const base = "/api/zoning/raster/{z}/{x}/{y}";
  return selected ? `${base}?pick=${encodeURIComponent(selected)}` : base;
}

/** 縮尺に応じた断り。null は「言うことが無い」。 */
function noticeForZoom(zoom: number): string | null {
  if (zoom >= ZONING_MIN_ZOOM) return null;
  if (isZoningRasterZoom(zoom)) {
    return "俯瞰では色だけ出しています。区画を押して建蔽率・容積率を見るには、もう少し拡大してください。";
  }
  return "用途地域は拡大すると出ます。";
}

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
    いまの縮尺。塗り絵の層を出すかどうかをこれで決める。moveend/zoomend
    の後の refresh で更新する（描き直しはそこで 1 回にまとまる）。
  */
  const [zoom, setZoom] = useState(() => Math.round(map.getZoom()));
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
    setZoom(zoom);
    if (zoom < ZONING_MIN_ZOOM) {
      notify(noticeForZoom(zoom));
      return;
    }
    const z = Math.min(zoom, ZONING_MAX_ZOOM);
    const b = map.getBounds();
    const x0 = lonToTileX(b.getWest(), z);
    const x1 = lonToTileX(b.getEast(), z);
    const y0 = latToTileY(b.getNorth(), z);
    const y1 = latToTileY(b.getSouth(), z);

    /* **中心に近い順**に並べてから切る。列ごとに詰めた順のまま切ると
       いちばん西の列だけが残り、見ている市街地が塗られないまま
       になっていた（2026-09-01 に利用者が発見）。 */
    const center = map.getCenter();
    const c = tilePointOf(center.lat, center.lng, z);
    const wanted = tilesByDistanceFromCenter(
      x0,
      x1,
      y0,
      y1,
      c.x + c.fx,
      c.y + c.fy,
    );

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

  if (isZoningRasterZoom(zoom)) {
    /*
      key に URL を混ぜて、絞り込みが変わったら別の層として置き直す
      （HazardTileOverlay と同じ）。zIndex は多角形の層と同じく
      ハザードのタイル（既定 1）より上。
    */
    const url = rasterUrl(selected);
    return (
      <TileLayer
        key={url}
        url={url}
        opacity={ZONING_OVERLAY_OPACITY}
        minNativeZoom={ZONING_RASTER_MIN_ZOOM}
        maxNativeZoom={ZONING_RASTER_MAX_ZOOM}
        zIndex={2}
        eventHandlers={{
          /* 取れなかった枚は透明のまま。黙って足りない絵を出さない */
          tileerror: () => notify("用途地域の一部を取得できませんでした。"),
        }}
      />
    );
  }
  if (zoom < ZONING_MIN_ZOOM) return null;

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
              fillOpacity: ZONING_OVERLAY_OPACITY,
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
