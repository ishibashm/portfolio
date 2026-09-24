import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { candidateTextSchema } from "@/lib/listingCandidateInput";
import {
  candidateBody,
  candidateFailure,
  candidateJson,
  candidateRate,
  candidateSelect,
  candidateUser,
  CandidateError,
  privateHeaders,
} from "@/lib/listingCandidateApi";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const missing = () =>
  new CandidateError(404, "NOT_FOUND", "候補が見つかりません。");
async function owner(req: NextRequest, args: Params, write: boolean) {
  const userId = await candidateUser(req, write);
  await candidateRate(`${write ? "write" : "read"}:${userId}`, write ? 20 : 60);
  const id = z.uuid().safeParse((await args.params).id);
  if (!id.success) throw missing();
  return { id: id.data, userId };
}
export async function GET(req: NextRequest, args: Params) {
  try {
    const where = await owner(req, args, false);
    const candidate = await prisma.listingCandidate.findFirst({
      where,
      select: candidateSelect,
    });
    if (!candidate) throw missing();
    return candidateJson({ candidate });
  } catch (e) {
    return candidateFailure(e);
  }
}
export async function PATCH(req: NextRequest, args: Params) {
  try {
    const where = await owner(req, args, true);
    const parsed = candidateTextSchema
      .extend({ updatedAt: z.iso.datetime() })
      .strict()
      .safeParse(await candidateBody(req));
    if (!parsed.success)
      throw new CandidateError(
        400,
        "INVALID_INPUT",
        "タイトル・メモを確認してください。",
      );
    const { updatedAt, ...data } = parsed.data;
    const candidate = await prisma.$transaction(async (tx) => {
      if (
        !(await tx.listingCandidate.findFirst({ where, select: { id: true } }))
      )
        throw missing();
      const result = await tx.listingCandidate.updateMany({
        where: { ...where, updatedAt: new Date(updatedAt) },
        data: {
          ...data,
          updatedAt: new Date(
            Math.max(Date.now(), new Date(updatedAt).getTime() + 1),
          ),
        },
      });
      if (!result.count)
        throw new CandidateError(
          409,
          "UPDATE_CONFLICT",
          "別の操作で更新されています。一覧を読み直してください。",
        );
      return tx.listingCandidate.findFirst({ where, select: candidateSelect });
    });
    return candidateJson({ candidate });
  } catch (e) {
    return candidateFailure(e);
  }
}
export async function DELETE(req: NextRequest, args: Params) {
  try {
    const where = await owner(req, args, true);
    if (!(await prisma.listingCandidate.deleteMany({ where })).count)
      throw missing();
    return new NextResponse(null, { status: 204, headers: privateHeaders });
  } catch (e) {
    return candidateFailure(e);
  }
}
