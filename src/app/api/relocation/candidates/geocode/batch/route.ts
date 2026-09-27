import { NextRequest } from "next/server";
import { z } from "zod";
import { lookupGsi } from "@/lib/gsiGeocode";
import { isInJapan } from "@/lib/japanBounds";
import { classifyCandidateInput } from "@/lib/listingCandidateInput";
import {
  LISTING_MAP_ADDRESS_CAP,
  listingAddressKey,
  type ListingMapResult,
} from "@/lib/listingCandidateMap";
import {
  candidateBody,
  candidateFailure,
  candidateJson,
  candidateRate,
  candidateUser,
  CandidateError,
} from "@/lib/listingCandidateApi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const userId = await candidateUser(req, true);
    if (process.env.LISTING_CANDIDATE_GSI_ENABLED !== "true")
      throw new CandidateError(
        503,
        "GEOCODE_DISABLED",
        "地図表示は現在無効です（住所ジオコーディングが無効）",
      );
    await candidateRate(`geocode:${userId}`, 10);
    const parsed = z
      .object({ addresses: z.array(z.string().max(256)).max(200) })
      .strict()
      .safeParse(await candidateBody(req));
    if (!parsed.success)
      throw new CandidateError(
        400,
        "INVALID_INPUT",
        "住所の一覧を確認してください。",
      );
    const addresses = [
      ...new Set(parsed.data.addresses.map(listingAddressKey).filter(Boolean)),
    ];
    const results: ListingMapResult[] = addresses
      .slice(0, LISTING_MAP_ADDRESS_CAP)
      .map((address) => ({ address }));
    // 一度の操作を bounded にする。同じ住所は一度だけ、GSI の間隔も空ける。
    // lookupGsi の既存 timeout (15秒) を含め、約45秒以内で打ち切る。
    const deadline = Date.now() + 30000;
    let queried = false;
    for (const result of results) {
      if (req.signal.aborted || Date.now() >= deadline) break;
      const input = classifyCandidateInput(result.address);
      if (input.kind !== "address") continue;
      if (queried) await new Promise((resolve) => setTimeout(resolve, 250));
      if (req.signal.aborted || Date.now() >= deadline) break;
      // 単体検索と同じ provider 枠。住所を rate key・ログ・DB に入れない。
      await candidateRate("provider:gsi:candidates", 30);
      queried = true;
      const found = await lookupGsi(input.address);
      if (found.kind === "ok" && isInJapan(found.point.lat, found.point.lon))
        result.point = found.point;
    }
    return candidateJson({
      results,
      approximate: true,
      truncated: addresses.length > LISTING_MAP_ADDRESS_CAP,
    });
  } catch (error) {
    return candidateFailure(error);
  }
}
