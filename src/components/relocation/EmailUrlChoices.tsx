"use client";
import { listingDetailLabels, type EmailListing } from "@/lib/listingDetails";
export function EmailUrlChoices({
  urls,
  onSelect,
  listings = [],
}: {
  urls: string[];
  listings?: EmailListing[];
  onSelect: (url: string) => void;
}) {
  return (
    <ul>
      {urls.map((url) => (
        <li key={url} className="break-all">
          <dl>
            {Object.entries(listingDetailLabels).map(([key, label]) => {
              const item = listings.find((l) => l.url === url);
              const value = item?.[key as keyof typeof listingDetailLabels];
              return value == null ? null : (
                <div key={key}>
                  <dt className="inline">{label}: </dt>
                  <dd className="inline">{value}</dd>
                </div>
              );
            })}
          </dl>
          <button
            type="button"
            className="text-left underline"
            onClick={() => onSelect(url)}
          >
            {url} を既存入力へ
          </button>
        </li>
      ))}
    </ul>
  );
}
