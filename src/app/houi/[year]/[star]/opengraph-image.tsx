import { notFound } from "next/navigation";
import { STAR_NAMES, STARS, contentYears } from "@/lib/kigakuContent";
import { OG_HEIGHT, OG_WIDTH, ogImage } from "@/lib/og/card";

export const alt = "本命星の吉方位・凶方位";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function Image({
  params,
}: {
  params: Promise<{ year: string; star: string }>;
}) {
  const { year: yearParam, star: starParam } = await params;
  const year = parseInt(yearParam, 10);
  const star = parseInt(starParam, 10);
  if (!contentYears().includes(year) || !STARS.includes(star)) notFound();
  const name = STAR_NAMES[star];
  if (!name) notFound();
  return ogImage({
    eyebrow: "本命星",
    title: `${year}年 ${name}の吉方位・凶方位`,
  });
}
