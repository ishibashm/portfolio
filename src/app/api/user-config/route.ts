import { NextResponse } from "next/server";
import { DIRECTION_FILTER_MODES } from "@/utils/directionFilterMode";
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

/**
 * 設定バーの「表示・判定の好み」を **metaphysical_config（JSONB）に
 * まとめて入れる。**
 *
 * 列を 1 対 1 で足すと、設定が増えるたびに本番 DB への一方向の変更が
 * 要るため 1 本にしてある（20260819_add_user_config_metaphysical.sql）。
 *
 * **target_date は入れない。**「いつの盤を見るか」は端末ごとの一時的な
 * 状態で、別の端末に持ち込むと「昨日の日付で開く」ことになる。
 */
/*
  Prisma の JSON 欄には**省略可能プロパティを持つ型をそのまま渡せない**
  （省略可能は undefined を許すが、InputJsonValue は許さない）。値が
  文字列と真偽値しか無いことを型で示して、入っているキーだけを持つ形にする。
  キャストは使わない（CLAUDE.md 3 節）。
*/
type MetaphysicalConfigJson = Record<string, string | boolean>;

function pickMetaphysical(
  body: Record<string, unknown>,
): MetaphysicalConfigJson {
  const out: MetaphysicalConfigJson = {};

  if (typeof body.use_classical_board === "boolean") {
    out.use_classical_board = body.use_classical_board;
  }
  if (
    body.physical_month_mode === "coupled" ||
    body.physical_month_mode === "independent"
  ) {
    out.physical_month_mode = body.physical_month_mode;
  }
  /* 見方は 3 層の組み合わせなので、名前を並べずに台帳で照合する。
     組み合わせを足すたびにここが取りこぼすのを避ける。 */
  if (
    typeof body.direction_filter_mode === "string" &&
    (DIRECTION_FILTER_MODES as readonly string[]).includes(
      body.direction_filter_mode,
    )
  ) {
    out.direction_filter_mode = body.direction_filter_mode;
  }
  if (
    body.action_intent === "DEFAULT" ||
    body.action_intent === "REST" ||
    body.action_intent === "BUSINESS" ||
    body.action_intent === "MIGRATION"
  ) {
    out.action_intent = body.action_intent;
  }
  // 既定は standard。**"solar" 以外は保存しない**（読む側も既定に倒す）。
  if (
    body.zodiac_time_basis === "standard" ||
    body.zodiac_time_basis === "solar"
  ) {
    out.zodiac_time_basis = body.zodiac_time_basis;
  }

  return out;
}

/**
 * 保存済みの JSON を読む。**同じ検かめを通す**ので、昔の版が入れた
 * 知らない値はここで落ちる。
 */
function readMetaphysical(value: unknown): MetaphysicalConfigJson {
  return value && typeof value === "object" && !Array.isArray(value)
    ? pickMetaphysical(value as Record<string, unknown>)
    : {};
}

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
      /*
        表示・判定の好みは JSONB に入っているが、**平らにして返す。**
        画面側は前から apiData.use_classical_board の形で読んでいる
        （列が無かったので、これまでは常に undefined だった）。
      */
      ...readMetaphysical(row.metaphysical_config),
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
    const incoming = pickMetaphysical(body as Record<string, unknown>);
    const updatedAt = new Date();

    const existing = await findUserConfig(user);
    if (existing) {
      /*
        **丸ごと置き換えない。**送られてきたキーだけを上書きする。
        画面ごとに送る項目が違うので、置き換えると別画面で選んだ設定を
        巻き添えで消す（scalar 側が PATCH 相当なのと同じ理由）。
      */
      const merged = Object.keys(incoming).length
        ? {
            ...readMetaphysical(existing.metaphysical_config),
            ...incoming,
          }
        : undefined;

      await prisma.user_configs.update({
        where: { id: existing.id },
        data: {
          ...data,
          ...(merged ? { metaphysical_config: merged } : {}),
          updated_at: updatedAt,
        },
      });
    } else {
      await prisma.user_configs.create({
        data: {
          user_id: toUserId(user),
          user_email: user.email,
          ...data,
          ...(Object.keys(incoming).length
            ? { metaphysical_config: incoming }
            : {}),
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
