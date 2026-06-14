import sys  
import json  
from youtube_transcript_api import YouTubeTranscriptApi  
transcript_list = YouTubeTranscriptApi.list_transcripts('dQw4w9WgXcQ')  
print(transcript_list)  
