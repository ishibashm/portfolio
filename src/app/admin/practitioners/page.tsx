"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  normalizeWebsiteUrl,
  type PractitionerStatus,
} from "@/lib/practitioners";

type Application = {
  id: string;
  display_name: string;
  email: string;
  headline: string;
  area: string;
  specialties: string[];
  profile: string;
  website_url: string | null;
  status: PractitionerStatus;
};
const statuses: Record<PractitionerStatus, string> = {
  pending: "承認待ち",
  approved: "公開中",
  hidden: "非公開",
};

// Page access follows the admin middleware; both APIs also enforce denyUnlessAdmin.
export default function AdminPractitionersPage() {
  const [rows, setRows] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/practitioners", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error || "申請一覧を読み込めませんでした。");
      setRows(body.data);
      setError(null);
    } catch (e) {
      setRows([]);
      setError(
        e instanceof Error ? e.message : "申請一覧を読み込めませんでした。",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(id: string, status: "approved" | "hidden") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/practitioners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error || "更新できませんでした。");
      setRows(
        (current) =>
          current?.map((row) => (row.id === id ? { ...row, status } : row)) ??
          null,
      );
      setNotice(`${statuses[status]}に変更しました。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-stone-800">
      <header className="space-y-2">
        <Link href="/admin/blog" className="text-sm text-indigo-700 underline">
          ブログ管理
        </Link>
        <h1 className="text-2xl font-bold">鑑定士掲載の管理</h1>
        <p className="text-sm text-stone-600">
          申請内容を確認して、承認または非公開にしてください。
        </p>
      </header>
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="ml-3 min-h-11 underline"
          >
            再読み込み
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-800">
          {notice}
        </p>
      )}
      {rows === null ? (
        <p role="status">読み込み中…</p>
      ) : (
        (Object.keys(statuses) as PractitionerStatus[]).map((status) => {
          const applications = rows.filter((row) => row.status === status);
          return (
            <section
              key={status}
              aria-label={statuses[status]}
              className="space-y-3"
            >
              <h2 className="text-lg font-semibold">
                {statuses[status]}（{applications.length}）
              </h2>
              {!applications.length && (
                <p className="text-sm text-stone-500">申請はありません。</p>
              )}
              {applications.map((row) => {
                const website = normalizeWebsiteUrl(row.website_url);
                return (
                  <article
                    key={row.id}
                    className="space-y-3 break-words rounded-2xl border border-stone-200 bg-white p-4 sm:p-6"
                  >
                    <h3 className="text-lg font-semibold">
                      {row.display_name}
                    </h3>
                    <p>{row.headline}</p>
                    <dl className="space-y-2 text-sm">
                      <div>
                        <dt className="font-medium">メール</dt>
                        <dd>{row.email}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">対応地域</dt>
                        <dd>{row.area}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">得意分野</dt>
                        <dd>{row.specialties.join("、")}</dd>
                      </div>
                    </dl>
                    <p className="whitespace-pre-wrap text-sm">{row.profile}</p>
                    {website && (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-indigo-700 underline"
                      >
                        {website}
                      </a>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={busy || status === "approved"}
                        onClick={() => void update(row.id, "approved")}
                        className="min-h-11 rounded-xl bg-indigo-600 px-5 py-2 text-sm text-white disabled:opacity-40"
                      >
                        承認する
                      </button>
                      <button
                        type="button"
                        disabled={busy || status === "hidden"}
                        onClick={() => void update(row.id, "hidden")}
                        className="min-h-11 rounded-xl border border-stone-300 px-5 py-2 text-sm disabled:opacity-40"
                      >
                        非公開にする
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })
      )}
    </main>
  );
}
