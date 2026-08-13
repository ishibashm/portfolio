import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { findUserConfig, getAuthUser, toUserId } from "@/lib/userConfig";
import { toResponseMessage } from "@/lib/errorMessage";

/**
 * ログイン中の利用者ごとの設定（生年月日・出発地・基準値）。
 *
 * 設計の前提を 2 つ変えている。
 *
 * 1. 単一オーナー前提をやめた。以前は ADMIN_EMAIL の 1 行だけを読み書きし、
 *    それ以外は 401 にしていた。中核ページを匿名に開放して利用者を増やす以上、
 *    設定は利用者ごとに持てないと「別の端末で開くと消える」から抜け出せない。
 *    行は user_id で分かれるので、他人の行に触れることはない。
 *
 * 2. サーバー上の共有 JSON ファイルをやめた。書き込み先が全利用者で 1 つしかなく、
 *    複数利用者では他人の値が混ざる。サーバーレスでは永続もしないため、
 *    「送っていない項目はファイルから補完される」という前提自体が成り立たず、
 *    実際には送っていない列が null で潰れていた（DB の baseline_* が全て null）。
 *
 * 保存は PATCH 相当。body に含まれるキーだけを更新し、含まれないキーは触らない。
 */

/** DB の列名 → 受け取り方。ここに無いキーは無視する。 */
const NUMERIC_FIELDS = [
  "birth_lat",
  "birth_lon",
  "base_lat",
  "base_lon",
  "baseline_hrv_mean",
  "baseline_hrv_std",
  "baseline_gsr_mean",
  "baseline_gsr_std",
] as const;

function buildPatch(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};

  if ("birth_date" in body) {
    const v = body.birth_date;
    data.birth_date = typeof v === "string" && v !== "" ? v : null;
  }

  for (const key of NUMERIC_FIELDS) {
    if (!(key in body)) continue;
    const v = body[key];
    // 空文字や NaN を数値として書くと 0 になり、未設定と区別できなくなる。
    if (v === null || v === "" || v === undefined) {
      data[key] = null;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    data[key] = n;
  }

  if ("base_sync_timestamp" in body) {
    const v = body.base_sync_timestamp;
    const d = v ? new Date(v as string) : null;
    data.base_sync_timestamp = d && !isNaN(d.getTime()) ? d : null;
  }

  return data;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const row = await findUserConfig(user);
    if (!row) return NextResponse.json({});

    return NextResponse.json({
      birth_date: row.birth_date,
      birth_lat: row.birth_lat,
      birth_lon: row.birth_lon,
      base_lat: row.base_lat,
      base_lon: row.base_lon,
      baseline_hrv_mean: row.baseline_hrv_mean,
      baseline_hrv_std: row.baseline_hrv_std,
      baseline_gsr_mean: row.baseline_gsr_mean,
      baseline_gsr_std: row.baseline_gsr_std,
      base_sync_timestamp: row.base_sync_timestamp
        ? row.base_sync_timestamp.toISOString()
        : null,
      // 端末側の控えとどちらが新しいかを判定するために返す。
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    });
  } catch (error) {
    console.error("User config fetch failed:", error);
    return NextResponse.json(
      { error: "Config is temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const data = buildPatch(body as Record<string, unknown>);
    const updatedAt = new Date();

    const existing = await findUserConfig(user);
    if (existing) {
      await prisma.user_configs.update({
        where: { id: existing.id },
        data: { ...data, updated_at: updatedAt },
      });
    } else {
      await prisma.user_configs.create({
        data: {
          user_id: toUserId(user),
          user_email: user.email,
          ...data,
          // 行の作成＝はじめての保存。登録日として管理ページが数える。
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      });
    }

    return NextResponse.json({
      success: true,
      updated_at: updatedAt.toISOString(),
    });
  } catch (error) {
    // 原因を追うための値は console 側にそのまま残す。応答は文言だけ。
    console.error("Config Save Error:", error);
    return NextResponse.json(
      { error: toResponseMessage(error, "Failed to save config") },
      { status: 500 },
    );
  }
}
