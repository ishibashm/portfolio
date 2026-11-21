"use client";

/**
 * サイト全体に出す、歩き回る案内役しるべ。
 *
 * - レイアウト（src/app/layout.tsx）から 1 回だけ置く。
 * - 管理・ログイン・API 系の画面には出さない。
 * - 本体は表示に必須ではないので、最初の描画のあとで読み込む（ssr: false）。
 */

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const ShirubeWanderer = dynamic(
  () => import("@/components/guide/ShirubeWanderer"),
  { ssr: false },
);

/** しるべを出さない画面（前方一致） */
export const SHIRUBE_EXCLUDED_PREFIXES = [
  "/admin",
  "/auth",
  "/login",
  "/mcp",
  "/api",
] as const;

export function isShirubeExcluded(pathname: string | null): boolean {
  if (!pathname) return false;
  return SHIRUBE_EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function SiteShirube() {
  const pathname = usePathname();
  if (isShirubeExcluded(pathname)) return null;
  return <ShirubeWanderer />;
}

export default SiteShirube;
