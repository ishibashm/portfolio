import React, { useEffect, useRef, useState, useCallback } from "react";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { BlogContextState } from "../_types";
import { decode, decodeAudioData } from "../_services/geminiService";

interface LiveViewProps {
  blogState: BlogContextState;
}

const LiveView: React.FC<LiveViewProps> = ({ blogState }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");

  // Refs for audio processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Helper: Create Blob for input audio
  const createBlob = (data: Float32Array) => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }

    // Manual helper to encode bytes to base64 string
    const encode = (bytes: Uint8Array) => {
      let binary = "";
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    };

    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: "audio/pcm;rate=16000",
    };
  };

  const stopSession = useCallback(() => {
    // Clean up audio sources
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {}
    });
    sourcesRef.current.clear();

    // Close session
    if (sessionRef.current) {
      // session.close() is not explicitly a method on the promise,
      // usually we just stop sending data and close contexts.
      // The SDK examples use onclose callback mainly.
      // However, we can drop the reference.
      sessionRef.current = null;
    }

    // Stop microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close contexts
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }

    setIsConnected(false);
    setStatus("disconnected");
  }, []);

  const startSession = async () => {
    if (!process.env.API_KEY) {
      alert("API Key missing");
      return;
    }

    try {
      setStatus("connecting");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // Setup Audio Contexts
      inputAudioContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 16000 });
      audioContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 24000 });

      const outputNode = audioContextRef.current.createGain();
      outputNode.connect(audioContextRef.current.destination);

      // Get Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const blogContextPrompt = blogState.content
        ? `You are discussing the following blog post: "${blogState.title}". Content: ${blogState.content.substring(0, 5000)}...`
        : "You are a helpful AI.";

      // Connect to Live API
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        callbacks: {
          onopen: () => {
            console.log("Session opened");
            setIsConnected(true);
            setStatus("connected");

            // Start processing input audio
            if (inputAudioContextRef.current) {
              const source =
                inputAudioContextRef.current.createMediaStreamSource(stream);
              const scriptProcessor =
                inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);

              scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                if (isMuted) return; // Simple mute implementation

                const inputData =
                  audioProcessingEvent.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);

                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };

              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContextRef.current.destination);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;

            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(
                nextStartTimeRef.current,
                ctx.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                ctx,
                24000,
                1,
              );

              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              source.addEventListener("ended", () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              // Clear queue
              sourcesRef.current.forEach((s) => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("Session closed");
            stopSession();
          },
          onerror: (err) => {
            console.error("Session error", err);
            setStatus("error");
            stopSession();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: blogContextPrompt,
        },
      });

      sessionRef.current = sessionPromise;
    } catch (error) {
      console.error("Connection failed:", error);
      setStatus("error");
      stopSession();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-slate-900 text-white relative overflow-hidden">
      {/* Visualizer Background Placeholder */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div
          className={`w-64 h-64 rounded-full bg-indigo-500 blur-3xl transition-all duration-1000 ${isConnected ? "scale-150 animate-pulse" : "scale-100"}`}
        ></div>
        <div
          className={`w-48 h-48 rounded-full bg-purple-500 blur-3xl absolute transition-all duration-1000 ${isConnected ? "scale-125 animate-pulse delay-75" : "scale-90"}`}
        ></div>
      </div>

      <div className="z-10 flex flex-col items-center space-y-8 max-w-md text-center">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Blog Buddy Live</h2>
          <p className="text-slate-400">
            Have a real-time voice conversation about your article.
          </p>
        </div>

        <div
          className={`w-32 h-32 rounded-full border-4 flex items-center justify-center transition-colors duration-300 ${isConnected ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.5)]" : "border-slate-700 bg-slate-800"}`}
        >
          {status === "connecting" ? (
            <svg
              className="animate-spin h-10 w-10 text-indigo-500"
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
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`${isConnected ? "text-indigo-400" : "text-slate-500"}`}
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          )}
        </div>

        <div className="flex gap-4">
          {!isConnected ? (
            <button
              onClick={startSession}
              disabled={status === "connecting"}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-full font-semibold shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "connecting" ? "Connecting..." : "Start Conversation"}
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`px-6 py-3 rounded-full font-medium transition-colors ${isMuted ? "bg-red-500/20 text-red-400 border border-red-500/50" : "bg-slate-800 text-white border border-slate-700 hover:bg-slate-700"}`}
              >
                {isMuted ? "Unmute Mic" : "Mute Mic"}
              </button>
              <button
                onClick={stopSession}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full font-medium shadow-lg transition-transform active:scale-95"
              >
                End Call
              </button>
            </>
          )}
        </div>

        {status === "error" && (
          <p className="text-red-400 text-sm">
            Connection failed. Please check permissions and try again.
          </p>
        )}
      </div>
    </div>
  );
};

export default LiveView;
