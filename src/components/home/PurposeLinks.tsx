import Link from "next/link";

export function PurposeLinks() {
  return (
    <section className="w-full max-w-[1700px] rounded-3xl border border-theme-border bg-theme-surface dark:bg-theme-surface p-6">
      <h2 className="text-xl font-serif font-bold">調べたいことを選ぶ</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["今日の吉方位", "/houi/today"],
          ["引越しの方位", "/relocation/dashboard"],
          ["天中殺", "/houi/tenchusatsu"],
          ["年の吉方位", "/houi"],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="rounded-xl border border-theme-border px-4 py-3 text-sm hover:bg-theme-accent-soft"
          >
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
