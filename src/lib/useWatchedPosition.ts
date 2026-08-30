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

export function useWatchedPosition(
  enabled: boolean,
  /** テスト用。省略時は navigator.geolocation。 */
  geolocation?: GeolocationLike | null,
): WatchedPositionState {
  const [position, setPosition] = useState<WatchedPosition | null>(null);
  const [status, setStatus] = useState<WatchStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  /* 拒否されたあとは、enabled が立て直されても購読しない。
     押すたびに許可ダイアログを出すのは迷惑なので。 */
  const deniedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    if (deniedRef.current) return;

    const api =
      geolocation ??
      (typeof navigator !== "undefined" ? navigator.geolocation : null);
    if (!api) {
      setStatus("unavailable");
      setMessage("このブラウザは位置情報に対応していません。");
      return;
    }

    setStatus("locating");
    setMessage(null);

    const id = api.watchPosition(
      (p) => {
        setPosition({
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
        });
        setStatus("watching");
        setMessage(null);
      },
      (e) => {
        setMessage(watchErrorMessage(e.code));
        if (isFatalWatchError(e.code)) {
          deniedRef.current = true;
          setStatus("denied");
          api.clearWatch(id);
          return;
        }
        /* 一時的な失敗。既に測れていたなら、その位置は残したまま
           購読を続ける（トンネルを抜ければ戻る）。 */
        setStatus((prev) => (prev === "watching" ? "watching" : "error"));
      },
      WATCH_OPTIONS,
    );

    return () => api.clearWatch(id);
  }, [enabled, geolocation]);

  return { position, status, message };
}
