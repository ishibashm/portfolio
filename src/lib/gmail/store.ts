import prisma from "@/lib/prisma";

export interface GmailConnectionRecord {
  id: string;
  userId: string;
  labelId: string;
  startedAt: Date;
  sealedState: string;
}
export interface GmailConnectionStore {
  /** Serialize reads/disconnect across instances. Commit only on success. */
  withConnection<T>(
    ownerId: string,
    id: string,
    operation: (
      record: GmailConnectionRecord | null,
      save: (sealedState: string | null) => Promise<void>,
    ) => Promise<T>,
  ): Promise<T>;
}
export const gmailConnectionStore: GmailConnectionStore = {
  withConnection(ownerId, id, operation) {
    return prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<GmailConnectionRecord[]>`
        SELECT id, "userId", "labelId", "startedAt", "sealedState"
        FROM listing_email_connections WHERE id = ${id}::uuid AND "userId" = ${ownerId}::uuid FOR UPDATE`;
        return operation(rows[0] ?? null, async (sealedState) => {
          if (sealedState === null) {
            await tx.$executeRaw`DELETE FROM listing_email_connections WHERE id = ${id}::uuid AND "userId" = ${ownerId}::uuid`;
          } else {
            await tx.$executeRaw`UPDATE listing_email_connections SET "sealedState" = ${sealedState} WHERE id = ${id}::uuid AND "userId" = ${ownerId}::uuid`;
          }
        });
      },
      { timeout: 30000, maxWait: 5000 },
    );
  },
};
