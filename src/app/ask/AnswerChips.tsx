"use client";
import { useState } from "react";
import {
  BirthYearPicker,
  OriginChooser,
  type PickedOrigin,
} from "@/components/inputs/QuickChoices";
import type { AnswerFieldId, AskOrigin } from "@/lib/askAnswerFields";
import {
  readSettingsSync,
  saveSettings,
  settingString,
} from "@/lib/userSettings";

export function AnswerChips({
  fields,
  disabled,
  savedOrigin,
  birthDateKnown,
  onSend,
  onOrigin,
}: {
  fields: AnswerFieldId[];
  disabled: boolean;
  savedOrigin?: AskOrigin;
  birthDateKnown: boolean;
  onSend: (text: string) => void;
  onOrigin: (origin: PickedOrigin) => void;
}) {
  const [customDate, setCustomDate] = useState(false);
  const [conditions, setConditions] = useState<string[]>([]);
  const [pendingOrigin, setPendingOrigin] = useState<PickedOrigin>();
  const chip =
    "rounded-lg border border-teal-600 bg-white px-3 py-2 text-sm aria-pressed:bg-teal-100";
  async function chooseOrigin(origin: PickedOrigin) {
    const choice = settingString(readSettingsSync(), "ask_origin_save_choice");
    if (!choice && origin.lat !== undefined && origin.lon !== undefined) {
      setPendingOrigin(origin);
      return;
    }
    if (
      choice === "save" &&
      origin.lat !== undefined &&
      origin.lon !== undefined
    )
      await saveSettings({ base_lat: origin.lat, base_lon: origin.lon });
    onOrigin(origin);
  }
  async function finishOrigin(save: boolean) {
    if (!pendingOrigin) return;
    await saveSettings({
      ask_origin_save_choice: save ? "save" : "once",
      ...(save
        ? { base_lat: pendingOrigin.lat!, base_lon: pendingOrigin.lon! }
        : {}),
    });
    onOrigin(pendingOrigin);
    setPendingOrigin(undefined);
  }
  if (!fields.length) return null;
  return (
    <fieldset
      disabled={disabled}
      aria-label="回答ボタン"
      className="mb-3 space-y-3 rounded-xl border border-teal-600 bg-teal-50 p-3 disabled:opacity-50"
    >
      <legend className="text-sm font-semibold">ボタンで条件を伝える</legend>
      {fields.includes("birthYear") && !birthDateKnown && (
        <BirthYearPicker
          onChange={(year) => {
            if (year) onSend(`生まれ年は${year}年です。`);
          }}
        />
      )}
      {fields.includes("period") && (
        <div className="flex flex-wrap gap-2">
          {["今月中", "1〜3か月後", "半年以内", "未定"].map((period) => (
            <button
              key={period}
              type="button"
              className={chip}
              onClick={() =>
                onSend(
                  period === "未定"
                    ? "時期はまだ決めていません。"
                    : `時期は${period}を考えています。`,
                )
              }
            >
              {period}
            </button>
          ))}
          <button
            type="button"
            className={chip}
            onClick={() => setCustomDate(!customDate)}
          >
            日付を選ぶ
          </button>
          {customDate && (
            <input
              type="date"
              aria-label="相談する日付"
              onChange={(event) => {
                if (event.target.value)
                  onSend(`時期は${event.target.value}ごろです。`);
              }}
            />
          )}
        </div>
      )}
      {fields.includes("origin") && (
        <>
          {savedOrigin && (
            <button
              type="button"
              className={chip}
              onClick={() =>
                void chooseOrigin({
                  ...savedOrigin,
                  name: savedOrigin.name ?? "登録地",
                })
              }
            >
              登録地（{savedOrigin.name ?? "保存した出発地"}）
            </button>
          )}
          <OriginChooser
            chooseLabel="一覧から選ぶ"
            onPick={(origin) => void chooseOrigin(origin)}
          />
          {pendingOrigin && (
            <div>
              この出発地を保存しますか？{" "}
              <button
                type="button"
                className={chip}
                onClick={() => void finishOrigin(true)}
              >
                保存する
              </button>{" "}
              <button
                type="button"
                className={chip}
                onClick={() => void finishOrigin(false)}
              >
                今回だけ
              </button>
            </div>
          )}
        </>
      )}
      {fields.includes("conditions") && (
        <div className="flex flex-wrap gap-2">
          {["家賃重視", "通勤重視", "暮らしやすさ", "特になし"].map(
            (condition) => (
              <button
                key={condition}
                type="button"
                className={chip}
                aria-pressed={conditions.includes(condition)}
                onClick={() =>
                  setConditions((current) =>
                    condition === "特になし"
                      ? [condition]
                      : current.includes(condition)
                        ? current.filter((c) => c !== condition)
                        : [
                            ...current.filter((c) => c !== "特になし"),
                            condition,
                          ],
                  )
                }
              >
                {condition}
              </button>
            ),
          )}
          <button
            type="button"
            className={chip}
            disabled={!conditions.length}
            onClick={() =>
              onSend(
                conditions.includes("特になし")
                  ? "条件は特にありません。"
                  : `条件は${conditions.join("・")}です。`,
              )
            }
          >
            この条件で送る
          </button>
        </div>
      )}
    </fieldset>
  );
}
