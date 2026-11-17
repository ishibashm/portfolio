const DAY_MS = 24 * 60 * 60 * 1000;

/** 暦月ではなく経過日数で揃え、表示と清掃の境界を一致させる。 */
export function askDataExpiry(lastUsedAt: Date | null, now = new Date()) {
  if (!lastUsedAt) return null;
  const expiresAt = new Date(lastUsedAt.getTime() + 90 * DAY_MS);
  const noticeAt = new Date(expiresAt.getTime() - 14 * DAY_MS);
  const status =
    now >= expiresAt ? "expired" : now >= noticeAt ? "notice" : "active";
  return {
    expiresAt: expiresAt.toISOString(),
    noticeAt: noticeAt.toISOString(),
    status,
  };
}

export function askDataCutoff(now = new Date()) {
  return new Date(now.getTime() - 90 * DAY_MS);
}
