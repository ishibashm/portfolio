import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { STAR_NAMES } from "@/lib/kigakuContent";
import {
  GUIDE_MEMORY_COOKIE,
  GUIDE_MEMORY_TOPIC_LABELS,
  GUIDE_PREFECTURES,
  guideMemoryConfig,
  readMemory,
} from "@/lib/guide/guideMemory";
import { pageOpenGraph } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

const PAGE_TITLE = "記憶を見る・消す｜案内役";
const PAGE_DESCRIPTION =
  "案内役で「次回も条件を覚える」に同意して保存した条件の確認・JSON書き出し・削除を行います。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/annai/memory" },
  robots: { index: false, follow: false },
  openGraph: pageOpenGraph("/annai/memory", PAGE_TITLE, PAGE_DESCRIPTION),
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const val = sp[key];
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val[0];
  return undefined;
}

function formatJstDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default async function AnnaiMemoryPage(props: PageProps) {
  const sp = (await props.searchParams) ?? {};
  const savedNotice = readParam(sp, "saved") === "1";
  const deletedNotice = readParam(sp, "deleted") === "1";
  const consentError = readParam(sp, "e") === "consent";

  const config = guideMemoryConfig(process.env);
  let readRes: Awaited<ReturnType<typeof readMemory>> = { status: "off" };
  if (config.enabled) {
    const cookieStore = await cookies();
    const rawCookie = cookieStore.get(GUIDE_MEMORY_COOKIE)?.value;
    readRes = await readMemory(rawCookie, { touch: false });
  }

  return (
    <main className="min-h-screen bg-background text-ink">
      <article className="mx-auto max-w-[1700px] px-5 py-12 space-y-6">
        <nav aria-label="パンくず" className="mb-4 text-sm text-ink-muted">
          <Link href="/" className="hover:underline">
            ホーム
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/annai" className="hover:underline">
            案内役に聞く
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">記憶を見る・消す</span>
        </nav>

        <h1 className="text-2xl font-bold font-serif sm:text-3xl">
          記憶を見る・消す
        </h1>

        {savedNotice && (
          <section
            role="status"
            className="rounded-2xl border border-theme-border bg-theme-accent-soft p-4 text-sm font-semibold text-ink"
          >
            条件を記憶しました。
          </section>
        )}

        {deletedNotice && (
          <section
            role="status"
            className="rounded-2xl border border-theme-border bg-theme-surface p-4 text-sm font-semibold text-ink"
          >
            保存していた記憶を削除し、ブラウザのCookie（annai_mem）を消去しました。
          </section>
        )}

        {consentError && (
          <section
            role="alert"
            className="rounded-2xl border border-theme-border bg-theme-gold-soft p-4 text-sm font-semibold text-theme-gold"
          >
            「次回も条件を覚える」にチェックが入っていなかったため、何も保存していません。保存する場合はチェックを入れてから「覚える」を押してください。
          </section>
        )}

        {readRes.status === "off" && (
          <section
            role="status"
            className="rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-sm space-y-3"
          >
            <p className="text-sm font-semibold text-ink">
              記憶の機能はいま停止しています。
            </p>
            <p className="text-sm text-ink-muted">
              現在、条件の読み書きやCookie（annai_mem）の発行は行っていません。案内役のすべての機能は記憶なしでそのままご利用いただけます。
            </p>
          </section>
        )}

        {readRes.status === "none" && (
          <section
            aria-labelledby="no-memory-heading"
            className="rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-sm space-y-4"
          >
            <h2
              id="no-memory-heading"
              className="text-base font-bold font-serif text-ink"
            >
              現在、このブラウザに保存されている記憶はありません
            </h2>
            <p className="text-sm text-ink-muted max-w-[70ch]">
              案内役の結果画面で「次回も条件を覚える」にチェックを入れて「覚える」を押したときに限り、条件が暗号化されて保存されます。
            </p>
            <div className="rounded-xl border border-theme-border bg-theme-subtle p-4 space-y-1.5 text-xs leading-relaxed text-ink-muted max-w-[70ch]">
              <p className="font-bold text-ink">□ 次回も条件を覚える</p>
              <p>
                次の項目だけを、当サイトのデータベースに暗号化して保存し、お使いのブラウザにランダムな識別子のCookie（annai_mem）を置きます。
              </p>
              <p className="font-semibold text-ink">
                ・本命星（1〜9）　・出発地の都道府県　・関心のある話題の区分　・読んだ記事の識別子
              </p>
              <p>
                質問や回答の文章、生年月日、氏名、連絡先、IPアドレスは保存しません。
              </p>
              <p>
                目的は、次回の案内で条件の入力を省くことだけです。最後に使った日から90日（最長でも保存開始から1年）で、自動的に使えなくなり削除します。
              </p>
              <p>
                「記憶を見る・消す」のページで、いつでも確認・書き出し・削除ができます。覚えなくても、案内役のすべての機能をご利用いただけます。
              </p>
            </div>
          </section>
        )}

        {readRes.status === "ok" && (
          <section
            aria-labelledby="saved-memory-heading"
            className="rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-sm space-y-6"
          >
            <h2
              id="saved-memory-heading"
              className="text-base font-bold font-serif text-ink"
            >
              覚えている内容
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full max-w-3xl border-collapse text-left text-sm">
                <tbody>
                  <tr className="border-b border-theme-border">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-semibold text-ink-muted w-48"
                    >
                      本命星
                    </th>
                    <td className="py-3 text-ink">
                      {readRes.memory.star !== undefined
                        ? `本命星 ${readRes.memory.star}（${STAR_NAMES[readRes.memory.star] ?? ""}）`
                        : "未保存"}
                    </td>
                  </tr>
                  <tr className="border-b border-theme-border">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-semibold text-ink-muted"
                    >
                      出発地の都道府県
                    </th>
                    <td className="py-3 text-ink">
                      {readRes.memory.pref
                        ? `${GUIDE_PREFECTURES[readRes.memory.pref]}（${readRes.memory.pref}）`
                        : "未保存"}
                    </td>
                  </tr>
                  <tr className="border-b border-theme-border">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-semibold text-ink-muted"
                    >
                      関心のある話題の区分
                    </th>
                    <td className="py-3 text-ink">
                      {readRes.memory.topics.length > 0
                        ? readRes.memory.topics
                            .map((t) => GUIDE_MEMORY_TOPIC_LABELS[t])
                            .join("・")
                        : "未保存"}
                    </td>
                  </tr>
                  <tr className="border-b border-theme-border">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-semibold text-ink-muted align-top"
                    >
                      読んだ記事
                    </th>
                    <td className="py-3 text-ink">
                      {readRes.memory.slugs.length > 0 ? (
                        <ul className="space-y-1">
                          {readRes.memory.slugs.map((slug) => (
                            <li key={slug}>
                              <Link
                                href={`/blog/${slug}`}
                                className="font-semibold text-accent underline hover:text-ink"
                              >
                                /blog/{slug}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "未保存"
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-theme-border">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-semibold text-ink-muted"
                    >
                      保存開始日
                    </th>
                    <td className="py-3 text-ink">
                      {formatJstDate(readRes.createdAt)}
                    </td>
                  </tr>
                  <tr className="border-b border-theme-border">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-semibold text-ink-muted"
                    >
                      最後に使った日
                    </th>
                    <td className="py-3 text-ink">
                      {formatJstDate(readRes.lastUsedAt)}
                    </td>
                  </tr>
                  <tr className="border-b border-theme-border">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-semibold text-ink-muted"
                    >
                      自動削除の期限
                    </th>
                    <td className="py-3 text-ink">
                      {formatJstDate(readRes.expiresAt)}
                    </td>
                  </tr>
                  <tr className="border-b border-theme-border">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-semibold text-ink-muted"
                    >
                      記憶ID（末尾8桁）
                    </th>
                    <td className="py-3 font-mono text-ink">
                      {readRes.idLabel}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href="/annai/memory/export"
                className="rounded-xl border border-theme-border bg-theme-subtle px-5 py-2.5 text-sm font-bold text-ink hover:border-accent hover:bg-theme-accent-soft"
              >
                書き出す（JSON）
              </a>

              <form
                method="post"
                action="/annai/memory/delete"
                className="inline"
              >
                <button
                  type="submit"
                  className="rounded-xl border border-theme-border bg-theme-surface px-5 py-2.5 text-sm font-bold text-ink hover:border-accent hover:text-accent"
                >
                  消す
                </button>
              </form>
            </div>
          </section>
        )}

        <section
          aria-label="削除や開示のご依頼について"
          className="rounded-2xl border border-theme-border bg-theme-surface p-5 text-xs leading-relaxed text-ink-muted space-y-2 max-w-[70ch]"
        >
          <p>
            ブラウザのCookie（annai_mem）を消した場合やブラウザを変えた場合は、その記憶は使えなくなり、最後に使った日から90日（最長でも保存開始から1年）の期限で自動的に削除されます。
          </p>
          <p>
            運営者への削除や開示のご依頼は、
            <Link
              href="/contact"
              className="mx-1 font-semibold text-accent underline hover:text-ink"
            >
              お問い合わせページ
            </Link>
            から、このページに表示される記憶ID（末尾8桁）を添えてご連絡ください。
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            href="/annai"
            className="font-semibold text-accent underline hover:text-ink"
          >
            案内役に聞く（定型の案内）へ戻る
          </Link>
          <Link
            href="/annai/ask"
            className="font-semibold text-accent underline hover:text-ink"
          >
            自由に質問するへ
          </Link>
        </div>
      </article>
    </main>
  );
}
