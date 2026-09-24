"use client";
export function EmailUrlChoices({
  urls,
  onSelect,
}: {
  urls: string[];
  onSelect: (url: string) => void;
}) {
  return (
    <ul>
      {urls.map((url) => (
        <li key={url} className="break-all">
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
