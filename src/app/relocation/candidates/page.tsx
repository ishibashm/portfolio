import { CandidateEmailImport } from "@/components/relocation/EmailListingDraft";
import { GmailFeature } from "@/components/relocation/GmailFeature";
import { getAuthUser, toUserId } from "@/lib/userConfig";
import Link from "next/link";
import CandidateHistory from "@/components/relocation/CandidateHistory";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "本人の候補履歴",
  robots: { index: false, follow: false },
};
export default async function CandidatesPage() {
  const user = await getAuthUser();
  if (!user || !toUserId(user))
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1>候補履歴</h1>
        <p>本人の履歴を見るにはログインしてください。</p>
        <Link href="/login?next=%2Frelocation%2Fcandidates" prefetch={false}>
          ログイン
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">本人の候補履歴</h1>
      <p>
        保存時の判定です。出発地や日付を変えた場合は、現在の条件で再判定してください。
      </p>
      <Link href="/relocation/arbitrage" prefetch={false} className="underline">
        物件URL・住所・地図から候補を追加
      </Link>
      <GmailFeature
        enabled={process.env.LISTING_EMAIL_GMAIL_ENABLED === "true"}
      >
        <CandidateEmailImport />
      </GmailFeature>
      <CandidateHistory />
    </main>
  );
}
