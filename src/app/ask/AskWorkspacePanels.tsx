"use client";

import { useState, type FormEvent } from "react";
import type { AskConversation, AskMemoryItem, AskPerson } from "@/lib/askData";

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

export function AskPeoplePanel({
  people,
  selectedIds,
  disabled,
  onToggle,
  onSave,
  onDelete,
  onImportSaved,
  onLocate,
}: {
  people: AskPerson[];
  selectedIds: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
  onSave: (edits: PersonEdits) => void;
  onDelete: (id: string) => void;
  onImportSaved: () => void;
  onLocate: () => Promise<string>;
}) {
  const [draft, setDraft] = useState<PersonEdits>(emptyPerson);
  const [locating, setLocating] = useState(false);
  const [editorOpen, setEditorOpen] = useState(people.length === 0);
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
    <section
      aria-labelledby="ask-profile-heading"
      className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ask-profile-heading" className="font-semibold">
            相談する人
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            家族などを登録し、この会話で相談する人を複数選べます。
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onImportSaved}
          className="text-sm underline underline-offset-2 disabled:opacity-50"
        >
          サイトの登録内容から本人を追加
        </button>
      </div>

      {people.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {people.map((person) => (
            <li
              key={person.id}
              className="rounded-xl border border-amber-200 bg-white p-3"
            >
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(person.id)}
                  disabled={disabled}
                  onChange={() => onToggle(person.id)}
                  aria-label={`${person.name}を相談対象にする`}
                />
                <span>
                  <strong>{person.name}</strong>
                  <span className="mt-1 block text-xs text-slate-600">
                    {person.birthDate || "生年月日未入力"}
                    {person.residence ? `・現住所 ${person.residence}` : ""}
                    {person.birthPlace ? `・出生地 ${person.birthPlace}` : ""}
                  </span>
                </span>
              </label>
              <div className="mt-2 flex gap-3 text-xs">
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
                    if (window.confirm(`${person.name}を削除しますか？`))
                      onDelete(person.id);
                  }}
                  className="text-red-700 underline underline-offset-2"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          まだ人物が登録されていません。プロフィールなしでも質問できます。
        </p>
      )}

      <details
        className="mt-4"
        open={people.length === 0 || editorOpen}
        onToggle={(event) => setEditorOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium">
          {draft.id ? "人物を編集" : "人物を追加"}
        </summary>
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
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
              placeholder="例：福岡県福岡市"
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
              placeholder="例：長崎県長崎市"
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
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyPerson);
                  setEditorOpen(false);
                }}
                className="text-sm underline underline-offset-2"
              >
                編集をやめる
              </button>
            )}
          </div>
        </form>
      </details>
      <p className="mt-3 text-xs text-slate-600">
        この会話の相談対象：{selectedIds.length}人（最大8人）
      </p>
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
