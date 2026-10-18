import type { Metadata } from "next";
import Link from "next/link";
import { pageOpenGraph } from "@/lib/siteUrl";
import CityPanel from "@/components/city3d/CityPanel";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";
const title = "住所から街の立体と方位を見る";
const description =
  "住所を中心に街の建物と九星気学の方位を重ね、真北・磁北と二十四山の目盛りを確かめます。";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/houi/3d" },
  robots: { index: false, follow: true },
  openGraph: pageOpenGraph("/houi/3d", title, description),
};
export default function Page() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900">
      <article className="mx-auto max-w-[1700px] px-5 py-12">
        <Link href="/houi" className="text-sm text-slate-600 underline">
          本命星と吉方位の早見表へ
        </Link>
        <h1 className="mt-5 font-serif text-2xl font-bold sm:text-3xl">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed">
          気になる地点から、街の形と方位の関係を見渡せます。方位は四正30度・四隅60度の伝統区分で表示します。
        </p>
        <ActiveProfileBadge purpose="街の方位" className="mt-6" />
        <CityPanel />
      </article>
    </main>
  );
}
