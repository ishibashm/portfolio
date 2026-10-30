import { NextResponse } from "next/server";
import { z } from "zod";
import { readBoundedJson, requestLimiter } from "@/lib/requestSecurity";
import prisma from "@/lib/prisma";

/**
 * お問い合わせの受け口。
 *
 * 運営者の個人メールアドレスをサイトに書かずに連絡手段を用意するために置く。
 * 匿名で誰でも投稿できるので、保存する内容は最小限に絞り、
 * 長さの上限と簡単なボット除けだけ入れている。
 */

const limit = requestLimiter(5, 60);
const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  body: z.string().trim().min(1).max(4000),
  website: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const denied = limit(request.headers);
  if (denied) return denied;
  const input = await readBoundedJson(request, 24_000);
  if (!input.ok) return input.response;
  const parsed = contactSchema.safeParse(input.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力の形式が正しくありません。" }, { status: 400 });
  }
  if (parsed.data.website) return NextResponse.json({ ok: true });
  const { name, email, body } = parsed.data;

  try {
    await prisma.contact_messages.create({
      data: {
        name,
        email,
        body,
        user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("Failed to store contact message");
    return NextResponse.json(
      { error: "送信に失敗しました。時間をおいてお試しください。" },
      { status: 500 },
    );
  }
}
