import React, { useState, useRef } from "react";
import {
  generateSpeech,
  decode,
  decodeAudioData,
} from "../_services/geminiService";
import { BlogContextState } from "../_types";

interface TTSViewProps {
  blogState: BlogContextState;
}

const TTSView: React.FC<TTSViewProps> = ({ blogState }) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setLoading(true);

    try {
      const base64Audio = await generateSpeech(text);

      // Play audio
      if (!audioContextRef.current) {
        audioContextRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;

      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        ctx,
        24000,
        1,
      );

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
      setIsPlaying(true);

      source.onended = () => setIsPlaying(false);
    } catch (e) {
      console.error(e);
      alert("Failed to generate speech");
    } finally {
      setLoading(false);
    }
  };

  const handlePreFill = () => {
    if (blogState.content) {
      // Take the first 300 characters approx for a quick demo
      setText(blogState.content.substring(0, 300) + "...");
    } else {
      setText("Please enter some text or paste a blog post to read aloud.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-pink-500"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          Text-to-Speech
        </h2>
        <p className="text-slate-500">
          Convert the blog text into lifelike speech.
        </p>
      </div>

      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full h-48 p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-pink-500 focus:outline-none resize-none shadow-sm text-lg"
          placeholder="Enter text here..."
        />
        <button
          onClick={handlePreFill}
          className="absolute top-4 right-4 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-slate-200"
        >
          Paste from Blog
        </button>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !text}
        className="w-full py-4 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-semibold shadow-lg transition-transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
      >
        {loading ? (
          <span className="animate-pulse">Generating Audio...</span>
        ) : isPlaying ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-pulse"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            Playing...
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            Generate Speech
          </>
        )}
      </button>
    </div>
  );
};

export default TTSView;
