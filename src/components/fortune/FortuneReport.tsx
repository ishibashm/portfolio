import { headers } from "next/headers";
import { fortuneRequest } from "@/lib/fortuneGuard";
import { FortuneFrame } from "./FortuneFrame";
import Link from "next/link";
import { findUserConfig, getAuthUser } from "@/lib/userConfig";
import { fortuneHtmlEnabled } from "@/lib/mcpAgentConfig";
import { fortuneProfileSchema } from "@/lib/fortuneReport";
import { getFortuneReport } from "@/lib/fortuneGeneration";
import styles from "./fortune.module.css";

type ReportState =
  | { kind: "none" }
  | { kind: "needsProfile" }
  | { kind: "error" }
  | {
      kind: "report";
      report: NonNullable<Awaited<ReturnType<typeof getFortuneReport>>>;
    };

// JSX は try/catch の外で組み立てる（描画時の例外は try/catch では捕まらないため）。
async function loadReport(): Promise<ReportState> {
  try {
    const user = await getAuthUser();
    if (!user) return { kind: "none" };
    const config = await findUserConfig(user);
    const profile = fortuneProfileSchema.safeParse({
      birthDate: config?.birth_date,
      lat: config?.base_lat,
      lon: config?.base_lon,
    });
    if (!profile.success) return { kind: "needsProfile" };
    // Authenticated GET server render only; no form/POST or CSRF surface here.
    const request = fortuneRequest(await headers());
    const report = await getFortuneReport(
      user.id,
      profile.data,
      new Date(),
      request,
    );
    return report ? { kind: "report", report } : { kind: "none" };
  } catch {
    return { kind: "error" };
  }
}

export async function FortuneReport() {
  if (!fortuneHtmlEnabled()) return null;
  const state = await loadReport();
  if (state.kind === "none") return null;
  if (state.kind === "error") {
    return <p className="m-4">運勢の計算結果を現在取得できません。</p>;
  }
  if (state.kind === "needsProfile") {
    return (
      <Link href="/profile" className="m-4 inline-block rounded-xl border p-4">
        生年月日と場所を登録する
      </Link>
    );
  }
  const { report } = state;
  return (
    <section aria-label="今日の運勢レポート" className={styles.report}>
      {report.srcdoc ? (
        <>
          <FortuneFrame srcdoc={report.srcdoc} />
          <details>
            <summary>計算結果を確認</summary>
            <div
              aria-label="MCP計算結果"
              dangerouslySetInnerHTML={{ __html: report.fallbackHtml }}
            />
          </details>
        </>
      ) : (
        <div
          aria-label="MCP計算結果"
          dangerouslySetInnerHTML={{ __html: report.fallbackHtml }}
        />
      )}
      {report.note && <p>{report.note}</p>}
      <p>
        登録済みの情報にもとづく日本時間の計算結果です。刻の可否は方位の吉凶とは異なります。占術上の参考情報です。
      </p>
    </section>
  );
}
