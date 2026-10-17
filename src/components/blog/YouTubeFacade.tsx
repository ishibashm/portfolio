"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { isValidYouTubeId } from "@/lib/blogVideo";

export function YouTubeFacade({
  youtubeId,
  title,
  cover,
}: {
  youtubeId?: string;
  title: string;
  cover: string;
}) {
  const [playingId, setPlayingId] = useState<string>();
  if (!isValidYouTubeId(youtubeId)) return null;

  return (
    <figure className="my-6">
      <div
        className="relative w-full overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        {playingId === youtubeId ? (
          <iframe
            className="absolute inset-0 h-full w-full border-0"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-rose-500"
            aria-label={`動画を再生: ${title}`}
            onClick={() => setPlayingId(youtubeId)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              width={1800}
              height={945}
              className="h-full w-full object-contain"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <Play
                aria-hidden="true"
                className="h-16 w-16 rounded-full bg-black/80 p-4 text-white"
                fill="currentColor"
              />
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-2 text-sm text-slate-600">
        ナレーション：VOICEVOX:玄野武宏
      </figcaption>
    </figure>
  );
}
