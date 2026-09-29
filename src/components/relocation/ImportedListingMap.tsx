"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { EmailListing } from "@/lib/listingDetails";
import {
  groupListingMap,
  listingAddressKey,
  LISTING_MAP_ADDRESS_CAP,
  type ListingMapPoint,
  type ListingMapResult,
} from "@/lib/listingCandidateMap";
import { hasUsableBase } from "@/lib/japanBounds";
import type { DayKigaku, DayKigakuInput } from "@/lib/dayKigakuClient";
import {
  loadSettings,
  settingNumber,
  settingString,
  settingBoolean,
} from "@/lib/userSettings";
import { parseDirectionFilterMode } from "@/utils/directionFilterMode";
import {
  DEFAULT_TENCHUSATSU_MODE,
  isTenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import { EmailUrlChoices } from "./EmailUrlChoices";

const MapInner = dynamic(() => import("./ImportedListingMapInner"), {
  ssr: false,
  loading: () => <p>地図を読み込み中…</p>,
});
const responseSchema = z.object({
  results: z
    .array(
      z.object({
        address: z.string(),
        point: z.object({ lat: z.number(), lon: z.number() }).optional(),
      }),
    )
    .max(LISTING_MAP_ADDRESS_CAP),
});

export function ImportedListingMap({
  listings,
  onSelect,
}: {
  listings: EmailListing[];
  onSelect: (listing: EmailListing) => void;
}) {
  const addresses = [
    ...new Set(
      listings.map((l) => listingAddressKey(l.address ?? "")).filter(Boolean),
    ),
  ];
  const key = JSON.stringify(addresses.slice(0, LISTING_MAP_ADDRESS_CAP));
  const allKey = JSON.stringify(addresses);
  /*
    市区町村の代表点（2026-09-29。利用者の指摘「メール取り込みで物件の
    位置がピンで立つように」）。国土地理院の検索は押してから・旗が ON の
    ときだけなので、旗が OFF の本番では 1 本もピンが立たなかった。
    手元の表（municipalityCoords）で引くだけで**外へは送らない**ので、
    押す前から出してよい。番地までは押したときに国土地理院で詰める。
    表は 270 KB あるので、取り込んだ物件があるときだけ読む。
  */
  const [local, setLocal] = useState<{
    key: string;
    points: Record<string, ListingMapPoint>;
  }>();
  const [reply, setReply] = useState<{
    key: string;
    results: ListingMapResult[];
    message?: string;
    disabled?: boolean;
  }>();
  const [context, setContext] = useState<DayKigakuInput>();
  const [board, setBoard] = useState<DayKigaku>();
  /*
    住所を国土地理院へ送るのは、押してから（2026-09-27）。#1550 の初版は
    取り込んだ直後に黙って最大 10 件を送っていた。CLAUDE.md 3 節「入力が
    どこへ行くかは、入れる前に分からないと意味が無い」。送り先と送るものを
    ボタンの横に書き、押すまでは 1 件も送らない。
  */
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    let active = true;
    void loadSettings()
      .then(async ({ settings: s }) => {
        if (!active) return;
        const mode = settingString(s, "tenchusatsu_mode");
        let targetDate = settingString(s, "target_date") ?? "";
        try {
          targetDate ||= localStorage.getItem("arb_targetDate") ?? "";
        } catch {
          /* 保存不可の端末では未設定のまま */
        }
        const value: DayKigakuInput = {
          birthDate: settingString(s, "birth_date") ?? "",
          targetDate,
          baseLat: String(settingNumber(s, "base_lat") ?? ""),
          baseLon: String(settingNumber(s, "base_lon") ?? ""),
          useClassical: settingBoolean(s, "use_classical_board") ?? true,
          directionFilterMode: parseDirectionFilterMode(
            settingString(s, "direction_filter_mode"),
          ),
          tenchusatsuMode:
            mode && isTenchusatsuMode(mode) ? mode : DEFAULT_TENCHUSATSU_MODE,
          involuntaryMove: settingBoolean(s, "involuntary_move") ?? false,
        };
        setContext(value);
        if (
          value.birthDate &&
          value.targetDate &&
          hasUsableBase(Number(value.baseLat), Number(value.baseLon))
        ) {
          const { computeDayKigaku } = await import("@/lib/dayKigakuClient");
          if (active) setBoard(computeDayKigaku(value));
        }
      })
      .catch(() => {
        /* 地図は盤がなくても表示する */
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (allKey === "[]") return;
    let active = true;
    void Promise.all([
      import("@/lib/municipalityCoords"),
      import("@/lib/municipalityFromAddress"),
    ])
      .then(([coords, lookup]) => {
        if (!active) return;
        const points: Record<string, ListingMapPoint> = {};
        for (const address of JSON.parse(allKey) as string[]) {
          const hit = lookup.municipalityFromAddress(
            address,
            coords.MUNICIPALITY_POINTS,
          );
          if (hit)
            points[address] = {
              lat: hit.lat,
              lon: hit.lon,
              municipality: `${hit.pref}${hit.city}`,
            };
        }
        setLocal({ key: allKey, points });
      })
      .catch(() => {
        /* 表が読めなくても一覧と番地の検索は使える */
      });
    return () => {
      active = false;
    };
  }, [allKey]);
  useEffect(() => {
    if (!requested || key === "[]") return;
    const controller = new AbortController();
    // 本文・物件URLは送らず、上限内の重複しない住所だけを本人の操作に続けて検索。
    void fetch("/api/relocation/candidates/geocode/batch", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: JSON.parse(key) }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setReply({
            key,
            results: [],
            disabled: body.code === "GEOCODE_DISABLED",
            message:
              body.code === "GEOCODE_DISABLED"
                ? "地図表示は準備中です。下の一覧から物件を選んでください。"
                : "位置を検索できませんでした。既存入力から住所・地図で確認してください。",
          });
        } else setReply({ key, results: responseSchema.parse(body).results });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setReply({
            key,
            results: [],
            message:
              "位置を検索できませんでした。既存入力から住所・地図で確認してください。",
          });
      });
    return () => controller.abort();
  }, [key, requested]);
  if (!listings.length) return null;
  const current = reply?.key === key ? reply : undefined;
  const localPoints = local?.key === allKey ? local.points : {};
  const hasLocal = Object.keys(localPoints).length > 0;
  // 番地まで引けたものを優先し、引けなかったもの・上限を超えたものは
  // 市区町村の代表点に落とす
  const precise = new Map(
    (current?.results ?? []).map((r) => [
      listingAddressKey(r.address),
      r.point,
    ]),
  );
  const groups = groupListingMap(
    listings,
    addresses.map((address) => ({
      address,
      point: precise.get(address) ?? localPoints[address],
    })),
  );
  const approximateCount = groups.mapped.filter(
    ({ point }) => point.municipality,
  ).length;
  const origin =
    context && hasUsableBase(Number(context.baseLat), Number(context.baseLon))
      ? { lat: Number(context.baseLat), lon: Number(context.baseLon) }
      : undefined;
  return (
    <section aria-label="取り込み物件の地図と位置確認" className="space-y-3">
      <h4 className="font-bold">取り込み物件の地図</h4>
      <p>
        メールの住所から推測した概算位置です。保存は既存入力で位置を確認してから行います。
      </p>
      {key !== "[]" && !requested && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setRequested(true)}
            className="min-h-[32px] rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-stone-700"
          >
            {hasLocal ? "番地まで調べる" : "地図に表示する"}
          </button>
          <p className="text-stone-600">
            押すと、所在地（最大{LISTING_MAP_ADDRESS_CAP}
            件）を国土地理院の住所検索に送って位置を調べます。物件のURL・メール本文・生年月日は送りません。
          </p>
        </div>
      )}
      {requested && key !== "[]" && !current && (
        <p role="status">住所の位置を検索中…</p>
      )}
      {current?.message && (
        <p role="status">
          {current.disabled && hasLocal
            ? "番地までの位置検索は準備中です。地図のピンは市区町村の代表点です。"
            : current.message}
        </p>
      )}
      {approximateCount > 0 && (
        <p>
          {approximateCount}
          件のピンは市区町村の代表点です（手元の表で引いたもので、外部には送っていません）。番地までの位置ではないため、方位は目安です。
        </p>
      )}
      {addresses.length > LISTING_MAP_ADDRESS_CAP && (
        <p>
          地図表示は先頭の{LISTING_MAP_ADDRESS_CAP}
          住所までです。残りは「位置未確定」から個別に確認してください。
        </p>
      )}
      <p>
        判定対象日: {context?.targetDate || "未設定"}。
        <Link
          href="/relocation/arbitrage"
          prefetch={false}
          className="underline"
        >
          出発地・生年月日・対象日の確認と変更
        </Link>
      </p>
      {groups.mapped.length > 0 && (
        <MapInner
          mapped={groups.mapped}
          origin={origin}
          board={board}
          useClassical={context?.useClassical ?? true}
          onSelect={onSelect}
        />
      )}
      {(
        [
          ["地図上の候補", groups.mapped.map(({ listing }) => listing)],
          ["住所なし", groups.noAddress],
          ["位置未確定", groups.unresolved],
        ] as const
      ).map(
        ([title, items]) =>
          items.length > 0 && (
            <div key={title}>
              <h5 className="font-bold">
                {title}（{items.length}件）
              </h5>
              <EmailUrlChoices
                urls={items.map((l) => l.url)}
                listings={items}
                onSelect={(url) => {
                  const listing = items.find((l) => l.url === url);
                  if (listing) onSelect(listing);
                }}
              />
            </div>
          ),
      )}
    </section>
  );
}
