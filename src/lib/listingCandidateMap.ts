import type { EmailListing } from "./listingDetails";
import { isInJapan } from "./japanBounds";

export const LISTING_MAP_ADDRESS_CAP = 10;
export const listingAddressKey = (address: string) =>
  address.normalize("NFKC").trim().replace(/\s+/g, " ");
/**
 * `municipality` があるものは番地までの位置ではなく、その市区町村の
 * 代表点（lib/municipalityFromAddress。外へ送らずに手元の表で引いたもの）。
 */
export type ListingMapPoint = {
  lat: number;
  lon: number;
  municipality?: string;
};
export type ListingMapResult = {
  address: string;
  point?: ListingMapPoint;
};
export type MappedListing = { listing: EmailListing; point: ListingMapPoint };

/** メールの推測値はメモリ内だけ。上限超過や未回答も位置未確定に残す。 */
export function groupListingMap(
  listings: EmailListing[],
  results: ListingMapResult[],
) {
  const byAddress = new Map(
    results.map((r) => [listingAddressKey(r.address), r.point]),
  );
  const mapped: MappedListing[] = [];
  const noAddress: EmailListing[] = [];
  const unresolved: EmailListing[] = [];
  for (const listing of listings) {
    const address = listingAddressKey(listing.address ?? "");
    if (!address) {
      noAddress.push(listing);
      continue;
    }
    const point = byAddress.get(address);
    if (point && isInJapan(point.lat, point.lon))
      mapped.push({ listing, point });
    else unresolved.push(listing);
  }
  return { mapped, noAddress, unresolved };
}
