"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import type { AskConversation, AskMemoryItem, AskPerson } from "@/lib/askData";
import { initialConsultationSuggestions } from "@/lib/followUpSuggestions";
import { GuideChatAvatar } from "@/components/guide/GuideCharacter";

type ConversationSummary = Pick<
  AskConversation,
  "id" | "title" | "createdAt" | "updatedAt"
>;

function dateLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function ConversationList({
  conversations,
  activeConversationId,
  onOpen,
  onRename,
  onDelete,
  onPicked,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onPicked?: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState("");

  return (
    <ol className="mt-3 space-y-2" aria-label="保存した会話">
      {conversations.map((conversation) => (
        <li
          key={conversation.id}
          className={`rounded-xl border p-2 ${
            conversation.id === activeConversationId
              ? "border-amber-300 bg-amber-50"
              : "border-stone-200 bg-white"
          }`}
        >
          {renamingId === conversation.id ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const title = renameValue.trim();
                if (title) onRename(conversation.id, title);
                setRenamingId(undefined);
              }}
            >
              <label className="text-xs font-medium">
                会話タイトル
                <input
                  autoFocus
                  maxLength={80}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  type="submit"
                  className="rounded bg-slate-800 px-2 py-1 text-white"
                >
                  保存
                </button>
                <button type="button" onClick={() => setRenamingId(undefined)}>
                  キャンセル
                </button>
              </div>
            </form>
          ) : (
            <>
              <button
                type="button"
                aria-current={
                  conversation.id === activeConversationId ? "page" : undefined
                }
                onClick={() => {
                  onOpen(conversation.id);
                  onPicked?.();
                }}
                className="block w-full text-left"
              >
                <span className="block truncate text-sm font-medium">
                  {conversation.title}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {dateLabel(conversation.updatedAt)}
                </span>
              </button>
              <div className="mt-2 flex gap-3 text-xs text-slate-600">
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(conversation.id);
                    setRenameValue(conversation.title);
                  }}
                  className="underline underline-offset-2"
                >
                  名前を変更
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "この会話と、この会話から作った相談メモを削除しますか？",
                      )
                    )
                      onDelete(conversation.id);
                  }}
                  className="text-red-700 underline underline-offset-2"
                >
                  削除
                </button>
              </div>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ConversationNavigation({
  conversations,
  activeConversationId,
  onOpen,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const list = (onPicked?: () => void) => (
    <ConversationList
      conversations={conversations}
      activeConversationId={activeConversationId}
      onOpen={onOpen}
      onRename={onRename}
      onDelete={onDelete}
      onPicked={onPicked}
    />
  );
  return (
    <>
      <div className="mb-3 flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
        >
          相談履歴（{conversations.length}件）
        </button>
        <button
          type="button"
          onClick={onNew}
          className="rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white"
        >
          ＋ 新しいチャット
        </button>
      </div>
      <aside className="hidden max-h-[46rem] min-h-0 overflow-y-auto rounded-2xl border border-stone-200 bg-white/70 p-3 lg:block">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
        >
          ＋ 新しいチャット
        </button>
        {list()}
      </aside>
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="相談履歴"
          className="fixed inset-0 z-50 bg-slate-950/35 lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="h-full w-[min(88vw,22rem)] overflow-y-auto bg-[#faf7f5] p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">相談履歴</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="相談履歴を閉じる"
                className="rounded-full border border-stone-300 bg-white px-3 py-1"
              >
                閉じる
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                onNew();
                setDrawerOpen(false);
              }}
              className="mt-4 w-full rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
            >
              ＋ 新しいチャット
            </button>
            {list(() => setDrawerOpen(false))}
          </div>
        </div>
      )}
    </>
  );
}

export interface PersonEdits {
  id?: string;
  name: string;
  birthDate: string;
  birthPlace: string;
  residence: string;
}

