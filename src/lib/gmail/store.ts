import prisma from "@/lib/prisma";

export interface GmailConnectionRecord {
  id: string;
  userId: string;
  labelId: string | null;
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
      save: (
        sealedState: string | null,
        selection?: { labelId: string; startedAt: Date },
      ) => Promise<void>,
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
        return operation(rows[0] ?? null, async (sealedState, selection) => {
          if (sealedState === null) {
            await tx.$executeRaw`DELETE FROM listing_email_connections WHERE id = ${id}::uuid AND "userId" = ${ownerId}::uuid`;
          } else if (selection) {
            await tx.$executeRaw`UPDATE listing_email_connections SET "sealedState" = ${sealedState}, "labelId" = ${selection.labelId}, "startedAt" = ${selection.startedAt} WHERE id = ${id}::uuid AND "userId" = ${ownerId}::uuid`;
          } else {
            await tx.$executeRaw`UPDATE listing_email_connections SET "sealedState" = ${sealedState} WHERE id = ${id}::uuid AND "userId" = ${ownerId}::uuid`;
          }
        });
      },
      { timeout: 30000, maxWait: 5000 },
    );
  },
};

/** No plaintext credential is accepted by this persistence boundary. */
export async function createGmailConnection(record: GmailConnectionRecord) {
  await prisma.$executeRaw`INSERT INTO listing_email_connections (id, "userId", "labelId", "startedAt", "sealedState") VALUES (${record.id}::uuid, ${record.userId}::uuid, NULL, ${record.startedAt}, ${record.sealedState})`;
}
