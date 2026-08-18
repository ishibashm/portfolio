import fs from "fs/promises";
import { errorCode } from "@/lib/errorMessage";

/**
 * Reads a JSONL file from the end in chunks, finding the last record
 * that matches the validation function. This prevents loading the entire
 * file into memory.
 *
 * 既定は `unknown`。以前は `any` で、**型を渡さない呼び出しでは
 * `validateFn` の引数も戻り値も検査されなかった。**行の中身は外から来る
 * JSON なので、呼び出す側が「この取り込みで実際に読む枝」を型として渡す
 * （外部 JSON の扱いは CLAUDE.md 4 節。`api/nba` が見本）。
 */
export async function findLastRecordBackwards<T = unknown>(
  filePath: string,
  validateFn: (record: T) => boolean
): Promise<T | null> {
  let fileHandle;
  try {
    fileHandle = await fs.open(filePath, "r");
  } catch (error) {
    // ファイルがまだ無いのは正常。初回実行では履歴が作られていない。
    if (errorCode(error) === "ENOENT") {
      return null;
    }
    throw error;
  }

  try {
    const stat = await fileHandle.stat();
    const fileSize = stat.size;
    if (fileSize === 0) {
      return null;
    }

    const chunkSize = 64 * 1024; // 64KB chunks
    const buffer = Buffer.alloc(chunkSize);
    let currentPosition = fileSize;
    let leftover = "";

    while (currentPosition > 0) {
      const position = Math.max(0, currentPosition - chunkSize);
      const bytesToRead = currentPosition - position;

      const { bytesRead } = await fileHandle.read(
        buffer,
        0,
        bytesToRead,
        position
      );

      currentPosition = position;

      // Decode the read chunk
      const chunkStr = buffer.toString("utf8", 0, bytesRead);
      // Prepend chunk to the previous leftover (reading backwards, leftover is the line prefix)
      const combined = chunkStr + leftover;

      const lines = combined.split("\n");

      // The first element in the split is at the beginning of the combined block.
      // Since it might be cut off at the chunk boundary, we treat it as leftover for the next read backwards.
      // Except if we reached the very beginning of the file (position === 0),
      // in which case the first line is complete.
      if (position > 0) {
        leftover = lines[0];
      } else {
        leftover = "";
      }

      // Process the lines from right to left (newest to oldest)
      const startIndex = position > 0 ? 1 : 0;
      for (let i = lines.length - 1; i >= startIndex; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const parsed = JSON.parse(line);
          if (validateFn(parsed)) {
            return parsed;
          }
        } catch {
          // Ignore invalid JSON lines and proceed
        }
      }
    }

    // If there is any leftover when we reach the beginning of the file, process it
    if (leftover.trim()) {
      try {
        const parsed = JSON.parse(leftover.trim());
        if (validateFn(parsed)) {
          return parsed;
        }
      } catch {
        // Ignore
      }
    }

    return null;
  } finally {
    await fileHandle.close();
  }
}
