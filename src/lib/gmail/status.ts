import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  candidateUser,
  candidateJson,
  candidateFailure,
} from "@/lib/listingCandidateApi";
import { requireGmailEnabled, GmailError } from "./security";
export type GmailConnectionSummary = {
  id: string;
  labelId: string | null;
  startedAt: Date;
};
export function createGmailStatusHandler(deps: {
  user: (req: NextRequest) => Promise<string>;
  list: (owner: string) => Promise<GmailConnectionSummary[]>;
}) {
  return async (req: NextRequest) => {
    try {
      requireGmailEnabled();
      const owner = await deps.user(req);
      const rows = await deps.list(owner);
      return candidateJson({
        connections: rows.map(({ id, labelId, startedAt }) => ({
          id,
          labelId,
          startedAt: startedAt.toISOString(),
        })),
      });
    } catch (error) {
      if (error instanceof GmailError && error.code === "GMAIL_DISABLED")
        return candidateJson({ code: "GMAIL_DISABLED" }, 503);
      return candidateFailure(error);
    }
  };
}
export const gmailStatus = createGmailStatusHandler({
  user: candidateUser,
  list: (owner) =>
    prisma.$queryRaw<
      GmailConnectionSummary[]
    >`SELECT id, "labelId", "startedAt" FROM listing_email_connections WHERE "userId" = ${owner}::uuid ORDER BY "createdAt" DESC, id DESC`,
});
