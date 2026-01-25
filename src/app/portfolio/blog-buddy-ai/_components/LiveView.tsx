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
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      alert("API Key missing");
      return;
    }

    try {
      setStatus("connecting");
      const ai = new GoogleGenAI({
        apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
      });

      // Setup Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 24000 });

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
        model: "gemini-2.0-flash-exp",
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
              message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;

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
    <div className="flex flex-col items-center justify-center h-full p-8 relative overflow-hidden bg-black/80 backdrop-blur-3xl text-white">
      {/* Visualizer Background Placeholder */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-30 pointer-events-none">
        <div
          className={`w-96 h-96 rounded-full bg-indigo-500 blur-[100px] transition-all duration-1000 ${isConnected ? "scale-150 animate-pulse" : "scale-100"}`}
        ></div>
        <div
          className={`w-64 h-64 rounded-full bg-purple-500 blur-[80px] absolute transition-all duration-1000 ${isConnected ? "scale-125 animate-pulse delay-75" : "scale-90"}`}
        ></div>
      </div>

      <div className="z-10 flex flex-col items-center space-y-12 max-w-md text-center">
        <div className="space-y-4">
          <h2 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 to-purple-200">
            Live Conversation
          </h2>
          <p className="text-slate-300/80 text-lg">
            Speak naturally with Bloggy AI about your content.
          </p>
        </div>

        <div
          className={`w-40 h-40 rounded-full border-4 flex items-center justify-center transition-all duration-500 relative ${isConnected ? "border-indigo-400/50 shadow-[0_0_60px_rgba(99,102,241,0.4)]" : "border-white/10 bg-white/5"}`}
        >
          {/* Ripple Effect */}
          {isConnected && (
            <>
              <div className="absolute inset-0 rounded-full border border-indigo-500/30 animate-ping opacity-75 duration-[2000ms]"></div>
              <div className="absolute inset-[-10px] rounded-full border border-indigo-500/20 animate-ping opacity-50 delay-300 duration-[2000ms]"></div>
            </>
          )}

          {status === "connecting" ? (
            <svg
              className="animate-spin h-12 w-12 text-indigo-400"
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
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`${isConnected ? "text-indigo-300" : "text-slate-400"}`}
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          )}
        </div>

        <div className="flex gap-6">
          {!isConnected ? (
            <button
              onClick={startSession}
              disabled={status === "connecting"}
              className="px-10 py-4 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md rounded-full font-semibold shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-100"
            >
              {status === "connecting" ? "Connecting..." : "Start Call"}
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? "bg-red-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                {isMuted ? (
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
                  >
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                ) : (
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
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                )}
              </button>
              <button
                onClick={stopSession}
                className="w-20 h-14 rounded-full bg-red-500/80 hover:bg-red-600/90 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 22c5.5 0 10-4.5 10-10V8h-2v4c0 4.4-3.6 8-8 8s-8-3.6-8-8V8H2v4c0 5.5 4.5 10 10 10z" />
                  <path d="M18 6h-5V2h-2v4H6v3h12V6z" />
                </svg>
              </button>
            </>
          )}
        </div>

        {status === "error" && (
          <p className="text-red-300 text-sm bg-red-900/20 px-4 py-2 rounded-lg border border-red-500/20">
            Connection failed. Please check microphone permissions.
          </p>
        )}
      </div>
    </div>
  );
};

export default LiveView;
