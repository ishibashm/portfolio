
import sys
import json
import urllib.request
import re
from youtube_transcript_api import YouTubeTranscriptApi

video_id = "dQw4w9WgXcQ"
try:
    html = urllib.request.urlopen("https://www.youtube.com/watch?v=" + video_id).read().decode('utf-8')
    title_match = re.search(r'<title>(.*?)</title>', html)
    title = title_match.group(1).replace(" - YouTube", "") if title_match else "YouTube Video"

    transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['ja', 'en'])
    text = " ".join([t['text'] for t in transcript_list])
    
    content = f"### {title}\n\n**Video ID:** {video_id}\n**URL:** https://www.youtube.com/watch?v={video_id}\n\n---\n\n{text}"
    print(json.dumps({"title": title, "content": content}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
