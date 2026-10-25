import Link from "next/link";
import { findUserConfig, getAuthUser } from "@/lib/userConfig";
import { fortuneHtmlEnabled } from "@/lib/mcpAgentConfig";
import { fortuneProfileSchema } from "@/lib/fortuneReport";
import { getFortuneReport } from "@/lib/fortuneGeneration";
import styles from "./fortune.module.css";

export async function FortuneReport() {
  if (!fortuneHtmlEnabled()) return null;
  try {
    const user = await getAuthUser();
    if (!user) return null;
    const config = await findUserConfig(user);
    const profile = fortuneProfileSchema.safeParse({
      birthDate: config?.birth_date,
      lat: config?.base_lat,
      lon: config?.base_lon,
    });
    if (!profile.success) {
      return (
        <Link
          href="/profile"
          className="m-4 inline-block rounded-xl border p-4"
        >
          生年月日と場所を登録する
        </Link>
      );
    }
    const html = await getFortuneReport(user.id, profile.data);
    if (!html) return null;
    return (
      <section aria-label="今日の運勢レポート" className={styles.report}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <p>
          登録済みの情報にもとづく日本時間の計算結果です。刻の可否は方位の吉凶とは異なります。占術上の参考情報です。
        </p>
      </section>
    );
  } catch {
    return <p className="m-4">運勢の計算結果を現在取得できません。</p>;
  }
}
