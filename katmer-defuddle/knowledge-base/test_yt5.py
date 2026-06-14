import sys  
from youtube_transcript_api import YouTubeTranscriptApi  
transcript_list = YouTubeTranscriptApi().list('dQw4w9WgXcQ')  
print(transcript_list)  
