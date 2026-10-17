import { VideoJsonLd } from "@/components/JsonLd";
import { isValidYouTubeId } from "@/lib/blogVideo";
import { YouTubeFacade } from "./YouTubeFacade";

export interface BlogVideoProps {
  youtubeId?: string;
  title: string;
  description: string;
  cover: string;
  uploadDate?: string;
  duration?: string;
}

export function BlogVideo(props: BlogVideoProps) {
  if (!isValidYouTubeId(props.youtubeId)) return null;
  return (
    <>
      <YouTubeFacade {...props} />
      <VideoJsonLd {...props} />
    </>
  );
}
