/**
 * 地図に置く物件ピン 1 件ぶん。`/api/rentals/map` の応答。
 *
 * あの route は `select` で列を絞っているので、応答の形はそこで確定して
 * いる。にもかかわらず受け側は SolarTimeClock（useState）・
 * TacticalMagneticMap（prop）・MagneticMapInner（prop と map の引数）と
 * 4 か所すべてが any で、ピンを描くのに必要な列が何かはコメントでしか
 * 伝わっていなかった。
 *
 * null 許容は Prisma のスキーマに合わせている。route 側は
 * `lat: { not: null }` で絞っているが、返り値の型としては null 許容の
 * ままなので、描く側の `prop.lat && prop.lon` の番人は残す。
 */
export interface MapProperty {
  id: string;
  lat: number | null;
  lon: number | null;
  property_name: string;
  rent: number | null;
  address: string | null;
  is_new_build: boolean | null;
  url: string | null;
}
