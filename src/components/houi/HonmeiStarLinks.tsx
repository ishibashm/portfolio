import Link from "next/link";
import { currentYearInJapan, STAR_NAMES, STARS } from "@/lib/kigakuContent";

export function HonmeiStarLinks({
  year = currentYearInJapan(),
}: {
  year?: number;
}) {
  return (
    <nav
      aria-label={`${year}年の本命星別吉方位`}
      className="w-full max-w-[1700px] my-6"
    >
      <h2 className="font-bold">本命星を選んで{year}年の吉方位を見る</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {STARS.map((star) => (
          <Link
            key={star}
            prefetch={false}
            href={`/houi/${year}/${star}`}
            className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm hover:bg-rose-50"
          >
            {STAR_NAMES[star]}
          </Link>
        ))}
      </div>
    </nav>
  );
}
