"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 現在地を**追い続ける**フック。地図の「現在地」表示の土台。
 *
 * ## なぜ getCurrentPosition ではないのか
 *
 * サイトには既に現在地の取得が 4 か所あるが、どれも
 * `navigator.geolocation.getCurrentPosition`（1 回きり）で、
 * 出発地の入力欄を埋めるためのものだった（設定バー・ホームの
 * プロフィール欄・太陽時計・資産マップ）。
 *
 * 利用者の要望は「Google マップのように、移動したら現在地も動く」。
 * それには `watchPosition` で購読し続ける必要がある。**1 回きりの
 * 取得を繰り返し呼ぶのではない**（電池を食い、位置も飛ぶ）。
 *
 * ## 使う側の決め事
 *
 * - **enabled が false のあいだは購読しない。**既定を false にして、
 *   利用者が現在地ボタンを押したときだけ許可を求める。開いた瞬間に
 *   位置情報の許可を聞く画面は嫌われる
 * - 拒否されたら二度と自動で聞き直さない（status は "denied" で止まる）
 * - 位置は状態として持たず**参照だけ**返す、ということはしない。
 *   地図の再描画に必要なので state で返す
 */

/** 1 回の測位。緯度経度のほかに精度と向きを持つ。 */
export interface WatchedPosition {
  lat: number;
  lon: number;
  /** 測位の誤差半径（メートル）。円を描くのに使う。 */
  accuracyM: number;
  /** 進行方向（度・真北基準）。止まっているときは null。 */
  headingDeg: number | null;
  /** 測位時刻（epoch ミリ秒）。 */
  at: number;
}

export type WatchStatus =
  /** まだ購読していない。 */
  | "idle"
  /** 購読を始めたが、まだ 1 度も測れていない。 */
  | "locating"
  /** 測位できている。 */
  | "watching"
  /** 利用者が拒否した。**自動では聞き直さない。** */
  | "denied"
  /** この環境に位置情報が無い（対応していない・安全でない文脈）。 */
  | "unavailable"
  /**
   * ブラウザ側で既に拒否されている。**押しても許可の確認は出ない。**
   *
   * denied と分けてある。あちらは「この操作で拒否された」で、こちらは
   * 「押す前から拒否されていた」。利用者から見ると**何も起きない**ので、
   * 出す案内が違う（設定から戻す手順が要る）。
   */
  | "blocked"
  /** 一時的な失敗（圏外・タイムアウト）。購読は続いている。 */
  | "error";

export interface WatchedPositionState {
  position: WatchedPosition | null;
  status: WatchStatus;
  /** 画面に出してよい 1 行。失敗していないときは null。 */
  message: string | null;
}

/** 位置情報 API のうち、このフックが使う分だけ。テストで差し替える。 */
export interface GeolocationLike {
  watchPosition(
    onSuccess: (p: GeolocationPosition) => void,
    onError: (e: GeolocationPositionError) => void,
    options?: PositionOptions,
  ): number;
  clearWatch(id: number): void;
}

/**
 * 測位の設定。
 *
 * `enableHighAccuracy` は徒歩の移動を追うために要る（false だと基地局
 * 測位に落ちて数百メートル単位でしか動かない）。`maximumAge` を 0 に
 * すると毎回測り直して電池を食うので、5 秒だけ古い値を許す。
 */
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

/** 失敗の種類を、画面に出す 1 行に落とす。 */
export function watchErrorMessage(code: number): string {
  if (code === 1) {
    return "位置情報の利用が許可されていません。ブラウザの設定から許可すると現在地を表示できます。";
  }
  if (code === 2) {
    return "現在地を測定できませんでした。屋内や地下では測位できないことがあります。";
  }
  if (code === 3) {
    return "現在地の測定に時間がかかっています。電波の届く場所でもう一度お試しください。";
  }
  return "現在地を取得できませんでした。";
}

/** 失敗の種類から、購読を続けるかどうかを決める。拒否だけは打ち切る。 */
export function isFatalWatchError(code: number): boolean {
  return code === 1;
}

/** 購読の内部状態。外向きの status はここから組み立てる（下の註）。 */
type WatchPhase = "none" | "denied" | "error";

/**
 * 安全な文脈（HTTPS か localhost）か。
 *
 * **ここが false だと、ブラウザは許可の確認すら出さない。**利用者からは
 * 「ボタンを押しても何も起きない」に見える。実際にその報告があった。
 * 押す前に分かるので、押す前に言う。
 */
export function isSecureForGeolocation(
  ctx: { isSecureContext?: boolean } | undefined = typeof window !== "undefined"
    ? window
    : undefined,
): boolean {
  /* window が無い（サーバ側）ときは判定しない。描画は client で行う。 */
  if (!ctx) return true;
  return ctx.isSecureContext !== false;
}

