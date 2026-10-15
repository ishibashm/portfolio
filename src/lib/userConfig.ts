import prisma from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

/** サイトの検証済みセッション。メール確認は旧NULL行の連携だけに使う。 */
export interface AuthUser {
  id: string;
  email: string;
  emailVerified?: boolean;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email || !user.id) return null;
  return {
    id: user.id,
    email: user.email.toLowerCase(),
    // user_metadata は本人が変更できるので確認の根拠にしない。
    emailVerified: Boolean(user.email_confirmed_at),
  };
}

/** 新規行に入れてよい user_id。開発バイパスの偽 id なら null。 */
export function toUserId(user: AuthUser): string | null {
  return UUID_RE.test(user.id) ? user.id : null;
}

/**
 * 本人IDを先に照合する。旧行の救済は確認済みメールかつNULL所有者だけ。
 * MCPの読取から呼ばない。サイトでの通常ログイン・保存時だけ連携する。
 * user_id / user_email の既存unique制約と条件付き更新で競合時は閉じる。
 */
export async function findUserConfig(user: AuthUser) {
  const usableId = toUserId(user);
  if (!usableId) return null;

  const existing = await prisma.user_configs.findFirst({
    where: { user_id: usableId },
  });
  if (existing) return existing;
  if (user.emailVerified !== true) return null;

  const email = user.email.toLowerCase();
  const legacy = await prisma.user_configs.findFirst({
    where: { user_id: null, user_email: email },
    select: { id: true },
  });
  if (!legacy) return null;

  // 読取後に別のログインが連携していても、非NULLの所有者を上書きしない。
  // 同じsubjectで別行が同時作成された場合はDBのunique制約で拒否する。
  const linked = await prisma.user_configs.updateMany({
    where: { id: legacy.id, user_id: null, user_email: email },
    data: { user_id: usableId },
  });
  if (linked.count !== 1) throw new Error("PROFILE_LINK_CONFLICT");

  // 連携前のJSONは返さず、連携後も所有者条件を付けて読み直す。
  return prisma.user_configs.findFirst({
    where: { id: legacy.id, user_id: usableId },
  });
}
