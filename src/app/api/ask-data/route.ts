import { askDataExpiry } from "@/lib/retention/askDataExpiry";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  ASK_DATA_LIMITS,
  parseAskWorkspace,
  type AskWorkspace,
} from "@/lib/askData";
import { isSameOrigin } from "@/lib/apiGuard";
import { privateHeaders } from "@/lib/listingCandidateApi";
import prisma from "@/lib/prisma";
import { findUserConfig, getAuthUser, toUserId } from "@/lib/userConfig";

function encodeWorkspace(workspace: AskWorkspace): Prisma.InputJsonObject {
  return {
    version: workspace.version,
    activeConversationId: workspace.activeConversationId,
    updatedAt: workspace.updatedAt,
    conversations: workspace.conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      titleEdited: conversation.titleEdited,
      ...(conversation.guidancePrompted ? { guidancePrompted: true } : {}),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      draft: conversation.draft,
      personIds: conversation.personIds,
    })),
    people: workspace.people.map((person) => ({
      id: person.id,
      name: person.name,
      birthDate: person.birthDate,
      ...(person.birthPlace ? { birthPlace: person.birthPlace } : {}),
      ...(person.residence ? { residence: person.residence } : {}),
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    })),
    memories: workspace.memories.map((memory) => ({
      id: memory.id,
      sourceConversationId: memory.sourceConversationId,
      text: memory.text,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })),
  };
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: privateHeaders },
    );
  try {
    const config = await findUserConfig(user);
    // 読むだけでは期限を延ばさない。開くたびに延びると期限前の知らせが
    // 一度も出ず、書き出しを促す機会が無くなる。延長は保存（POST）で行う。
    const expiry = askDataExpiry(config?.ask_data_last_used_at ?? null);
    if (new URL(request.url).searchParams.get("format") === "export") {
      return NextResponse.json(
        { data: config?.ask_data ?? null, expiry },
        {
          headers: {
            ...privateHeaders,
            "Content-Disposition": 'attachment; filename="ask-data.json"',
          },
        },
      );
    }
    return NextResponse.json(
      { data: parseAskWorkspace(config?.ask_data ?? null), expiry },
      { headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "相談データを読み込めませんでした。" },
      { status: 503, headers: privateHeaders },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "同じサイトから操作してください。" },
      { status: 403, headers: privateHeaders },
    );
  const user = await getAuthUser();
  if (!user)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: privateHeaders },
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json(
      { error: "JSON形式で送信してください。" },
      { status: 400, headers: privateHeaders },
    );
  const declaredSize = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredSize) &&
    declaredSize > ASK_DATA_LIMITS.payloadBytes
  )
    return NextResponse.json(
      { error: "相談データが大きすぎます。" },
      { status: 413, headers: privateHeaders },
    );
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > ASK_DATA_LIMITS.payloadBytes)
      return NextResponse.json(
        { error: "相談データが大きすぎます。" },
        { status: 413, headers: privateHeaders },
      );
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "相談データの形式を確認してください。" },
      { status: 400, headers: privateHeaders },
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("persist" in body) ||
    body.persist !== true
  ) {
    return NextResponse.json(
      {
        error: "会話の保存を選んでください。",
        code: "ASK_DATA_PERSIST_REQUIRED",
      },
      { status: 400, headers: privateHeaders },
    );
  }
  const candidate = "data" in body ? body.data : null;
  const workspace = parseAskWorkspace(candidate);
  if (!workspace)
    return NextResponse.json(
      { error: "相談データの形式を確認してください。" },
      { status: 400, headers: privateHeaders },
    );
  try {
    const askData = encodeWorkspace(workspace);
    const existing = await findUserConfig(user);
    if (existing) {
      await prisma.user_configs.update({
        where: { id: existing.id },
        // user_configs.updated_at は生年月日・場所の競合解決用。AI相談の
        // 下書き保存で進めると、別端末の古い設定を新しいと誤認するため触らない。
        data: { ask_data: askData, ask_data_last_used_at: new Date() },
      });
    } else {
      const now = new Date();
      await prisma.user_configs.create({
        data: {
          user_id: toUserId(user),
          user_email: user.email,
          ask_data: askData,
          ask_data_last_used_at: now,
          created_at: now,
          updated_at: now,
        },
      });
    }
    return NextResponse.json({ success: true }, { headers: privateHeaders });
  } catch {
    return NextResponse.json(
      { error: "相談データを保存できませんでした。" },
      { status: 503, headers: privateHeaders },
    );
  }
}
