import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { askDataCutoff } from "./askDataExpiry";

export async function runAskDataRetention({
  dryRun = true,
  now = new Date(),
} = {}) {
  const saved = { ask_data: { not: Prisma.DbNull } };
  const where = {
    ...saved,
    ask_data_last_used_at: { lte: askDataCutoff(now) },
  };
  const [eligibleCount, unknownLastUsedAtCount] = await Promise.all([
    prisma.user_configs.count({ where }),
    prisma.user_configs.count({
      where: { ...saved, ask_data_last_used_at: null },
    }),
  ]);
  const enabled = !dryRun && process.env.ASK_DATA_RETENTION_ENABLED === "true";
  // TODO: docs/security/data-minimization.md — 有効化前に事前通知の別経路を決める。
  const clearedCount = enabled
    ? (
        await prisma.user_configs.updateMany({
          where,
          data: { ask_data: Prisma.DbNull },
        })
      ).count
    : 0;
  return {
    dryRun: !enabled,
    eligibleCount,
    unknownLastUsedAtCount,
    clearedCount,
  };
}
