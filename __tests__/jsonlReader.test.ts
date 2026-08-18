import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { findLastRecordBackwards } from "../src/utils/jsonlReader";

const testFilePath = path.join(process.cwd(), "data", "test_nba_history.jsonl");

/**
 * このテストが書き込む行の形。
 *
 * 以前は `(r: any) => r.id === 1` と書いていたので、**綴りを間違えても
 * 気付けなかった**（`r.di` でも型検査を通る）。実際に読む枝だけを型にする
 * のは、外部 JSON の扱いと同じ方針（CLAUDE.md 4 節）。
 */
interface Record_ {
  id: number;
  type: string;
  data?: string;
  value?: string;
  payload?: string;
}

describe("jsonlReader - findLastRecordBackwards", () => {
  beforeEach(async () => {
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(testFilePath), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it("should return null for a non-existent file", async () => {
    const result = await findLastRecordBackwards("non_existent_file.jsonl", () => true);
    expect(result).toBeNull();
  });

  it("should return null for an empty file", async () => {
    await fs.writeFile(testFilePath, "", "utf-8");
    const result = await findLastRecordBackwards(testFilePath, () => true);
    expect(result).toBeNull();
  });

  it("should find the only record in a single-line file", async () => {
    const record = { id: 1, type: "nba", data: "test" };
    await fs.writeFile(testFilePath, JSON.stringify(record) + "\n", "utf-8");
    
    const result = await findLastRecordBackwards<Record_>(
      testFilePath,
      (r) => r.id === 1
    );
    expect(result).toEqual(record);
  });

  it("should return null if no records match the criteria", async () => {
    const records = [
      { id: 1, type: "nba" },
      { id: 2, type: "other" },
    ];
    await fs.writeFile(
      testFilePath,
      records.map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf-8"
    );

    const result = await findLastRecordBackwards<Record_>(
      testFilePath,
      (r) => r.id === 3
    );
    expect(result).toBeNull();
  });

  it("should find the last record that matches the criteria", async () => {
    const records = [
      { id: 1, type: "nba", value: "first" },
      { id: 2, type: "nba", value: "second" },
      { id: 3, type: "other", value: "third" },
    ];
    await fs.writeFile(
      testFilePath,
      records.map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf-8"
    );

    const result = await findLastRecordBackwards<Record_>(
      testFilePath,
      (r) => r.type === "nba"
    );
    expect(result).toEqual(records[1]); // should return the last matching record (id: 2)
  });

  it("should ignore invalid JSON lines", async () => {
    const content = `{"id": 1, "type": "nba"}\n{invalid_json}\n{"id": 3, "type": "nba"}\n`;
    await fs.writeFile(testFilePath, content, "utf-8");

    const result = await findLastRecordBackwards<Record_>(
      testFilePath,
      (r) => r.id === 1
    );
    expect(result).toEqual({ id: 1, type: "nba" });
  });

  it("should handle large files and parse backwards across multiple chunks", async () => {
    // Write 2000 lines of ~100 bytes each to exceed typical 64KB chunk boundary
    const records: Record_[] = [];
    for (let i = 1; i <= 2000; i++) {
      records.push({
        id: i,
        type: i % 10 === 0 ? "special" : "nba",
        payload: "x".repeat(80),
      });
    }

    await fs.writeFile(
      testFilePath,
      records.map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf-8"
    );

    // Find the last record with id 1501
    const result = await findLastRecordBackwards<Record_>(
      testFilePath,
      (r) => r.id === 1501
    );
    expect(result?.id).toBe(1501);
    expect(result?.type).toBe("nba");

    // Find the last special record (should be id 2000)
    const specialResult = await findLastRecordBackwards<Record_>(
      testFilePath,
      (r) => r.type === "special"
    );
    expect(specialResult?.id).toBe(2000);
  });
});
