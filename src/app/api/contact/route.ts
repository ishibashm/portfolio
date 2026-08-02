import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * お問い合わせの受け口。
 *
 * 運営者の個人メールアドレスをサイトに書かずに連絡手段を用意するために置く。
 * 匿名で誰でも投稿できるので、保存する内容は最小限に絞り、
 * 長さの上限と簡単なボット除けだけ入れている。
 */

const MAX = { name: 100, email: 200, body: 4000 };

export async function POST(request: Request) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません。" },
      { status: 400 },
    );
  }

  // 画面上は隠しているフィールド。人間は触れないので、
  // 値が入っていれば自動投稿とみなす。
  if (typeof payload?.website === "string" && payload.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const name = String(payload?.name ?? "").trim();
  const email = String(payload?.email ?? "").trim();
  const body = String(payload?.body ?? "").trim();

  if (!name || !email || !body) {
    return NextResponse.json(
      { error: "お名前・メールアドレス・お問い合わせ内容を入力してください。" },
      { status: 400 },
    );
  }
  if (
    name.length > MAX.name ||
    email.length > MAX.email ||
    body.length > MAX.body
  ) {
    return NextResponse.json(
      { error: "入力が長すぎます。" },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "メールアドレスの形式が正しくありません。" },
      { status: 400 },
    );
  }

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
  } catch (e) {
    console.error("Failed to store contact message:", e);
    return NextResponse.json(
      { error: "送信に失敗しました。時間をおいてお試しください。" },
      { status: 500 },
    );
  }
}