/** 位置情報の許可を、要求せずに読むための最小の口。 */
export interface PermissionsLike {
  query(descriptor: { name: "geolocation" }): Promise<{ state: string }>;
}

export function useWatchedPosition(
  enabled: boolean,
  /** テスト用。省略時は navigator.geolocation。 */
  geolocation?: GeolocationLike | null,
  /** テスト用。省略時は navigator.permissions。 */
  permissions?: PermissionsLike | null,
): WatchedPositionState {
  const [inner, setInner] = useState<{
    position: WatchedPosition | null;
    phase: WatchPhase;
    message: string | null;
  }>({ position: null, phase: "none", message: null });
  /* 拒否されたあとは、enabled が立て直されても購読しない。
     押すたびに許可ダイアログを出すのは迷惑なので。 */
  const deniedRef = useRef(false);
  /* 押す前から拒否されているか。Permissions API があるときだけ分かる。 */
  const [preBlocked, setPreBlocked] = useState(false);

  /* navigator.geolocation は同じ参照が返るので、依存に置いても
     購読は張り直されない。 */
  const api =
    geolocation ??
    (typeof navigator !== "undefined" ? navigator.geolocation : null);

  const perms =
    permissions ??
    (typeof navigator !== "undefined"
      ? ((navigator as Navigator & { permissions?: PermissionsLike })
          .permissions ?? null)
      : null);

  /*
    **要求せずに、いまの許可を読む。**Permissions API は許可の確認を
    出さないので、これを見てから watchPosition を呼べば「押しても何も
    起きない」を避けられる。対応していないブラウザでは何もしない
    （従来どおり watchPosition の失敗で分かる）。
  */
  useEffect(() => {
    if (!enabled || !perms) return;
    let alive = true;
    perms
      .query({ name: "geolocation" })
      .then((s) => {
        if (alive && s.state === "denied") setPreBlocked(true);
      })
      .catch(() => {
        /* 対応していない・引けない。従来の経路に任せる。 */
      });
    return () => {
      alive = false;
    };
  }, [enabled, perms]);

  useEffect(() => {
    if (!enabled || !api || deniedRef.current) return;

    const id = api.watchPosition(
      (p) => {
        setInner({
          position: {
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            accuracyM: p.coords.accuracy,
            /* heading は止まっているとき NaN や null で来る。
               矢印の向きに使うので、数でなければ持たない。 */
            headingDeg:
              typeof p.coords.heading === "number" &&
              Number.isFinite(p.coords.heading)
                ? p.coords.heading
                : null,
            at: p.timestamp,
          },
          phase: "none",
          message: null,
        });
      },
      (e) => {
        const message = watchErrorMessage(e.code);
        if (isFatalWatchError(e.code)) {
          deniedRef.current = true;
          setInner((prev) => ({ ...prev, phase: "denied", message }));
          api.clearWatch(id);
          return;
        }
        /* 一時的な失敗。既に測れていたなら、その位置は残したまま
           購読を続ける（トンネルを抜ければ戻る）。 */
        setInner((prev) => ({ ...prev, phase: "error", message }));
      },
      WATCH_OPTIONS,
    );

    return () => api.clearWatch(id);
  }, [enabled, api]);

  /*
    status は**組み立てる**。効果の中で setState して作らない。

    「購読していない＝idle」「購読したがまだ測れていない＝locating」は
    どちらも enabled と position から分かるので、状態として持つ必要が
    ない。効果の中で同期的に setState すると再レンダリングが連鎖し、
    lint（react-hooks/set-state-in-effect）にも出る。
  */
  const status: WatchStatus = !enabled
    ? "idle"
    : !api || !isSecureForGeolocation()
      ? "unavailable"
      : preBlocked
        ? "blocked"
        : inner.phase === "denied"
          ? "denied"
          : inner.position
            ? "watching"
            : inner.phase === "error"
              ? "error"
              : "locating";

  /*
    案内は status から組み立てる。**「何も起きない」を黙って返さない。**

    押しても許可の確認が出ない経路が 2 つある。どちらも利用者からは
    同じに見えるので、原因ごとに戻し方を書く。

      安全でない文脈  … ブラウザが機能ごと止める。確認は出ない
      既に拒否済み    … 一度断ると以後は聞かれない。設定から戻す
  */
  const message = !enabled
    ? null
    : !api
      ? "このブラウザは位置情報に対応していません。"
      : !isSecureForGeolocation()
        ? "安全な接続（https）でないため、位置情報を使えません。確認の表示も出ません。"
        : status === "blocked"
          ? "このサイトの位置情報が拒否されています。確認は表示されないので、ブラウザの設定（アドレスバーの鍵や ⓘ から「位置情報」）で許可に戻してください。iPhone・iPad では 設定 → プライバシーとセキュリティ → 位置情報サービス も確認してください。"
          : inner.message;

  return { position: inner.position, status, message };
}
