import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.targetDate) {
      return NextResponse.json(
        { error: "targetDate is required" },
        { status: 400 },
      );
    }

    // ローカルファイル保存用のデータ構造を作成
    const logEntry = {
      id: crypto.randomUUID(),
      userId: body.userId || null,
      targetDate: new Date(body.targetDate).toISOString(),
      environmentalBazi: body.environmentalBazi || null,
      personalBazi: body.personalBazi || null,
      physicalLayers: body.physicalLayers || null,
      classicalLayers: body.classicalLayers || null,
      physicalIndependentLayers: body.physicalIndependentLayers || null,
      physicalCoupledLayers: body.physicalCoupledLayers || null,
      ansLoad: body.ansLoad || null,
      kpIndex: body.kpIndex || null,
      metadata: body.metadata || null,
      createdAt: new Date().toISOString(),
    };

    // プロジェクトのルートディレクトリにある 'data' フォルダのパス
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // JSONL（1行1JSON）形式で追記保存する
    const filePath = path.join(dataDir, "metaphysical_logs.jsonl");
    fs.appendFileSync(filePath, JSON.stringify(logEntry) + "\n", "utf8");

    return NextResponse.json({
      success: true,
      log: logEntry,
      message: "Saved to local JSONL",
    });
  } catch (error: any) {
    console.error("Failed to save metaphysical log locally:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
