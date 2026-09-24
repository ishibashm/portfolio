import { NextRequest } from "next/server";
import { z } from "zod";
import { lookupGsi } from "@/lib/gsiGeocode";
import { isInJapan } from "@/lib/japanBounds";
import { classifyCandidateInput } from "@/lib/listingCandidateInput";
import {
  candidateBody,
  candidateFailure,
  candidateJson,
  candidateRate,
  candidateUser,
  CandidateError,
} from "@/lib/listingCandidateApi";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const userId = await candidateUser(req, true);
    await candidateRate(`geocode:${userId}`, 10);
    const p = z
      .object({ address: z.string().max(256) })
      .strict()
      .safeParse(await candidateBody(req));
    const input = p.success ? classifyCandidateInput(p.data.address) : null;
    if (input?.kind !== "address")
      throw new CandidateError(
        400,
        "ADDRESS_REQUIRED",
        "住所だけを入力してください。氏名・電話番号・建物名・部屋番号は除いてください。",
      );
    // Enable only after the operator has verified provider terms and data retention.
    if (process.env.LISTING_CANDIDATE_GSI_ENABLED !== "true")
      throw new CandidateError(
        503,
        "GEOCODE_DISABLED",
        "住所検索は準備中です。地図をクリックするか座標を入力してください。",
      );
    await candidateRate("provider:gsi:candidates", 30);
    const result = await lookupGsi(input.address);
    if (result.kind === "error")
      throw new CandidateError(
        503,
        "GEOCODE_UNAVAILABLE",
        "住所検索と通信できません。地図指定でも続けられます。",
      );
    if (
      result.kind === "not_found" ||
      !isInJapan(result.point.lat, result.point.lon)
    )
      throw new CandidateError(
        422,
        "ADDRESS_NOT_FOUND",
        "住所が見つかりません。住所を修正するか地図で指定してください。",
      );
    return candidateJson({ ...result.point, source: "gsi", approximate: true });
  } catch (e) {
    return candidateFailure(e);
  }
}
