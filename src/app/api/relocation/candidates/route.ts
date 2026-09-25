import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { candidateCreateSchema } from "@/lib/listingCandidateInput";
import { computeDayKigaku } from "@/lib/dayKigakuClient";
import { evaluateSpot } from "@/lib/spotEvaluation";
import {
  candidateBody,
  candidateFailure,
  candidateJson,
  candidateRate,
  candidateSelect,
  candidateUser,
  CandidateError,
  lockCandidateOwner,
} from "@/lib/listingCandidateApi";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await candidateUser(req, true);
    await candidateRate(`write:${userId}`, 20);
    const parsed = candidateCreateSchema.safeParse(await candidateBody(req));
    if (!parsed.success)
      throw new CandidateError(
        400,
        "INVALID_INPUT",
        "所在地・日付・生年月日・URLと設定を確認してください。",
      );
    const p = parsed.data;
    if (p.target.source === "municipality")
      throw new CandidateError(
        422,
        "POSITION_REQUIRED",
        "街の代表点では保存できません。住所または地図ピンで所在地を指定してください。",
      );
    if (
      ["gsi", "normalize", "nominatim"].includes(p.target.source) &&
      !p.target.approximate
    )
      throw new CandidateError(
        422,
        "APPROXIMATE_REQUIRED",
        "住所検索の位置は概略として地図で確認してください。",
      );
    const result = evaluateSpot(
      Number(p.context.baseLat),
      Number(p.context.baseLon),
      p.target.lat,
      p.target.lon,
      p.context.useClassical,
      computeDayKigaku(p.context)?.byDirection,
    );
    if (!result)
      throw new CandidateError(
        422,
        "SAME_POINT",
        "出発地と同一点のため、方位は未定義です。",
      );
    if (!result.cell)
      throw new CandidateError(
        409,
        "CONTEXT_REQUIRED",
        "判定に必要な条件が揃っていません。",
      );
    // Digest is salted per request. Never retain birth date or email body.
    const requestDigest = createHash("sha256")
      .update(userId + JSON.stringify(p))
      .digest("hex");
    const { birthDate: omittedBirthDate, ...context } = p.context;
    void omittedBirthDate;
    const outcome = await prisma.$transaction(async (tx) => {
      await lockCandidateOwner(tx, userId);
      const existing = await tx.listingCandidate.findUnique({
        where: { userId_requestKey: { userId, requestKey: p.requestKey } },
        select: { ...candidateSelect, requestDigest: true },
      });
      if (existing) {
        if (existing.requestDigest !== requestDigest)
          throw new CandidateError(
            409,
            "REQUEST_KEY_CONFLICT",
            "同じ送信キーで内容が変わっています。新しい保存として操作してください。",
          );
        const { requestDigest: omitted, ...candidate } = existing;
        void omitted;
        return { candidate, created: false };
      }
      if ((await tx.listingCandidate.count({ where: { userId } })) >= 500)
        throw new CandidateError(
          429,
          "CANDIDATE_LIMIT",
          "候補は500件までです。不要な履歴を削除してください。",
        );
      const now = new Date().toISOString();
      const candidate = await tx.listingCandidate.create({
        data: {
          ...p.details,
          userId,
          requestKey: p.requestKey,
          requestDigest,
          url: p.url ?? null,
          title: p.title || null,
          memo: p.memo || null,
          lat: p.target.lat,
          lon: p.target.lon,
          bearingDeg: result.bearingDeg,
          direction: result.direction,
          judgment: {
            schemaVersion: 1,
            engineVersion: "dayKigaku-v1",
            evaluatedAt: now,
            context,
            bearingDeg: result.bearingDeg,
            direction: result.direction,
            distanceKm: result.distanceKm,
            tier: result.cell!.tier,
            blocked: result.cell!.blocked,
            doyouSatsu: result.cell!.doyouSatsu ?? false,
            source: p.target.source,
            approximate: p.target.approximate,
            confirmedAt: now,
          },
        },
        select: candidateSelect,
      });
      return { candidate, created: true };
    });
    return candidateJson(
      { candidate: outcome.candidate },
      outcome.created ? 201 : 200,
    );
  } catch (e) {
    return candidateFailure(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await candidateUser(req);
    await candidateRate(`read:${userId}`, 60);
    const params = req.nextUrl.searchParams;
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .safeParse(params.get("limit") ?? 20);
    if (!limit.success)
      throw new CandidateError(
        400,
        "INVALID_LIMIT",
        "件数を確認してください。",
      );
    const cursor = params.get("cursor");
    let after: { id: string; createdAt: Date } | undefined;
    if (cursor) {
      const id = z
        .uuid()
        .safeParse(Buffer.from(cursor, "base64url").toString());
      if (!id.success)
        throw new CandidateError(
          400,
          "INVALID_CURSOR",
          "一覧を読み直してください。",
        );
      after =
        (await prisma.listingCandidate.findFirst({
          where: { id: id.data, userId },
          select: { id: true, createdAt: true },
        })) ?? undefined;
      if (!after)
        throw new CandidateError(
          400,
          "INVALID_CURSOR",
          "一覧を読み直してください。",
        );
    }
    const rows = await prisma.listingCandidate.findMany({
      where: {
        userId,
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit.data + 1,
      select: candidateSelect,
    });
    const more = rows.length > limit.data;
    const candidates = rows.slice(0, limit.data);
    return candidateJson({
      candidates,
      cursor: more
        ? Buffer.from(candidates[candidates.length - 1].id).toString(
            "base64url",
          )
        : null,
    });
  } catch (e) {
    return candidateFailure(e);
  }
}
