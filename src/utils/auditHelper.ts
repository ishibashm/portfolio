import os from "os";
import path from "path";
import fs from "fs";

/**
 * Resolves the path to the audit_reports directory.
 * Falls back to OS temp directory if the project root is read-only (e.g. Docker container).
 */
export function getAuditDir(): string {
  const localDir = path.join(process.cwd(), "audit_reports");

  try {
    // Test writing permissions by ensuring the directory exists
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    } else {
      fs.accessSync(localDir, fs.constants.W_OK);
    }
    return localDir;
  } catch {
    // Fall back to always-writable system temporary directory
    const tempDir = path.join(os.tmpdir(), "audit_reports");
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    } catch (tempErr) {
      console.error("Failed to create temporary audit directory:", tempErr);
    }
    return tempDir;
  }
}
