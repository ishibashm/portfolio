import { isValidYouTubeId } from "@/lib/blogVideo";
import { HOUI_SUMAI_CHANNEL } from "@/lib/siteChannels";

export function YouTubeFacade({
  youtubeId,
  title,
}: {
  youtubeId?: string;
  title: string;
}) {
  if (!isValidYouTubeId(youtubeId)) return null;

  return (
    <figure className="my-6">
      <div
        className="relative w-full overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        {/*
          再生ボタンを押すまで iframe が無いと、Search Console は動画を
          見つけられない。最初の HTML に埋め込み、読み込みは lazy にする。
        */}
        <iframe
          className="absolute inset-0 h-full w-full border-0"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <figcaption className="mt-2 text-sm text-slate-600 dark:text-ink-muted">
        ナレーション：VOICEVOX:玄野武宏
      </figcaption>
      <p className="mt-2 text-sm text-slate-700 dark:text-ink">
        <a
          href={HOUI_SUMAI_CHANNEL.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-accent underline decoration-accent underline-offset-4 hover:text-accent"
        >
          {`${HOUI_SUMAI_CHANNEL.name}で他の動画を見る`}
        </a>
        <span aria-hidden="true"> · </span>
        <a
          href={`${HOUI_SUMAI_CHANNEL.url}?sub_confirmation=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-accent underline decoration-accent underline-offset-4 hover:text-accent"
        >
          チャンネル登録
        </a>
      </p>
    </figure>
  );
}
