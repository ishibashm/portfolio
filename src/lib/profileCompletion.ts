/**
 * 「登録がどこまで済んでいるか」を 1 か所で決める。
 *
 * 判定の道具が動くのに要るのは**生年月日と現在地**の 2 つ。出生地は
 * 八宅（本命卦）や出生の盤を出すときに使う。この線引きは
 * `ProfileForm` の中に `canUseTools` として書かれていたが、同じことを
 * ログイン後の行き先やマイページでも知りたいので、写さずにここへ寄せた。
 *
 * **値があるかどうかしか見ない。**判定そのもの（しきい値・方位・段階）
 * には触れていない。
 */

import {
  settingNumber,
  settingString,
  type Settings,
} from "@/lib/userSettings";

export type ProfileStepKey = "birth_date" | "birth_place" | "base";

export interface ProfileStep {
  key: ProfileStepKey;
  /** 画面に出す名前。 */
  label: string;
  /** 入っているか。 */
  done: boolean;
  /** これが無いと何ができないか。埋めていない人に見せる。 */
  need: string;
  /** 判定の道具が動くのに必須か（出生地は任意）。 */
  required: boolean;
}

function hasPoint(settings: Settings, latKey: string, lonKey: string): boolean {
  return (
    settingNumber(settings, latKey) !== undefined &&
    settingNumber(settings, lonKey) !== undefined
  );
}

export function profileSteps(settings: Settings): ProfileStep[] {
  const birthDate = settingString(settings, "birth_date");
  return [
    {
      key: "birth_date",
      label: "生年月日",
      done: Boolean(birthDate),
      need: "本命星が決まりません。方位の吉凶はすべてここから出ます。",
      required: true,
    },
    {
      key: "base",
      label: "いま住んでいる場所",
      done: hasPoint(settings, "base_lat", "base_lon"),
      need: "どちらの方位に動くのかが決まりません。物件検索の並びにも使います。",
      required: true,
    },
    {
      key: "birth_place",
      label: "出生地",
      done: hasPoint(settings, "birth_lat", "birth_lon"),
      need: "八宅（本命卦）と出生時の盤が出せません。無くても方位の判定は動きます。",
      required: false,
    },
  ];
}

export interface ProfileCompletion {
  steps: ProfileStep[];
  /** 埋まっている数（任意項目を含む）。 */
  done: number;
  /** 全部の数。 */
  total: number;
  /** 必須がそろっていて、判定の道具が動くか。 */
  ready: boolean;
  /** まだ埋まっていないもの。 */
  missing: ProfileStep[];
}

export function profileCompletion(settings: Settings): ProfileCompletion {
  const steps = profileSteps(settings);
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    ready: steps.every((s) => !s.required || s.done),
    missing: steps.filter((s) => !s.done),
  };
}

/** 判定の道具が動くだけの値がそろっているか。 */
export function isProfileReady(settings: Settings): boolean {
  return profileCompletion(settings).ready;
}
