"use client";

/**
 * /houi/3d の入力と表示の切り替え。**three.js をここで引かない。**
 *
 * 住所は既存の /api/geocode（国土地理院が先）、吉凶は公開MCPの
 * judge_directions に送る。判定はサーバー側の calculateMcpDirections と
 * 同じ関数で、この部品は表を持たない（site-spec 3 節）。
 *
 * 立体（CityScene）とタイルの復号（loadTiles）は地点が決まってから
 * import() で読む。他の頁の初回読み込みは増えない（city3dBundleLeaf が見張る）。
 *
 * 生年月日は設定から**読むだけ**で書き戻さない（CLAUDE.md 3 節「設定には
 * 利用者の値だけを書く」）。URL にも載せない。
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readSettingsSync, settingString } from "@/lib/userSettings";
import { toJapanDateString } from "@/utils/japanDate";
import { supportsWebGL } from "@/lib/webglSupport";
import { buildCompassModel, declinationText } from "@/lib/compassModel";
import { geomagneticAt } from "@/utils/geomagneticModel";
import { buildWedges } from "@/lib/city3d/model";
import {
  parseGeocodeResponse,
  parseJudgeDirectionsResponse,
  type Geocode,
  type Judgement,
  type PlateauEntry,
} from "@/lib/city3d/parsers";
import type { CityData } from "@/lib/city3d/features";
import CityPlan from "./CityPlan";
const CityScene = dynamic(() => import("./CityScene"), {
  ssr: false,
  loading: () => <p role="status">立体表示を準備しています。</p>,
});
export default function CityPanel() {
  const [address, setAddress] = useState(""),
    [birth, setBirth] = useState(""),
    [date, setDate] = useState("");
  const [origin, setOrigin] = useState<Geocode | null>(null),
    [data, setData] = useState<CityData | null>(null),
    [judge, setJudge] = useState<Judgement | null>(null);
  const [mobile, setMobile] = useState(false),
    [flat, setFlat] = useState(false),
    [webgl, setWebgl] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tileError, setTileError] = useState(""),
    [judgeError, setJudgeError] = useState(""),
    [plateau, setPlateau] = useState("");
  const [plateauEntry, setPlateauEntry] = useState<PlateauEntry | null>(null),
    [usePlateau, setUsePlateau] = useState(false);
  const geocodeAbort = useRef<AbortController | null>(null);
  const radius = mobile ? 250 : 400;
  useEffect(() => {
    setBirth(
      settingString(readSettingsSync(), "birth_date")?.match(
        /^\d{4}-\d{2}-\d{2}/,
      )?.[0] ?? "",
    );
    setDate(toJapanDateString(new Date()));
    setAddress(new URLSearchParams(window.location.search).get("q") ?? "");
    setMobile(
      window.matchMedia("(pointer: coarse)").matches ||
        window.innerWidth < 768 ||
        navigator.hardwareConcurrency <= 4,
    );
    setWebgl(supportsWebGL());
    return () => geocodeAbort.current?.abort();
  }, []);
  async function search() {
    geocodeAbort.current?.abort();
    const abort = new AbortController();
    geocodeAbort.current = abort;
    setBusy(true);
    setError("");
    setOrigin(null);
    setData(null);
    setJudge(null);
    setPlateau("");
    setPlateauEntry(null);
    setUsePlateau(false);
    try {
      const r = await fetch(
        `/api/geocode?q=${encodeURIComponent(address.trim())}`,
        { signal: abort.signal },
      );
      const json = await r.json();
      if (!r.ok)
        throw new Error(
          "住所を取得できませんでした。時間をおいてお試しください。",
        );
      const place = parseGeocodeResponse(json);
      if (!abort.signal.aborted) setOrigin(place);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "住所を取得できませんでした。",
        );
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (!origin) return;
    const abort = new AbortController();
    setData(null);
    setTileError("");
    void import("@/lib/city3d/loadTiles")
      .then((m) =>
        m.loadTiles(origin, radius, mobile ? 2000 : 6000, abort.signal),
      )
      .then((d) => {
        if (!abort.signal.aborted) {
          setData(d);
          if (d.failedTiles)
            setTileError(
              "一部の地図タイルを取得できませんでした。建物の表示が欠けることがあります。",
            );
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setTileError(
            "地図を読み込めませんでした。住所を再検索してください。",
          );
      });
    return () => abort.abort();
  }, [origin, radius, mobile]);
  /*
    PLATEAU の対象かどうかだけを先に見る（逆ジオコーダと同梱の索引）。
    建物のタイルは重いので、読むのはボタンを押したときだけ。
  */
  useEffect(() => {
    if (!origin || mobile || !webgl) return;
    const abort = new AbortController();
    void import("@/lib/city3d/plateau")
      .then((m) => m.findPlateau(origin, abort.signal))
      .then((entry) => {
        if (!abort.signal.aborted) setPlateauEntry(entry);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [origin, mobile, webgl]);
  useEffect(() => {
    setJudge(null);
    setJudgeError("");
    if (!origin || !birth || !date) return;
    const abort = new AbortController();
    // 入力を直した直後の連続要求を避け、古い地点の判定を残さない。
    const timer = setTimeout(() => {
      void fetch("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        signal: abort.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "judge_directions",
            arguments: { birthDate: birth, lon: origin.lon, date },
          },
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error("判定を取得できませんでした。");
          return parseJudgeDirectionsResponse(await r.json());
        })
        .then((j) => {
          if (!abort.signal.aborted) setJudge(j);
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setJudgeError(
              "方位の判定を取得できませんでした。日付を確認し、もう一度お試しください。",
            );
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [origin, birth, date]);
  const wedges = useMemo(() => buildWedges(judge), [judge]);
  const compass = useMemo(
    () =>
      origin
        ? buildCompassModel(
            origin,
            geomagneticAt(origin.lat, origin.lon)?.declination ?? null,
            null,
            "traditional",
          )
        : null,
    [origin],
  );
  const unavailable = useCallback(() => {
    setWebgl(false);
    setFlat(true);
    setPlateau("");
    setUsePlateau(false);
  }, []);
  const viewFlat = flat || !webgl;
  return (
    <div className="mt-6 space-y-5">
      <p className="rounded-xl border border-stone-300 bg-white/70 p-4 text-sm leading-relaxed">
        入力した住所は位置を求めるため国土地理院の住所検索（見つからないときはOpenStreetMap
        Nominatim）へ送られます。表示のため、地点周辺の地図タイル・建物データを国土地理院とPLATEAUの配信サーバーから直接読み込みます。生年月日は判定のためこのサイトの計算（/api/mcp）にだけ送り、保存しません。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="grid gap-4 rounded-xl border border-stone-300 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="sm:col-span-2">
          住所・地名
          <input
            className="mt-2 w-full rounded border border-stone-400 p-2"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="名古屋駅（愛知県名古屋市中村区名駅1丁目）"
            required
            maxLength={300}
          />
        </label>
        <label>
          生年月日
          <input
            type="date"
            className="mt-2 w-full rounded border border-stone-400 p-2"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
          />
        </label>
        <label>
          判定日
          <input
            type="date"
            className="mt-2 w-full rounded border border-stone-400 p-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <button
          disabled={busy || !address.trim()}
          className="rounded bg-slate-800 px-5 py-3 text-white disabled:opacity-50"
        >
          {busy ? "住所を確認しています…" : "街と方位を見る"}
        </button>
        <p className="self-center text-sm text-stone-600 sm:col-span-2">
          生年月日が空欄のときは、方位の境界だけを表示します。
        </p>
      </form>
      {error && <p role="alert">{error}</p>}
      {origin && (
        <section className="space-y-3" aria-label="街と方位の表示">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold">
              {origin.name}の周辺約{radius}m
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={!viewFlat}
                disabled={!webgl}
                onClick={() => setFlat(false)}
                className="rounded border px-4 py-2 disabled:opacity-40"
              >
                立体
              </button>
              <button
                type="button"
                aria-pressed={viewFlat}
                onClick={() => {
                  setFlat(true);
                  setPlateau("");
                  setUsePlateau(false);
                }}
                className="rounded border px-4 py-2"
              >
                平面
              </button>
            </div>
          </div>
          {!birth && (
            <p>生年月日を入力すると、あなたの吉凶を方位に重ねられます。</p>
          )}
          {birth && !judge && !judgeError && (
            <p role="status">方位を判定しています。</p>
          )}
          {judgeError && <p role="alert">{judgeError}</p>}
          {judge?.blockedByTenchusatsu && (
            <p>
              天中殺の期間に当たります。各方位の判定と合わせてご確認ください。
            </p>
          )}
          {compass && (
            <p className="text-sm">
              判定は真北を基準にしています。方位磁針で測るとずれるため、磁北の針と薄い破線は参考としてご覧ください。
              {compass.declinationKnown
                ? `偏角：${declinationText(compass.declination).replaceAll(" ", "")}`
                : "この地点の偏角を取得できませんでした。"}
            </p>
          )}
          {data && compass ? (
            viewFlat ? (
              <CityPlan
                data={data}
                radius={radius}
                wedges={wedges}
                compass={compass}
              />
            ) : (
              <CityScene
                data={data}
                radius={radius}
                wedges={wedges}
                compass={compass}
                origin={origin}
                plateau={usePlateau ? plateauEntry : null}
                mobile={mobile}
                onPlateau={setPlateau}
                onUnavailable={unavailable}
              />
            )
          ) : (
            !tileError && <p role="status">周辺の地図を読み込んでいます。</p>
          )}
          {tileError && <p role="status">{tileError}</p>}
          {plateauEntry && !viewFlat && (
            <p className="text-sm">
              <button
                type="button"
                aria-pressed={usePlateau}
                onClick={() => setUsePlateau((v) => !v)}
                className="mr-3 rounded border border-stone-400 px-4 py-2"
              >
                {usePlateau
                  ? "目安の高さに戻す"
                  : `PLATEAU（${plateauEntry.year}年）の建物で表示する`}
              </button>
              この地点は国土交通省の3D都市モデルの対象です。実測に近い高さで表示できますが、通信量が数十MBになることがあります。
            </p>
          )}
          {plateau && (
            <p className="text-sm" role="status">
              {plateau}
            </p>
          )}
          <div className="space-y-1 text-xs text-stone-600">
            <p>
              <a
                href="https://maps.gsi.go.jp/development/vt.html"
                className="underline"
              >
                建物・道路：国土地理院ベクトルタイル（出典：国土地理院）
              </a>
            </p>
            {!viewFlat && plateau.startsWith("PLATEAU（") && (
              <p>
                <a href="https://www.mlit.go.jp/plateau/" className="underline">
                  3D都市モデル：国土交通省Project PLATEAU
                </a>
                （
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  className="underline"
                >
                  CC BY 4.0
                </a>
                ）
              </p>
            )}
            <p>住所検索：国土地理院</p>
            {origin.source === "nominatim" && (
              <p>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  className="underline"
                >
                  © OpenStreetMap contributors（ODbL）
                </a>
              </p>
            )}
          </div>
          <ul
            className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"
            aria-label="方位ごとの判定"
          >
            {wedges.map((w) => (
              <li key={w.direction} className="rounded border p-2">
                <span
                  aria-hidden="true"
                  style={{ background: w.color ?? "#e7e5e4" }}
                  className="mr-2 inline-block h-3 w-3 rounded-full"
                />
                {w.label}：{w.status}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm leading-relaxed text-stone-600">
        高さは建物の種別ごとの目安です。PLATEAU対応地域では実測に近い高さを表示します。地図・建物はデータの更新時期によって現況と異なり、表示範囲や件数にも上限があります。二十四山は真北を基準とした参照目盛りです。
      </p>
      <p className="text-sm leading-relaxed text-stone-600">
        吉凶は九星気学の考え方による参考情報です。契約・費用・通勤など、現実の条件と合わせて検討してください。
      </p>
    </div>
  );
}
