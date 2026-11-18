import prisma from "../prisma";

/** 解決から90日。日時不明の既存行について解決日を推測しない。 */
export function contactRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
}

export async function runContactRetention({
  dryRun = true,
  now = new Date(),
} = {}) {
  const where = {
    handled: true,
    resolved_at: { lte: contactRetentionCutoff(now) },
  };
  const [eligibleCount, unknownResolvedAtCount] = await Promise.all([
    prisma.contact_messages.count({ where }),
    prisma.contact_messages.count({
      where: { handled: true, resolved_at: null },
    }),
  ]);
  const enabled = !dryRun && process.env.CONTACT_RETENTION_ENABLED === "true";
  // 実行フラグと環境変数の両方がなければ、件数確認だけで終える。
  const deletedCount = enabled
    ? (await prisma.contact_messages.deleteMany({ where })).count
    : 0;
  return {
    dryRun: !enabled,
    eligibleCount,
    unknownResolvedAtCount,
    deletedCount,
  };
}
