import { YOUTUBE_CHANNELS } from "@/lib/siteChannels";

/** sameAs と同じ URL。フッターと /about の両方から使う。 */
export function YouTubeChannelLinks({
  className = "",
}: {
  className?: string;
}) {
  return (
    <ul className={`list-none p-0 ${className}`}>
      {YOUTUBE_CHANNELS.map((channel) => (
        <li key={channel.url}>
          <a
            href={channel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:text-rose-600"
          >
            {channel.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
