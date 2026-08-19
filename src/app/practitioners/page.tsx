"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { toUserMessage } from "@/lib/errorMessage";
import {
  PRACTITIONER_AREAS,
  PRACTITIONER_LIMITS,
  type PublicPractitioner,
} from "@/lib/practitioners";

/**
 * 鑑定士の一覧と登録。
 *
 * 記事は計算結果を出せるが「うちの事情だとどうか」には答えられない。
 * そこに応えられる人を集めておくと、読み手には次の行き先ができ、
 * 鑑定士には集客の動機ができる。
 *
 * 掲載は承認制。名乗るだけで連絡先付きの掲載が作れると、宣伝と詐称の
 * 置き場になる。ここでは「申請を受け付けた」までを返し、公開は管理者が決める。
 */

const SPECIALTY_CHOICES = [
  "引越しの方位",
  "日取り選び",
  "家相・間取り",
  "吉方位旅行",
  "開業・移転",
  "年運・月運",
];

export default function PractitionersPage() {
  const [rows, setRows] = useState<PublicPractitioner[] | null>(null);
  const [area, setArea] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [formArea, setFormArea] = useState<string>(PRACTITIONER_AREAS[0]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [profile, setProfile] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = area ? `?area=${encodeURIComponent(area)}` : "";
      const res = await fetch(`/api/practitioners${q}`);
      const json = await res.json();
      setRows(json.success ? json.data : []);
    } catch {
      setRows([]);
    }
  }, [area]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => alive && setSignedIn(!!data.user))
      .catch(() => alive && setSignedIn(false));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/practitioners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          headline,
          area: formArea,
          specialties,
          profile,
          websiteUrl,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "登録できませんでした。");
        return;
      }
      setDone(json.message ?? "受け付けました。");
      setOpen(false);
    } catch (err) {
      setError(toUserMessage(err, "登録できませんでした。"));
    } finally {
      setSending(false);
    }
  }

  function toggleSpecialty(s: string) {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  const count = rows?.length ?? 0;

  // 幅は全画面で 1700px に揃える（1/3 と同じ理由）。
  return (
    <main className="mx-auto max-w-[1700px] px-4 py-10">
      <h1 className="font-serif text-2xl font-bold text-stone-900">
        九星気学の鑑定士
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        このサイトが出せるのは、暦と方位盤から機械的に決まるところまでです。住む人の事情や家の間取りまで含めた判断は、人に相談したほうが早いことがあります。ここでは、引越しの方位と日取りを扱う鑑定士を登録制で掲載しています。
      </p>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">
        掲載内容は各鑑定士によるものです。当サイトは掲載の形式だけを確認しており、鑑定の内容や結果を保証するものではありません。依頼の条件・料金は直接ご確認ください。
      </p>

      {count > 0 && (
        <div className="mt-6 flex items-center gap-2">
          <label className="text-xs text-stone-500">対応地域</label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
          >
            <option value="">すべて</option>
            {PRACTITIONER_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}

      {count > 0 ? (
        <ul className="mt-6 space-y-4">
          {rows!.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-stone-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-base font-bold text-stone-800">
                  {p.displayName}
                </h2>
                <span className="text-xs text-stone-500">{p.area}</span>
              </div>
              <p className="mt-1 text-sm text-stone-600">{p.headline}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.specialties.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                {p.profile}
              </p>
              {p.websiteUrl && (
                <a
                  href={p.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 inline-block text-xs text-emerald-700 underline underline-offset-2"
                >
                  詳しく見る
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-stone-300 p-6 text-sm text-stone-500">
          掲載を準備しています。鑑定を行っている方の登録をお待ちしています。
        </p>
      )}

      <section className="mt-10 border-t border-stone-200 pt-6">
        <h2 className="text-base font-bold text-stone-800">掲載を申し込む</h2>
        <p className="mt-2 text-xs leading-relaxed text-stone-500">
          掲載は無料です。内容を確認のうえ公開します。公開後に内容を書き換えた場合も、あらためて確認します。
        </p>

        {done && (
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {done}
          </p>
        )}

        {!open && !done && (
          <div className="mt-4">
            {signedIn === false ? (
              <Link
                href="/login"
                className="inline-block rounded-full border border-stone-300 px-4 py-2 text-xs text-stone-600 transition hover:bg-stone-100"
              >
                ログインして申し込む
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-full border border-stone-300 px-4 py-2 text-xs text-stone-600 transition hover:bg-stone-100"
              >
                掲載を申し込む
              </button>
            )}
          </div>
        )}

        {open && (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="掲載名（屋号・鑑定名）">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={PRACTITIONER_LIMITS.displayName}
                className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
              />
            </Field>

            <Field label="一行の紹介">
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={PRACTITIONER_LIMITS.headline}
                placeholder="引越しの方位と日取りを20年"
                className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
              />
            </Field>

            <Field label="対応地域">
              <select
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
                className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
              >
                {PRACTITIONER_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={`得意分野（${PRACTITIONER_LIMITS.specialtiesMax}つまで）`}>
              <div className="flex flex-wrap gap-2">
                {SPECIALTY_CHOICES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSpecialty(s)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      specialties.includes(s)
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-stone-300 text-stone-600"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={`本文（${PRACTITIONER_LIMITS.profileMin}〜${PRACTITIONER_LIMITS.profileMax}文字）`}
            >
              <textarea
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                rows={7}
                className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
                placeholder="どんな相談を受けているか、どのくらいの期間やっているか、料金の目安などを書いてください。"
              />
              <span className="mt-1 block text-[11px] text-stone-600">
                {profile.trim().length} / {PRACTITIONER_LIMITS.profileMax}
              </span>
            </Field>

            <Field label="連絡先の URL（任意）">
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-2 text-xs text-stone-500"
              >
                やめる
              </button>
              <button
                type="submit"
                disabled={sending}
                className="rounded-full bg-stone-800 px-5 py-2 text-xs text-white disabled:opacity-40"
              >
                {sending ? "送信中…" : "申し込む"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-stone-600">
        {label}
      </span>
      {children}
    </label>
  );
}
