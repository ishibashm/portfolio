import { notFound } from "next/navigation";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { prefNameByCode } from "@/lib/prefContent";
import { OG_HEIGHT, OG_WIDTH, ogImage } from "@/lib/og/card";

export const alt = "都道府県の家賃相場と方位";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const pref = prefNameByCode(code);
  if (!pref || !PREF_EDITORIAL[code]) notFound();
  return ogImage({
    eyebrow: "家賃相場と方位",
    title: `${pref}の家賃相場と方位別の市区町村`,
  });
}
