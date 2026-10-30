import { vi } from "vitest";
export const rows: {
  id: string;
  day: string;
  route: string;
  input_tokens: number | null;
  output_tokens: number | null;
}[] = [];
export const db = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  apiUsage: {
    findMany: vi.fn(async () => [...rows]),
    create: vi.fn(async ({ data }) => {
      const row = { ...data, id: String(rows.length) };
      rows.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }) => {
      Object.assign(rows.find((r) => r.id === where.id)!, data);
    }),
  },
};
export const prismaMock = { ...db, $transaction: vi.fn(async (fn) => fn(db)) };
