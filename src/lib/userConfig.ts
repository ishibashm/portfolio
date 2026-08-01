import prisma from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

/**
 * user_configs の行を引くための共通処理。
 *
 * 以前は user_email だけで引いていたが、Supabase 側でメールアドレスを変更すると
 * 行が孤児になり保存済みプロフィールが丸ごと見えなくなる。安定キーは user.id。
 *
 * 既存行は user_id が NULL のことがあるため、id で見つからなければ
 * メールアドレスで拾い、その場で user_id を埋めて次回以降 id で引けるようにする。
 */
export interface AuthUser {
  id: string;
  email: string;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email || !user.id) return null;
  return { id: user.id, email: user.email.toLowerCase() };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 行が無ければ null。見つかった行の user_id が空なら埋めてから返す。
 *
 * 開発用バイパス（utils/supabase/server.ts）は id に "dev-bypass-id" を入れる。
 * uuid 列にそのまま渡すと問い合わせ自体が落ちるうえ、書き込めば本物の
 * user_id を偽の値で潰してしまう。UUID でない id は照合にも書き込みにも使わない。
 */
/** 新規行に入れてよい user_id。開発バイパスの偽 id なら null。 */
export function toUserId(user: AuthUser): string | null {
  return UUID_RE.test(user.id) ? user.id : null;
}

export async function findUserConfig(user: AuthUser) {
  const usableId = toUserId(user);

  const existing = await prisma.user_configs.findFirst({
    // user_id の一致を優先したいが、移行前の行は NULL なのでメールでも探す。
    where: usableId
      ? { OR: [{ user_id: usableId }, { user_email: user.email }] }
      : { user_email: user.email },
    orderBy: { user_id: { sort: "desc", nulls: "last" } },
  });

  if (!existing) return null;

  if (usableId && existing.user_id !== usableId) {
    return prisma.user_configs.update({
      where: { id: existing.id },
      data: { user_id: usableId, user_email: user.email },
    });
  }

  return existing;
}