const emptyPerson: PersonEdits = {
  name: "",
  birthDate: "",
  birthPlace: "",
  residence: "",
};

function ShirubeBubble({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex w-full max-w-2xl items-start gap-2 sm:gap-3"
      data-chat-role="assistant"
    >
      <GuideChatAvatar />
      <div className="min-w-0 flex-1 sm:max-w-[88%] sm:flex-none">
        <p className="mb-1 ml-1 text-xs font-semibold text-indigo-700">
          しるべ
        </p>
        <div className="rounded-2xl rounded-tl-md border border-indigo-100 bg-white/95 px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm sm:px-5 sm:py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

type GuideStep =
  | "people"
  | "name"
  | "birthDate"
  | "birthPlace"
  | "residence"
  | "topic";

const quickReplyClass =
  "rounded-full border border-indigo-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50";

function personLabel(name: string): string {
  const trimmed = name.trim();
  return /^(?:本人|自分|私|わたし)$/u.test(trimmed)
    ? trimmed
    : `${trimmed}さん`;
}

export function ShirubeGuide({
  people,
  selectedPeople,
  disabled,
  onChoosePerson,
  onSave,
  onSuggestion,
  onLocate,
}: {
  people: AskPerson[];
  selectedPeople: AskPerson[];
  disabled: boolean;
  onChoosePerson: (id?: string) => void;
  onSave: (edits: PersonEdits) => void;
  onSuggestion: (suggestion: string) => void;
  onLocate: () => Promise<string>;
}) {
  const [step, setStep] = useState<GuideStep>(
    selectedPeople.length ? "topic" : "people",
  );
  const [draft, setDraft] = useState<PersonEdits>(emptyPerson);
  const [locating, setLocating] = useState(false);
  const topics = initialConsultationSuggestions(selectedPeople);

  const startAdd = (name = "") => {
    setDraft({ ...emptyPerson, name });
    setStep("name");
  };
  const finishPerson = () => {
    onSave(draft);
    setStep("topic");
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-2 sm:py-5">
      {step === "people" && (
        <>
          <ShirubeBubble>
            <p>こんにちは。方位と住まいの手帖をご案内する、しるべです。</p>
            <p className="mt-2">
              {people.length
                ? "まず、どなたのことを相談するか教えてください。"
                : "まず、どなたのことを相談するか登録しましょう。人物情報なしで始めることもできます。"}
            </p>
          </ShirubeBubble>
          <div className="ml-0 flex flex-wrap gap-2 sm:ml-[3.75rem]">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChoosePerson(person.id);
                  setStep("topic");
                }}
                className={quickReplyClass}
                aria-label={`${person.name}を相談対象に選ぶ`}
              >
                <span className="font-semibold">{person.name}</span>
                {person.active && (
                  <span className="ml-1 text-xs text-emerald-700">使用中</span>
                )}
                <span className="mt-0.5 block text-xs text-slate-500">
                  {person.birthDate}
                  {person.residence ? `・${person.residence}` : ""}
                </span>
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={() => startAdd(people.length ? "" : "本人")}
              className={quickReplyClass}
            >
              ＋ 新しい人を登録
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChoosePerson();
                setStep("topic");
              }}
              className={quickReplyClass}
            >
              人物情報なしで相談
            </button>
          </div>
        </>
      )}

      {step === "name" && (
        <>
          <ShirubeBubble>
            この方をどう呼びますか？本名でなく「本人」「配偶者」などで大丈夫です。
          </ShirubeBubble>
          <form
            className="ml-0 space-y-3 sm:ml-[3.75rem]"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.name.trim()) setStep("birthDate");
            }}
          >
            <div className="flex flex-wrap gap-2" aria-label="呼び名の候補">
              {["本人", "配偶者", "子ども", "家族"].map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, name }))}
                  className={quickReplyClass}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="flex max-w-md gap-2">
              <label className="sr-only" htmlFor="guide-person-name">
                呼び名
              </label>
              <input
                id="guide-person-name"
                autoFocus
                required
                maxLength={40}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="例：本人、配偶者"
                className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-400"
              />
              <button
                type="submit"
                disabled={!draft.name.trim()}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                次へ
              </button>
            </div>
          </form>
        </>
      )}

      {step === "birthDate" && (
        <>
          <ShirubeBubble>
            {personLabel(draft.name)}
            の生年月日を教えてください。方位や日取りの計算に使います。
          </ShirubeBubble>
          <form
            className="ml-0 flex max-w-md gap-2 sm:ml-[3.75rem]"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.birthDate) setStep("birthPlace");
            }}
          >
            <label className="sr-only" htmlFor="guide-person-birth-date">
              {personLabel(draft.name)}の生年月日
            </label>
            <input
              id="guide-person-birth-date"
              autoFocus
              required
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              value={draft.birthDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  birthDate: event.target.value,
                }))
              }
              className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-400"
            />
            <button
              type="submit"
              disabled={!draft.birthDate}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              次へ
            </button>
          </form>
        </>
      )}

      {step === "birthPlace" && (
        <>
          <ShirubeBubble>
            出生地が分かれば、市区町村まで教えてください。ここは任意です。
          </ShirubeBubble>
          <form
            className="ml-0 flex max-w-lg flex-wrap gap-2 sm:ml-[3.75rem]"
            onSubmit={(event) => {
              event.preventDefault();
              setStep("residence");
            }}
          >
            <label className="sr-only" htmlFor="guide-person-birth-place">
              {personLabel(draft.name)}の出生地
            </label>
            <input
              id="guide-person-birth-place"
              autoFocus
              maxLength={80}
              value={draft.birthPlace}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  birthPlace: event.target.value,
                }))
              }
              placeholder="都道府県・市区町村（分かる範囲）"
              className="min-w-56 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-400"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
            >
              {draft.birthPlace.trim() ? "次へ" : "スキップ"}
            </button>
          </form>
        </>
      )}

      {step === "residence" && (
        <>
          <ShirubeBubble>
            最後に、いまお住まいの市区町村を教えてください。ここも任意で、街探しの出発地に使います。
          </ShirubeBubble>
          <form
            className="ml-0 max-w-lg space-y-2 sm:ml-[3.75rem]"
            onSubmit={(event) => {
              event.preventDefault();
              finishPerson();
            }}
          >
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="guide-person-residence">
                {personLabel(draft.name)}の現住地
              </label>
              <input
                id="guide-person-residence"
                autoFocus
                maxLength={80}
                value={draft.residence}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    residence: event.target.value,
                  }))
                }
                placeholder="都道府県・市区町村"
                className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-400"
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
              >
                {draft.residence.trim() ? "登録" : "スキップして登録"}
              </button>
            </div>
            <button
              type="button"
              disabled={locating}
              onClick={() => {
                setLocating(true);
                void onLocate()
                  .then((residence) =>
                    setDraft((current) => ({ ...current, residence })),
                  )
                  .catch(() => {})
                  .finally(() => setLocating(false));
              }}
              className="text-xs text-slate-600 underline underline-offset-2 disabled:opacity-50"
            >
              {locating
                ? "現在地を確認中…"
                : "現在地から市区町村を入力（許可が必要）"}
            </button>
          </form>
        </>
      )}

      {step === "topic" && (
        <>
          <ShirubeBubble>
            <p>
              {selectedPeople.length
                ? `${selectedPeople.map((person) => personLabel(person.name)).join("、")}について、何を相談しますか？`
                : "今日は何を相談しますか？"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              候補を選ぶと下の入力欄に入ります。内容を確認して「送信」を押すまで、AIの無料枠は使いません。
            </p>
          </ShirubeBubble>
          <div
            className="ml-0 flex flex-wrap gap-2 sm:ml-[3.75rem]"
            aria-label="相談内容の候補"
          >
            {topics.map((topic) => (
              <button
                key={topic}
                type="button"
                disabled={disabled}
                onClick={() => onSuggestion(topic)}
                className={quickReplyClass}
              >
                {topic}
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setStep("people")}
              className={quickReplyClass}
            >
              相談する人を選び直す
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AskPeoplePanel({
  people,
  selectedIds,
  disabled,
  onToggle,
  onSave,
  onDelete,
  onLocate,
}: {
  people: AskPerson[];
  selectedIds: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
  onSave: (edits: PersonEdits) => void;
  onDelete: (id: string) => void;
  onLocate: () => Promise<string>;
}) {
  const [draft, setDraft] = useState<PersonEdits>(emptyPerson);
  const [locating, setLocating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const edit = (person: AskPerson) => {
    setDraft({
      id: person.id,
      name: person.name,
      birthDate: person.birthDate,
      birthPlace: person.birthPlace ?? "",
      residence: person.residence ?? "",
    });
    setEditorOpen(true);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
    setDraft(emptyPerson);
    setEditorOpen(false);
  };

  return (
    <section aria-label="この会話の相談対象" className="relative">
      <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-stone-200 bg-white/75 px-3 py-2 sm:px-4">
        <span className="text-xs font-semibold text-slate-600">相談対象</span>
        {people
          .filter((person) => selectedIds.includes(person.id))
          .map((person) => (
            <button
              key={person.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(person.id)}
              aria-label={`${person.name}を相談対象から外す`}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 disabled:opacity-50"
            >
              {person.name} <span aria-hidden="true">×</span>
            </button>
          ))}
        {selectedIds.length === 0 && (
          <span className="text-xs text-slate-500">まだ選んでいません</span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDrawerOpen(true)}
          className="ml-auto rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-stone-50 disabled:opacity-50"
        >
          選択・確認
        </button>
      </div>
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ask-people-drawer-title"
          className="fixed inset-0 z-50 bg-slate-950/35"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDrawerOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setDrawerOpen(false);
          }}
        >
          <div className="ml-auto h-full w-[min(94vw,30rem)] overflow-y-auto bg-[#faf7f5] p-4 shadow-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="ask-people-drawer-title" className="font-semibold">
                  相談する人
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  サイトの使用中・保存済みプロフィールと、同行者もここで選べます。
                </p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setDrawerOpen(false)}
                aria-label="相談する人の画面を閉じる"
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm"
              >
                閉じる
              </button>
            </div>

            {people.length > 0 ? (
              <ul className="mt-5 space-y-2">
                {people.map((person) => {
                  const linked = Boolean(person.sourceIds?.length);
                  const linkedToAccount = person.sourceIds?.some(
                    (sourceId) =>
                      sourceId.startsWith("profile:") ||
                      sourceId.startsWith("settings:"),
                  );
                  const linkedToTiming = person.sourceIds?.some((sourceId) =>
                    sourceId.startsWith("party:timing:"),
                  );
                  return (
                    <li
                      key={person.id}
                      className="rounded-xl border border-stone-200 bg-white p-3"
                    >
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(person.id)}
                          disabled={disabled}
                          onChange={() => onToggle(person.id)}
                          aria-label={`${person.name}を相談対象にする`}
                        />
                        <span className="min-w-0">
                          <strong>{person.name}</strong>
                          {person.active && (
                            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              使用中
                            </span>
                          )}
                          <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                            {person.birthDate || "生年月日未入力"}
                            {person.residence
                              ? `・現住所 ${person.residence}`
                              : ""}
                            {person.birthPlace
                              ? `・出生地 ${person.birthPlace}`
                              : ""}
                          </span>
                        </span>
                      </label>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {linked ? (
                          <Link
                            href={
                              linkedToAccount
                                ? "/account"
                                : linkedToTiming
                                  ? "/relocation/timing"
                                  : "/relocation/arbitrage"
                            }
                            className="underline underline-offset-2"
                          >
                            登録元で確認・編集
                          </Link>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => edit(person)}
                              className="underline underline-offset-2"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `${person.name}を削除しますか？`,
                                  )
                                )
                                  onDelete(person.id);
                              }}
                              className="text-red-700 underline underline-offset-2"
                            >
                              削除
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-slate-600">
                まだ人物が登録されていません。
              </p>
            )}

            <div className="mt-5 border-t border-stone-200 pt-4">
              {!editorOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(emptyPerson);
                    setEditorOpen(true);
                  }}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
                >
                  ＋ /ask に人物を追加
                </button>
              ) : (
                <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    呼び名・関係（本名不要）
                    <input
                      aria-label="人物の呼び名"
                      required
                      maxLength={40}
                      value={draft.name}
                      disabled={disabled}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="例：本人、配偶者、長男"
                      className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    生年月日
                    <input
                      aria-label="人物の生年月日"
                      required
                      type="date"
                      min="1900-01-01"
                      max="2100-12-31"
                      value={draft.birthDate}
                      disabled={disabled}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          birthDate: event.target.value,
                        }))
                      }
                      className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    出生地（任意）
                    <input
                      aria-label="人物の出生地"
                      maxLength={80}
                      value={draft.birthPlace}
                      disabled={disabled}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          birthPlace: event.target.value,
                        }))
                      }
                      placeholder="都道府県・市区町村（分かる範囲）"
                      className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    現住所の市区町村（任意）
                    <input
                      aria-label="人物の現住所"
                      maxLength={80}
                      value={draft.residence}
                      disabled={disabled}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          residence: event.target.value,
                        }))
                      }
                      placeholder="都道府県・市区町村"
                      className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 font-normal"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={disabled}
                      className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {draft.id ? "変更を保存" : "人物を登録"}
                    </button>
                    <button
                      type="button"
                      disabled={disabled || locating}
                      onClick={() => {
                        setLocating(true);
                        void onLocate()
                          .then((residence) =>
                            setDraft((current) => ({ ...current, residence })),
                          )
                          .catch(() => {})
                          .finally(() => setLocating(false));
                      }}
                      className="text-sm underline underline-offset-2 disabled:opacity-50"
                    >
                      {locating
                        ? "現在地を確認中…"
                        : "現在地から現住所を入力（許可が必要）"}
                    </button>
                    {draft.id && (
                      <span className="text-xs text-slate-500">
                        /ask に登録した人物のみ編集できます。
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(emptyPerson);
                        setEditorOpen(false);
                      }}
                      className="text-sm underline underline-offset-2"
                    >
                      キャンセル
                    </button>
                  </div>
                </form>
              )}
            </div>
            <p className="mt-5 text-xs text-slate-600">
              この会話の相談対象：{selectedIds.length}人（最大8人）
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function AskMemoryPanel({
  memories,
  onDelete,
}: {
  memories: AskMemoryItem[];
  onDelete: (id: string) => void;
}) {
  return (
    <details className="rounded-2xl border border-stone-200 bg-white/70 p-4 sm:p-5">
      <summary className="cursor-pointer font-semibold">
        覚えている相談（{memories.length}件）
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        完了した相談の要点を次の会話に引き継ぎます。不要な項目はここで削除できます。
      </p>
      {memories.length ? (
        <ul className="mt-3 space-y-2">
          {[...memories]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((memory) => (
              <li
                key={memory.id}
                className="rounded-xl border border-stone-200 bg-white p-3"
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {memory.text}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{dateLabel(memory.updatedAt)}</span>
                  <button
                    type="button"
                    onClick={() => onDelete(memory.id)}
                    className="text-red-700 underline underline-offset-2"
                    aria-label="この相談メモを削除"
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          まだ相談メモはありません。回答が完了すると要点が追加されます。
        </p>
      )}
    </details>
  );
}
