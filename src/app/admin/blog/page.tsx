"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, PenSquare, Plus, Trash2 } from "lucide-react";

/**
 * ブログ記事の編集（管理者専用）。
 *
 * 記事は DB（BlogPost）にあり、公開側（/blog）は blogStore が読む。
 * これまで記事の追加は取り込みワークフロー（blog-import.yml）経由
 * しかなく、誤字 1 つ直すにも Markdown を直してワークフローを回す
 * 必要があった。ここで一覧・作成・編集・公開/下書きの切替まで行う。
 *
 * ページの認可は middleware（ADMIN_EMAIL）、API は denyUnlessAdmin の
 * 二重。片方だけだと、もう片方の抜け（middleware はページのパスしか
 * 見ない）がそのまま穴になる。
 */

type AdminPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
  tags: string;
  published: boolean;
  publishedAt: string;
  updatedAt: string;
};

/**
 * Markdown（content/blog/*.md）にしか無い記事。
 *
 * 置き場を DB へ移している途中なので、取り込みを流していない記事は
 * DB に行が無い。**行が無ければ id も無いので、ここからは編集できない。**
 * 「無い」ことだけを見せて、次に何をすればよいかを書く。
 */
type PendingImport = { slug: string; title: string; publishedAt: string };

/** フォームの中身。API へ送る形と同じにして、詰め替えを持たない。 */
type Draft = {
  id: string | null;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: string;
  tags: string;
  published: boolean;
  publishedAt: string;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  title: "",
  slug: "",
  content: "",
  excerpt: "",
  category: "",
  tags: "",
  published: false,
  publishedAt: "",
};

