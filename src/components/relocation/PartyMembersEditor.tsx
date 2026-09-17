"use client";

/**
 * 同行者・合流する人の入力欄。物件検索と時期ツールが同じものを使う。
 *
 * 物件検索の側欄に埋め込まれていた JSX を切り出した。時期ツールに
 * 「合流する人を選んで 2 年ぶん見る」（利用者の要望 2026-09-17）を
 * 足すとき、同じ欄をもう 1 つ写すと、名前の欄や「移動しない」の意味が
 * 2 か所で少しずつ違ってくる。人の並びと保存の口（`lib/partyMemberInput`）
 * も共有するので、片方で足した人がもう片方にも出る。
 *
 * 判定はしない。ここは「誰が・どこから・いつ生まれた人か」を集める
 * だけで、まとめ方（全員一致・平均・重み付き）の意味は
 * `utils/arbitrageParty` の説明文をそのまま出す。
 */
import React from "react";
import { PlaceInput } from "@/components/relocation/PlaceInput";
import { normalizeBirthDateTimeLocal } from "@/utils/japanDate";
import {
  PARTY_POLICIES,
  isPartyPolicy,
  type PartyPolicy,
} from "@/utils/arbitrageParty";
import type { ProfilePreset } from "@/lib/profilePresetSync";
import {
  partyMemberFromPreset,
  type PartyMemberInput,
} from "@/lib/partyMemberInput";

export interface PartyMembersEditorProps {
  members: PartyMemberInput[];
  onChange: (next: PartyMemberInput[]) => void;
  policy: PartyPolicy;
  onPolicyChange: (next: PartyPolicy) => void;
  /** 他画面で保存済みのプロフィール。ボタン 1 つで同行者に起こす。 */
  savedProfiles: ProfilePreset[];
  /** 「まとめ方」の隣に置く追加の欄（物件検索の「時期の走査」など）。 */
  children?: React.ReactNode;
}

const INPUT =
  "w-full px-2 py-1.5 bg-white dark:bg-stone-50 border border-gray-200 dark:border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-500";

export function PartyMembersEditor({
  members,
  onChange,
  policy,
  onPolicyChange,
  savedProfiles,
  children,
}: PartyMembersEditorProps) {
  const add = (preset?: ProfilePreset) =>
    onChange([...members, partyMemberFromPreset(preset, members.length)]);
  const update = (id: string, patch: Partial<PartyMemberInput>) =>
    onChange(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const remove = (id: string) => onChange(members.filter((m) => m.id !== id));

  const candidates = savedProfiles.filter(
    (preset) => !members.some((m) => m.id === preset.id),
  );

  return (
    <div className="space-y-3">
      {candidates.length > 0 && (
        <div className="space-y-1">
          <span className="block text-[11px] font-semibold text-stone-600">
            保存済みプロフィールから追加
          </span>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => add(preset)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-stone-600 hover:border-indigo-300 dark:border-stone-200 dark:bg-white"
              >
                ＋ {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => add()}
        className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
      >
        ＋ 手入力で同行者を追加
      </button>

      {members.map((member) => (
        <div
          key={member.id}
          data-party-member={member.id}
          className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-stone-200 dark:bg-white"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={member.name}
              onChange={(e) => update(member.id, { name: e.target.value })}
              placeholder="名前（母、父など）"
              aria-label="名前"
              className={`${INPUT} flex-1`}
            />
            <button
              type="button"
              onClick={() => remove(member.id)}
              className="shrink-0 px-2 py-1 text-[11px] font-semibold text-rose-500 hover:underline"
            >
              削除
            </button>
          </div>

          <label className="block space-y-1">
            <span className="block text-[11px] font-semibold text-stone-600">
              生年月日時
            </span>
            <input
              type="datetime-local"
              value={normalizeBirthDateTimeLocal(member.birthDate)}
              onChange={(e) => update(member.id, { birthDate: e.target.value })}
              className={INPUT}
            />
          </label>

          {member.stationary ? (
            <p className="text-[11px] leading-relaxed text-stone-500">
              移動しない人は方位が発生しないので、出発地は要りません。
            </p>
          ) : (
            <PlaceInput
              label="出発地（いま住んでいるところ）"
              lat={member.baseLat === "" ? null : Number(member.baseLat)}
              lon={member.baseLon === "" ? null : Number(member.baseLon)}
              onChange={(lat, lon) =>
                update(member.id, {
                  baseLat: String(lat),
                  baseLon: String(lon),
                })
              }
              help="ここからの向きでこの人の方位が決まります。"
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <label
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-stone-500"
              title="既に移転先の側に住んでいて動かない人。方位が発生しないので判定から外し、同居する相手として一覧にだけ残す。"
            >
              <input
                type="checkbox"
                checked={member.stationary}
                onChange={(e) =>
                  update(member.id, { stationary: e.target.checked })
                }
                className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              移動しない（現地在住）
            </label>
            <label
              className="flex items-center gap-1.5 text-[11px] text-stone-500"
              title="「重み付き」でまとめるときの比重。"
            >
              比重
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={member.weight}
                onChange={(e) =>
                  update(member.id, { weight: Number(e.target.value) || 1 })
                }
                className="w-14 rounded-lg border border-gray-200 bg-white px-1.5 py-1 font-mono text-xs outline-none dark:border-stone-200 dark:bg-stone-50"
              />
            </label>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-1 dark:border-stone-200">
        <label className="block space-y-1">
          <span className="block text-[11px] font-semibold text-stone-600">
            まとめ方
          </span>
          <select
            value={policy}
            onChange={(e) => {
              const next = e.target.value;
              if (isPartyPolicy(next)) onPolicyChange(next);
            }}
            className="w-full cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-2 py-2 text-xs outline-none focus:border-indigo-500 dark:border-stone-200 dark:bg-white"
          >
            {PARTY_POLICIES.map((p) => (
              <option key={p.id} value={p.id} title={p.description}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {children}
      </div>

      <p className="text-[11px] leading-relaxed text-stone-600">
        {PARTY_POLICIES.find((p) => p.id === policy)?.description}
      </p>
    </div>
  );
}

export default PartyMembersEditor;
