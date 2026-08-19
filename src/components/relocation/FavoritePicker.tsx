"use client";

/**
 * ★ を付けた物件から目的地を選ぶ。
 *
 * 試算ページは目的地を住所で打つ作りだった。物件を方位で探す画面で
 * 気になる部屋を見つけても、その住所を手で写して試算ページに入れ直す
 * 必要があり、面倒なうえ打ち間違えると方位が変わる。
 *
 * お気に入り自体は前からあったが、**id を貯めるだけで後から使えなかった**。
 * ここで名前と住所を引いて選べるようにする。
 *
 * 未ログインでも動く。lib/favorites がクラウドと端末のどちらからでも
 * id を返し、/api/rentals/by-ids が id を引数で受けるため。
 */

import React from "react";
import { loadFavorites } from "@/lib/favorites";
import { toUserMessage } from "@/lib/errorMessage";

export interface FavoriteProperty {
  id: string;
  property_name: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  rent: number | null;
  management_fee: number | null;
  layout: string | null;
}

export interface FavoritePickerProps {
  /** 選ばれたときに呼ぶ。座標の無い物件は選べないので必ず数で渡る。 */
  onPick: (picked: {
    name: string;
    lat: number;
    lon: number;
    address: string | null;
  }) => void;
  /** 一覧を閉じる。 */
  onClose: () => void;
}

export function FavoritePicker({ onPick, onClose }: FavoritePickerProps) {
  const [items, setItems] = React.useState<FavoriteProperty[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [synced, setSynced] = React.useState(true);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { ids, synced: cloudSynced } = await loadFavorites();
        if (!alive) return;
        setSynced(cloudSynced);

        if (ids.length === 0) {
          setItems([]);
          return;
        }

        const res = await fetch(
          `/api/rentals/by-ids?ids=${encodeURIComponent(ids.join(","))}`,
        );
        if (!alive) return;
        if (!res.ok) {
          setError("お気に入りの物件を読み込めませんでした。");
          setItems([]);
          return;
        }
        const body = (await res.json()) as {
          success?: boolean;
          data?: FavoriteProperty[];
        };
        if (!alive) return;
        setItems(Array.isArray(body.data) ? body.data : []);
      } catch (e) {
        if (!alive) return;
        setError(toUserMessage(e, "お気に入りを読み込めませんでした。"));
        setItems([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const totalRent = (p: FavoriteProperty) =>
    p.rent === null ? null : p.rent + (p.management_fee ?? 0);

  return (
    <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
          ★ お気に入りから選ぶ
        </h4>
        <button
          onClick={onClose}
          className="text-[10px] text-stone-600 hover:text-stone-800"
        >
          閉じる
        </button>
      </div>

      {!synced && (
        <p className="text-[10px] text-stone-500">
          この端末に保存したぶんです。ログインすると別の端末でも使えます。
        </p>
      )}

      {items === null && (
        <p className="text-xs text-stone-600 animate-pulse">読み込み中...</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {items !== null && items.length === 0 && !error && (
        <p className="text-xs text-stone-500 leading-relaxed">
          お気に入りがまだありません。
          <a
            href="/relocation/arbitrage"
            className="text-indigo-500 hover:underline ml-1"
          >
            物件を方位で探す
          </a>
          で ★ を押すと、ここから呼び出せます。
        </p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {items.map((p) => {
            // 座標が無いと方位が出せない。選ばせずに理由を書く。
            const usable = p.lat !== null && p.lon !== null;
            const rent = totalRent(p);
            return (
              <li key={p.id}>
                <button
                  disabled={!usable}
                  onClick={() =>
                    usable &&
                    onPick({
                      name: p.property_name,
                      lat: p.lat as number,
                      lon: p.lon as number,
                      address: p.address,
                    })
                  }
                  className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                    usable
                      ? "bg-white border-stone-200 hover:border-indigo-300 hover:bg-indigo-50/60 cursor-pointer"
                      : "bg-stone-50 border-stone-200 text-stone-600 cursor-not-allowed"
                  }`}
                >
                  <span className="block font-bold text-stone-700 truncate">
                    {p.property_name}
                  </span>
                  <span className="block text-[10px] text-stone-500 truncate">
                    {p.address ?? "住所なし"}
                  </span>
                  <span className="block text-[10px] text-stone-600 mt-0.5">
                    {p.layout ?? "間取り不明"}
                    {rent !== null && ` / ${rent.toLocaleString()} 円`}
                    {!usable && " / 座標が無いため選べません"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default FavoritePicker;
