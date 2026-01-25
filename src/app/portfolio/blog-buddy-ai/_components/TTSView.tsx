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
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)({ sampleRate: 24000 });
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
      setText(blogState.content.substring(0, 300) + "...");
    } else {
      setText("Please enter some text or paste a blog post to read aloud.");
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto custom-scrollbar">
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
        <p className="text-slate-600">
          Convert the blog text into lifelike speech using Gemini's advanced
          TTS.
        </p>
      </div>

      <div className="flex-1 flex flex-col relative group">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 w-full p-6 bg-white/50 backdrop-blur-sm border border-white/40 rounded-2xl focus:ring-2 focus:ring-pink-500/50 focus:outline-none resize-none shadow-sm text-lg text-slate-700 placeholder-slate-400 transition-all custom-scrollbar"
          placeholder="Enter text here or use the button to paste from context..."
        />
        <button
          onClick={handlePreFill}
          className="absolute top-4 right-4 text-xs bg-white/70 hover:bg-white text-slate-600 px-3 py-1.5 rounded-lg border border-white/50 shadow-sm transition-all backdrop-blur-md"
        >
          Paste from Blog
        </button>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !text}
        className="w-full py-4 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-semibold shadow-lg shadow-pink-600/20 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 backdrop-blur-sm"
      >
        {loading ? (
          <span className="animate-pulse flex items-center gap-2">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Generating Audio...
          </span>
        ) : isPlaying ? (
          <>
            <div className="flex gap-1 h-4 items-end">
              <div className="w-1 bg-white animate-[bounce_1s_infinite] h-2"></div>
              <div className="w-1 bg-white animate-[bounce_1.2s_infinite] h-4"></div>
              <div className="w-1 bg-white animate-[bounce_0.8s_infinite] h-3"></div>
            </div>
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
