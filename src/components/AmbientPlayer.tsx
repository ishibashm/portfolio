"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Radio, Music } from "lucide-react";

interface AmbientPlayerProps {
  url?: string;
}

export function AmbientPlayer({ url = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" }: AmbientPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load volume and mute state from localStorage
    const savedVolume = localStorage.getItem("ambient-volume");
    if (savedVolume) setVolume(parseFloat(savedVolume));
    const savedMuted = localStorage.getItem("ambient-muted") === "true";
    setIsMuted(savedMuted);
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(err => console.error("Playback failed:", err));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    localStorage.setItem("ambient-muted", String(nextMuted));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = parseFloat(e.target.value);
    setVolume(nextVolume);
    localStorage.setItem("ambient-volume", String(nextVolume));
    if (nextVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="bg-zinc-950/90 border border-zinc-800 p-2 rounded-sm shadow-xl backdrop-blur-md flex items-center gap-3 font-mono text-[10px] w-fit min-w-[200px]">
      <audio ref={audioRef} src={url} loop />
      
      {/* Status Icon */}
      <div className="flex items-center justify-center w-8 h-8 bg-zinc-900 border border-zinc-800 rounded-sm relative">
        {isPlaying ? (
          <div className="flex items-end gap-px h-3">
             <div className="w-1 bg-emerald-500 animate-[eq_0.8s_infinite] h-full"></div>
             <div className="w-1 bg-emerald-500 animate-[eq_1.2s_infinite] h-2/3"></div>
             <div className="w-1 bg-emerald-500 animate-[eq_1s_infinite] h-1/2"></div>
          </div>
        ) : (
          <Music size={14} className="text-zinc-600" />
        )}
      </div>

      <div className="flex flex-col grow">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[9px] uppercase tracking-widest text-zinc-500">Ambient Frequency</span>
          <span className={`text-[8px] ${isPlaying ? 'text-emerald-500 animate-pulse' : 'text-zinc-600'}`}>
            {isPlaying ? "SYNC_ACTIVE" : "STANDBY"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Controls */}
          <button 
            onClick={togglePlay}
            className="text-zinc-300 hover:text-emerald-400 transition-colors p-1"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>

          <button 
            onClick={toggleMute}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isMuted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>

          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={isMuted ? 0 : volume} 
            onChange={handleVolumeChange}
            className="w-24 accent-emerald-500 h-0.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes eq {
          0%, 100% { height: 4px; }
          50% { height: 12px; }
        }
      `}</style>
    </div>
  );
}
