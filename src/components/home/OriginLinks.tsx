import {
  CITY_ORIGINS,
  arbitrageHref,
  type Origin,
} from "@/lib/todayWeather/origin";

export function OriginLinks({
  origin,
  registered,
  arbitrage = false,
}: {
  origin: Origin;
  registered?: Origin | null;
  arbitrage?: boolean;
}) {
  return (
    <nav aria-label="表示の起点" className="flex flex-wrap gap-2 text-xs">
      {(registered ? [registered, ...CITY_ORIGINS] : CITY_ORIGINS).map(
        (city) => {
          const selected = arbitrage
            ? city.lat === origin.lat && city.lon === origin.lon
            : city.slug === origin.slug;
          return (
            <a
              key={city.slug}
              href={arbitrage ? arbitrageHref(city) : `/?from=${city.slug}`}
              aria-current={selected ? "location" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              {city.slug === "registered" ? `登録地：${city.name}` : city.name}
            </a>
          );
        },
      )}
    </nav>
  );
}
