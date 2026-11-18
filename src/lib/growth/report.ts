import type { Finding, GrowthReport } from "./types";

const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  blocker: "阻害",
  high: "高",
  medium: "中",
  low: "低",
  ok: "良好",
};

function section(title: string, lines: string[]): string {
  return [`## ${title}`, "", ...lines, ""].join("\n");
}

export function reportToMarkdown(report: GrowthReport): string {
  const blockers = report.findings.filter((row) => row.severity === "blocker");
  const lines: string[] = [
    "# サイト改善・成長の実行レポート",
    "",
    `- 実行時刻: ${report.generatedAt}`,
    `- 対象: ${report.siteUrl}`,
    `- 文章の補足: ${report.llmNote}`,
    `- マージ: しない`,
    `- デプロイ: しない`,
    "",
    report.narrative,
    "",
  ];

  lines.push(
    section(
      "差分",
      report.diff.hasPrevious
        ? [
            `- 新しく出た指摘: ${report.diff.added.length ? report.diff.added.join("、") : "なし"}`,
            `- 消えた指摘: ${report.diff.removed.length ? report.diff.removed.join("、") : "なし"}`,
            `- 継続: ${report.diff.unchanged}`,
          ]
        : ["前回の report.json は無い。この実行が基準になる。"],
    ),
  );

  const byRole = new Map<string, Finding[]>();
  for (const row of report.findings) {
    const list = byRole.get(row.role) ?? [];
    list.push(row);
    byRole.set(row.role, list);
  }
  const auditLines: string[] = [];
  for (const [role, rows] of byRole) {
    if (role !== "auditor" && role !== "monetization" && role !== "growth")
      continue;
    for (const row of rows) {
      auditLines.push(
        `- **${SEVERITY_LABEL[row.severity]}** ${row.title}（${row.id}）`,
      );
      auditLines.push(`  - ${row.detail}`);
      if (row.evidence.length)
        auditLines.push(`  - 根拠: ${row.evidence.join("、")}`);
    }
  }
  lines.push(section("監査と収益化", auditLines));

  lines.push(
    section("本番の確認", [
      report.live.attempted
        ? "自サイトの公開 URL だけを見た。本文と広告 ID は残していない。"
        : "この実行は本番を取りに行っていない（`--live` が無い）。",
      ...report.live.probes.map(
        (probe) =>
          `- ${probe.ok ? "到達" : "未達"} ${probe.path} ${probe.status ?? "—"} ${probe.note}`,
      ),
    ]),
  );

  lines.push(
    section(
      "優先バックログ",
      report.backlog.map(
        (row) =>
          `- **${row.score}** ${row.title}（${row.area}、影響 ${row.impact}、工数 ${row.effort}、自動適用 ${row.safeToAutoApply ? "可" : "不可"}）: ${row.why}`,
      ),
    ),
  );

  lines.push(
    section(
      "コンテンツ・図・動画の草案",
      report.briefs.map((brief) => `### ${brief.title}\n\n${brief.body}\n`),
    ),
  );

  lines.push(
    section(
      "Builder",
      report.proposals.length
        ? report.proposals.map((row) => `- ${row.title}: ${row.reason}`)
        : [
            "自動で適用する項目は無い。低リスクの修正は、このフレームワークの外で PR の差分にする。マージは所有者が明示するまで行わない。",
          ],
    ),
  );

  lines.push(
    section(
      "検証",
      report.verification.map(
        (row) => `- ${row.passed ? "通過" : "失敗"} ${row.name}: ${row.detail}`,
      ),
    ),
  );

  lines.push(
    section(
      "役割",
      report.roleNotes.map((row) => `- ${row.role}: ${row.note}`),
    ),
  );

  if (blockers.length) {
    lines.push(
      section(
        "人が止めるもの",
        blockers.map((row) => `- ${row.title}: ${row.detail}`),
      ),
    );
  }

  lines.push(
    "このファイルは成長フレームワークの出力。判定のしきい値は変えていない。",
    "",
  );
  return lines.join("\n");
}

export function composeNarrative(
  report: Pick<GrowthReport, "findings" | "backlog">,
): string {
  const blockers = report.findings.filter((row) => row.severity === "blocker");
  const top = report.backlog[0];
  const blockerText = blockers.length
    ? `阻害は ${blockers.map((row) => row.title).join("、")}。`
    : "阻害の指摘は無い。";
  const next = top ? `次に効くのは「${top.title}」（得点 ${top.score}）。` : "";
  return `流入は検索・AI の引用・共有・戻ってくる動線、収益は審査通過後の広告と、通過前の誤解のない紹介で増やす。${blockerText}${next}枠の自動適用はしない。`;
}
