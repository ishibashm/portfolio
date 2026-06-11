import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET() {
  const accountSet = new Set<string>();

  // 1. Try to get accounts from the database
  try {
    const dbAccounts = await prisma.xPost.findMany({
      select: { authorHandle: true },
      distinct: ["authorHandle"],
    });
    dbAccounts.forEach((a) => accountSet.add(a.authorHandle));
  } catch (error) {
    console.warn(
      "Database connection failed, continuing with local files only:",
      error,
    );
  }

  // 2. Also get accounts from local jsonl files
  try {
    const downloadsDir = path.join(process.cwd(), "x_downloads");
    if (fs.existsSync(downloadsDir)) {
      const files = fs.readdirSync(downloadsDir);
      for (const file of files) {
        const match = file.match(/^x_(.+)_data\.jsonl$/);
        if (match) {
          accountSet.add(match[1]);
        }
      }
    }
  } catch (fsError) {
    console.error("Error reading local accounts:", fsError);
  }

  const uniqueAccounts = Array.from(accountSet).sort();
  return NextResponse.json({ accounts: uniqueAccounts });
}