const inputClass =
  "w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-800 outline-none focus:ring-2 focus:ring-indigo-500";

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blog");
      const body = await res.json();
      if (!body?.success) throw new Error(body?.error || `HTTP ${res.status}`);
      setPosts(body.data.posts);
      // 古い応答（この列を返す前の版）でも落ちないよう、無ければ空。
      setPendingImport(body.data.pendingImport ?? []);
      setListError(null);
    } catch (e) {
      setListError(
        e instanceof Error ? e.message : "一覧を取得できませんでした。",
      );
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openNew = () => {
    setDraft({ ...EMPTY_DRAFT });
    setFormError(null);
    setNotice(null);
  };

  const openEdit = async (id: string) => {
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/blog/${id}`);
      const body = await res.json();
      if (!body?.success) throw new Error(body?.error || `HTTP ${res.status}`);
      const p = body.data.post;
      setDraft({
        id: p.id,
        title: p.title,
        slug: p.slug,
        content: p.content,
        excerpt: p.excerpt ?? "",
        category: p.category ?? "",
        tags: p.tags ?? "",
        published: p.published,
        // date input が読める形（YYYY-MM-DD）へ。時刻は保存時に落ちるが、
        // 記事の公開日は日単位でしか使っていない。
        publishedAt: (p.publishedAt ?? "").slice(0, 10),
      });
    } catch (e) {
      setListError(
        e instanceof Error ? e.message : "記事を読み込めませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setFormError(null);
    try {
      const payload = {
        title: draft.title,
        slug: draft.slug,
        content: draft.content,
        excerpt: draft.excerpt,
        category: draft.category,
        tags: draft.tags,
        published: draft.published,
        publishedAt: draft.publishedAt || undefined,
      };
      const res = await fetch(
        draft.id ? `/api/admin/blog/${draft.id}` : "/api/admin/blog",
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json();
      if (!body?.success) {
        // 入力の不備（400/409）は赤帯でフォームに残す。閉じてしまうと
        // 打っていた本文ごと消える。
        setFormError(body?.error || `HTTP ${res.status}`);
        return;
      }
      setNotice(
        body.data.post.published
          ? `「${body.data.post.title}」を保存しました（公開中）。`
          : `「${body.data.post.title}」を保存しました（下書き）。`,
      );
      setDraft(null);
      await loadList();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    if (
      !confirm(`「${draft.title}」を削除します。戻せません。よろしいですか？`)
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/blog/${draft.id}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!body?.success) {
        setFormError(body?.error || `HTTP ${res.status}`);
        return;
      }
      setNotice("削除しました。");
      setDraft(null);
      await loadList();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 p-4 md:p-8 font-sans">
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white/80 backdrop-blur-xl border border-rose-100/80 p-6 rounded-3xl shadow-xl shadow-rose-100/30">
          <div>
            <h1 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
              <PenSquare className="w-5 h-5 text-indigo-500" />
              ブログ記事の編集
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              下書きは公開側（/blog）に出ません。公開のチェックを入れて保存した時点で見えます。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/metrics"
              className="px-3.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              効果検証を見る
            </Link>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              新しい記事
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
            {notice}
          </div>
        )}
        {listError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
            {listError}
          </div>
        )}

        {draft && (
          <div className="bg-white/90 border border-stone-200 rounded-3xl p-6 space-y-4 shadow-lg">
            <h2 className="text-sm font-bold text-stone-700">
              {draft.id ? "記事を編集" : "新しい記事"}
            </h2>
            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-xs font-semibold text-stone-500 space-y-1">
                タイトル
                <input
                  className={inputClass}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-stone-500 space-y-1">
                slug（URL。英小文字・数字・ハイフン）
                <input
                  className={`${inputClass} font-mono`}
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                  placeholder="direction-basics"
                />
              </label>
              <label className="block text-xs font-semibold text-stone-500 space-y-1 md:col-span-2">
                要約（一覧と検索結果に出る 1〜2 文）
                <input
                  className={inputClass}
                  value={draft.excerpt}
                  onChange={(e) =>
                    setDraft({ ...draft, excerpt: e.target.value })
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-stone-500 space-y-1">
                カテゴリ
                <input
                  className={inputClass}
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                  placeholder="方位の基本"
                />
              </label>
              <label className="block text-xs font-semibold text-stone-500 space-y-1">
                タグ（カンマ区切り）
                <input
                  className={inputClass}
                  value={draft.tags}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                  placeholder="方位,引越し"
                />
              </label>
              <label className="block text-xs font-semibold text-stone-500 space-y-1">
                公開日（空なら保存時の日付）
                <input
                  type="date"
                  className={inputClass}
                  value={draft.publishedAt}
                  onChange={(e) =>
                    setDraft({ ...draft, publishedAt: e.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-600 mt-5">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) =>
                    setDraft({ ...draft, published: e.target.checked })
                  }
                  className="rounded border-stone-300 text-indigo-600 w-4 h-4"
                />
                公開する（外すと下書きに戻り、/blog から消えます）
              </label>
            </div>
            <label className="block text-xs font-semibold text-stone-500 space-y-1">
              本文（Markdown）
              <textarea
                className={`${inputClass} font-mono min-h-[420px] leading-relaxed`}
                value={draft.content}
                onChange={(e) =>
                  setDraft({ ...draft, content: e.target.value })
                }
              />
            </label>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={busy}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-semibold"
                >
                  {busy ? "保存中..." : "保存"}
                </button>
                <button
                  onClick={() => setDraft(null)}
                  disabled={busy}
                  className="px-5 py-2 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  閉じる
                </button>
              </div>
              {draft.id && (
                <button
                  onClick={remove}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 bg-white text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  削除
                </button>
              )}
            </div>
          </div>
        )}

        <div className="bg-white/90 border border-stone-200 rounded-3xl overflow-hidden shadow-lg">
          {posts === null ? (
            <div className="p-10 flex items-center justify-center gap-2 text-stone-600 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              読み込み中...
            </div>
          ) : posts.length === 0 ? (
            <div className="p-10 text-center text-stone-600 text-sm">
              記事がまだありません。「新しい記事」から作れます。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[720px]">
                <thead className="whitespace-nowrap text-[10px] text-stone-600 uppercase bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">タイトル / slug</th>
                    <th className="px-4 py-2.5 font-bold">状態</th>
                    <th className="px-4 py-2.5 font-bold">カテゴリ</th>
                    <th className="px-4 py-2.5 font-bold">公開日</th>
                    <th className="px-4 py-2.5 font-bold">最終更新</th>
                    {/* 行そのものも押せるが、押せると分かる目印が
                        hover の色だけだった。表の行が押せることは
                        気付けないので、ボタンを明示する。 */}
                    <th className="px-4 py-2.5 font-bold text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => openEdit(p.id)}
                      className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-stone-800">
                          {p.title}
                        </div>
                        <div className="font-mono text-[10px] text-stone-600">
                          {p.slug}
                          {p.published && (
                            <Link
                              href={`/blog/${p.slug}`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              className="ml-2 text-indigo-500 hover:underline"
                            >
                              開く ↗
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.published ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                            公開中
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-bold text-[10px]">
                            下書き
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {p.category ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-stone-500">
                        {p.publishedAt.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 font-mono text-stone-500">
                        {p.updatedAt.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            // 行の onClick と二重に走らせない。
                            e.stopPropagation();
                            openEdit(p.id);
                          }}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white text-[11px] font-bold whitespace-nowrap"
                        >
                          編集
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/*
          Markdown にしか無い記事。

          置き場を content/blog/*.md から DB へ移している途中で、取り込みを
          流していない記事は DB に行が無い。**行が無ければ id も無いので、
          この画面からは編集できない。**

          これまでは一覧に出ないだけで理由がどこにも出ず、「編集が機能して
          いない」ようにしか見えなかった。実際にそう報告があった。無いことと、
          次に何をすればよいかを書く。
        */}
        {pendingImport.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-amber-900">
              まだ取り込まれていない記事が {pendingImport.length} 本あります
            </h2>
            <p className="text-xs leading-relaxed text-amber-800">
              下の記事は <code className="font-mono">content/blog/*.md</code>{" "}
              にはありますが、データベースにはまだ入っていません。
              <strong>読者には表示されています</strong>
              （公開側はデータベースが空なら Markdown
              を読むため）が、データベースに行が無いので
              <strong>この画面からは編集できません</strong>。
            </p>
            <p className="text-xs leading-relaxed text-amber-800">
              編集できるようにするには、GitHub の Actions から
              <strong>
                「Import blog articles into the database」を mode: apply
              </strong>
              で実行してください。先に mode: dry-run
              で何が入るかを確認できます。
            </p>
            <ul className="space-y-1">
              {pendingImport.map((p) => (
                <li
                  key={p.slug}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs text-amber-900"
                >
                  <span className="font-bold">{p.title}</span>
                  <code className="font-mono text-[10px] text-amber-700">
                    {p.slug}
                  </code>
                  <span className="font-mono text-[10px] text-amber-700">
                    {p.publishedAt.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
