"use client";

import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import {
  Loader2,
  Activity,
  Database,
  LayoutTemplate,
  Copy,
  Check,
  Download,
  Monitor,
  Tablet,
  Smartphone,
  RotateCcw,
  Sparkles,
  Code,
  Play,
  Pause,
  ArrowRight,
  Eye,
  HelpCircle,
  Music,
  Headphones,
  Save,
  Share2,
  Trash2,
} from "lucide-react";
import html2canvas from "html2canvas";

// Telemetry Wave Presets
const DATA_PRESETS = {
  solar_wind: {
    name: "Solar Wind Pulse",
    icon: "☀️",
    data: {
      title: "Solar Wind Particle Flux",
      frequency: 4.5,
      amplitude: 1.5,
      noiseLevel: 0.4,
      colorTheme: "solar",
      glowColor: "#f59e0b",
      gridSpeed: 1.2,
      shieldDensity: 45,
      waveType: "sine",
    },
  },
  magnetosphere: {
    name: "Magnetosphere Resonance",
    icon: "🛡️",
    data: {
      title: "Magnetosphere Shield Resonance",
      frequency: 1.2,
      amplitude: 2.5,
      noiseLevel: 0.1,
      colorTheme: "aurora",
      glowColor: "#10b981",
      gridSpeed: 0.5,
      shieldDensity: 85,
      waveType: "complex",
    },
  },
  cosmic_noise: {
    name: "Cosmic Noise Background",
    icon: "🌌",
    data: {
      title: "Cosmic Ray Noise Background",
      frequency: 8.0,
      amplitude: 0.6,
      noiseLevel: 0.9,
      colorTheme: "cosmic",
      glowColor: "#8b5cf6",
      gridSpeed: 2.5,
      shieldDensity: 10,
      waveType: "sawtooth",
    },
  },
};

const styleLabels: Record<string, string> = {
  "music-dashboard": "Resonance Synth",
  "twitter-card": "Solar HUD",
  "realestate-card": "Magnetosphere Shield",
  "pricing-tier": "Cosmic Flux Dashboard",
  "analytics-widget": "Space Weather Alert",
};

// Standalone HTML5 Canvas waveform drawing script generator
const generateWaveformHtml = (configStr: string, styleId: string) => {
  let config: any = {};
  try {
    config = JSON.parse(configStr);
  } catch (e) {
    config = {
      title: "Custom Resonance Wave",
      frequency: 2.5,
      amplitude: 1.5,
      noiseLevel: 0.3,
      colorTheme: "aurora",
      glowColor: "#10b981",
      gridSpeed: 0.5,
      shieldDensity: 50,
      waveType: "sine",
    };
  }

  const title = config.title || "Resonance Core";
  const frequency = Number(config.frequency) || 2.0;
  const amplitude = Number(config.amplitude) || 1.0;
  const noiseLevel = Number(config.noiseLevel) || 0.2;
  const glowColor = config.glowColor || "#38bdf8";
  const colorTheme = config.colorTheme || "cosmic";
  const gridSpeed = Number(config.gridSpeed) || 1.0;
  const shieldDensity = Number(config.shieldDensity) || 50;
  const waveType = config.waveType || "sine";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #09090b;
      color: white;
      font-family: ui-sans-serif, system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 1.5rem;
      overflow: hidden;
    }
    .neon-glow {
      box-shadow: 0 0 20px ${glowColor}40, inset 0 0 20px ${glowColor}20;
    }
  </style>
</head>
<body>
  <div class="w-full max-w-4xl p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-xl flex flex-col gap-6 shadow-2xl relative overflow-hidden neon-glow">
    <div class="absolute inset-0 bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-[size:20px_20px] opacity-30 pointer-events-none"></div>
    
    <div class="flex items-center justify-between z-10">
      <div>
        <h2 class="text-lg font-bold text-white tracking-wide uppercase">${title}</h2>
        <p class="text-xs text-zinc-400 mt-0.5">Resonance Alignment Simulator — Theme: ${colorTheme}</p>
      </div>
      <div class="flex items-center gap-4 text-right font-mono text-xs">
        <div>
          <span class="text-zinc-500">FREQ:</span> <span class="text-white">${frequency.toFixed(2)} Hz</span>
        </div>
        <div>
          <span class="text-zinc-500">AMP:</span> <span class="text-white">${amplitude.toFixed(2)}m</span>
        </div>
        <div>
          <span class="text-zinc-500">ALIGN:</span> <span class="text-emerald-400 font-semibold">STABLE</span>
        </div>
      </div>
    </div>

    <div class="w-full h-80 rounded-xl bg-black/50 border border-zinc-800 overflow-hidden relative z-10 flex items-center justify-center">
      <canvas id="waveform-canvas" class="w-full h-full"></canvas>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 z-10 text-xs">
      <div class="p-3 rounded-xl bg-zinc-950/60 border border-zinc-850/80">
        <p class="text-zinc-500 font-semibold">Wave Mode</p>
        <p class="text-sm font-bold text-white capitalize mt-1">${waveType}</p>
      </div>
      <div class="p-3 rounded-xl bg-zinc-950/60 border border-zinc-850/80">
        <p class="text-zinc-500 font-semibold">Stochastic Noise</p>
        <p class="text-sm font-bold text-white mt-1">${(noiseLevel * 100).toFixed(0)}%</p>
      </div>
      <div class="p-3 rounded-xl bg-zinc-950/60 border border-zinc-850/80">
        <p class="text-zinc-500 font-semibold">Flux Velocity</p>
        <p class="text-sm font-bold text-white mt-1">${gridSpeed.toFixed(2)}c</p>
      </div>
      <div class="p-3 rounded-xl bg-zinc-950/60 border border-zinc-850/80">
        <p class="text-zinc-500 font-semibold">Shield Density</p>
        <p class="text-sm font-bold text-white mt-1">${shieldDensity}%</p>
      </div>
    </div>
  </div>

  <script>
    const canvas = document.getElementById("waveform-canvas");
    const ctx = canvas.getContext("2d");

    function resize() {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
    }
    resize();
    window.addEventListener("resize", resize);

    let t = 0;
    const style = "${styleId}";
    const glowColor = "${glowColor}";
    const freq = ${frequency};
    const amp = ${amplitude};
    const noise = ${noiseLevel};
    const speed = ${gridSpeed};
    const density = ${shieldDensity};
    const waveType = "${waveType}";

    function draw() {
      requestAnimationFrame(draw);
      t += 0.05 * speed;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(39, 39, 42, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      const midY = canvas.height / 2;
      const width = canvas.width;
      const height = canvas.height;

      if (style === "twitter-card") {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.4;

        ctx.strokeStyle = glowColor + "30";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.arc(centerX, centerY, radius * 0.7, 0, Math.PI * 2);
        ctx.arc(centerX, centerY, radius * 0.4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = glowColor + "15";
        ctx.beginPath();
        ctx.moveTo(centerX - radius * 1.1, centerY);
        ctx.lineTo(centerX + radius * 1.1, centerY);
        ctx.moveTo(centerX, centerY - radius * 1.1);
        ctx.lineTo(centerX, centerY + radius * 1.1);
        ctx.stroke();

        const sweepAngle = t * 0.5;
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(sweepAngle) * radius, centerY + Math.sin(sweepAngle) * radius);
        ctx.stroke();

        const targetAngle = freq * 0.8;
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(targetAngle) * radius * amp * 0.4, centerY + Math.sin(targetAngle) * radius * amp * 0.4);
        ctx.stroke();

        ctx.fillStyle = glowColor;
        for (let i = 0; i < 5; i++) {
          const blipAngle = (i * Math.PI * 2) / 5 + targetAngle;
          const blipDist = radius * (0.3 + 0.6 * Math.sin(t + i));
          ctx.beginPath();
          ctx.arc(centerX + Math.cos(blipAngle) * blipDist, centerY + Math.sin(blipAngle) * blipDist, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (style === "realestate-card") {
        ctx.strokeStyle = glowColor + "50";
        ctx.lineWidth = 2;
        const shieldX = width * 0.6;
        ctx.beginPath();
        for (let j = -3; j <= 3; j++) {
          const offset = j * 40;
          ctx.moveTo(shieldX - 20 * Math.cos(j * 0.5), midY + offset);
          ctx.quadraticCurveTo(
            shieldX - 80 * amp - Math.abs(offset) * 0.2,
            midY + offset / 2,
            shieldX - 20 * Math.cos(j * 0.5),
            midY + offset * 2
          );
        }
        ctx.stroke();

        ctx.fillStyle = "#e11d48";
        for (let i = 0; i < density; i++) {
          const px = ((t * 80 + i * 140) % (width * 0.8));
          const py = (Math.sin(i * 0.7 + t) * 60 + midY + (i % 5 - 2) * 50);

          let renderX = px;
          let renderY = py;
          if (px > shieldX - 120 && px < shieldX + 50) {
            const dx = px - (shieldX - 100);
            renderX = px - dx * 0.3;
            renderY = py + (py > midY ? 80 : -80) * (1 - (px - (shieldX - 100)) / 150);
          }

          ctx.beginPath();
          ctx.arc(renderX, renderY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (style === "pricing-tier") {
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let x = 0; x < width; x += 5) {
          const ratio = x / width;
          const sample = Math.sin(ratio * Math.PI * 4 * freq + t) * Math.cos(ratio * Math.PI * freq);
          const randNoise = (Math.random() - 0.5) * noise * 80;
          const y = midY + sample * 80 * amp + randNoise;
          
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
        ctx.beginPath();
        for (let x = 0; x < width; x += 10) {
          const ratio = x / width;
          const y = midY + Math.sin(ratio * Math.PI * 2 + t * 0.2) * 110;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 3;
        ctx.beginPath();

        for (let x = 0; x < width; x += 2) {
          const ratio = x / width;
          let waveVal = 0;

          if (waveType === "sawtooth") {
            waveVal = ((ratio * freq * 10 + t) % 2) - 1;
          } else if (waveType === "triangle") {
            waveVal = Math.abs(((ratio * freq * 10 + t) % 2) - 1) * 2 - 1;
          } else if (waveType === "square") {
            waveVal = Math.sin(ratio * Math.PI * 2 * freq + t) >= 0 ? 1 : -1;
          } else {
            const baseSine = Math.sin(ratio * Math.PI * 2 * freq + t);
            const subharmonic = 0.5 * Math.sin(ratio * Math.PI * freq + t * 0.5);
            waveVal = baseSine + subharmonic;
          }

          const noiseVal = (Math.random() - 0.5) * noise;
          const y = midY + (waveVal + noiseVal) * 90 * amp;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    draw();
  </script>
</body>
</html>`;
};

export default function VisualizerPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [selectedData, setSelectedData] = useState<string>("");
  const [style, setStyle] = useState("twitter-card");
  const [customStyleHint, setCustomStyleHint] = useState("");

  // HTML Output States
  const [cleanHtml, setCleanHtml] = useState<string | null>(null);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [editedCode, setEditedCode] = useState<string>("");

  // App States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [viewportWidth, setViewportWidth] = useState<
    "100%" | "768px" | "375px"
  >("100%");
  const [sidebarTab, setSidebarTab] = useState<"input" | "style">("input");

  // Database & Saving States
  const [savedComponents, setSavedComponents] = useState<any[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(
    null,
  );
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [shareAfterSave, setShareAfterSave] = useState(false);

  // Audio / Synth states
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPlaybackTime, setAudioPlaybackTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [isDragAudio, setIsDragAudio] = useState(false);

  // References for Web Audio API nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const synthOscRef = useRef<OscillatorNode | null>(null);
  const synthGainRef = useRef<GainNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const audioPlayStartTimeRef = useRef<number>(0);
  const audioOffsetRef = useRef<number>(0);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  // Notifications
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetchGallery();

    const storedData = sessionStorage.getItem("visualizer_input_data");
    const storedStyle = sessionStorage.getItem("visualizer_initial_style");
    const storedHtml = sessionStorage.getItem("visualizer_initial_html");
    const storedTitle = sessionStorage.getItem("visualizer_initial_title");
    const storedId = sessionStorage.getItem("visualizer_initial_id");

    if (storedData && storedHtml) {
      setSelectedData(storedData);
      setStyle(storedStyle || "twitter-card");
      setCleanHtml(storedHtml);
      setGeneratedHtml(wrapHtmlWithTailwind(storedHtml));
      setEditedCode(storedHtml);
      if (storedTitle) setSaveTitle(storedTitle);
      if (storedId) setActiveComponentId(storedId);

      sessionStorage.removeItem("visualizer_input_data");
      sessionStorage.removeItem("visualizer_initial_style");
      sessionStorage.removeItem("visualizer_initial_html");
      sessionStorage.removeItem("visualizer_initial_title");
      sessionStorage.removeItem("visualizer_initial_id");
      showToast("Loaded component config!", "info");
    } else {
      loadPreset("solar_wind");
    }
  }, []);

  const handleGenerate = () => {
    if (!selectedData) return;
    setIsGenerating(true);

    try {
      const generatedHtmlContent = generateWaveformHtml(selectedData, style);
      setCleanHtml(generatedHtmlContent);
      setGeneratedHtml(wrapHtmlWithTailwind(generatedHtmlContent));
      setEditedCode(generatedHtmlContent);
      showToast("Updated Resonance Sandbox visual!");
    } catch (error) {
      console.error(error);
      showToast("Failed to compile parameters.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!refinementPrompt || !cleanHtml) return;

    setIsRefining(true);
    const instruction = refinementPrompt;
    setRefinementPrompt("");

    try {
      let parsed: any = {};
      try {
        parsed = JSON.parse(selectedData);
      } catch (e) {}

      const lowerInstr = instruction.toLowerCase();
      let updated = false;

      if (lowerInstr.includes("frequency") || lowerInstr.includes("freq")) {
        const match = lowerInstr.match(/\d+(\.\d+)?/);
        if (match) {
          parsed.frequency = parseFloat(match[0]);
          updated = true;
        }
      }
      if (lowerInstr.includes("amplitude") || lowerInstr.includes("amp")) {
        const match = lowerInstr.match(/\d+(\.\d+)?/);
        if (match) {
          parsed.amplitude = parseFloat(match[0]);
          updated = true;
        }
      }
      if (lowerInstr.includes("noise")) {
        const match = lowerInstr.match(/\d+(\.\d+)?/);
        if (match) {
          parsed.noiseLevel = parseFloat(match[0]);
          updated = true;
        }
      }
      if (lowerInstr.includes("speed")) {
        const match = lowerInstr.match(/\d+(\.\d+)?/);
        if (match) {
          parsed.gridSpeed = parseFloat(match[0]);
          updated = true;
        }
      }

      if (updated) {
        const updatedStr = JSON.stringify(parsed, null, 2);
        setSelectedData(updatedStr);
        const generatedHtmlContent = generateWaveformHtml(updatedStr, style);
        setCleanHtml(generatedHtmlContent);
        setGeneratedHtml(wrapHtmlWithTailwind(generatedHtmlContent));
        setEditedCode(generatedHtmlContent);
        showToast("Tuned wave parameters locally!");
      } else {
        showToast("Adjust parameters directly in the JSON panel.", "info");
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to tune parameters.", "error");
    } finally {
      setIsRefining(false);
    }
  };

  // Debounced Sync manual code modifications to iframe preview
  useEffect(() => {
    if (!editedCode || activeTab !== "code") return;
    const timer = setTimeout(() => {
      setCleanHtml(editedCode);
      setGeneratedHtml(wrapHtmlWithTailwind(editedCode));
    }, 600);
    return () => clearTimeout(timer);
  }, [editedCode, activeTab]);

  // Audio Playback progress tracking
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlayingAudio) {
      if (audioContextRef.current) {
        interval = setInterval(() => {
          const audioCtx = audioContextRef.current;
          if (audioCtx) {
            const current =
              audioCtx.currentTime - audioPlayStartTimeRef.current;
            if (current >= audioDuration) {
              setIsPlayingAudio(false);
              setAudioPlaybackTime(audioDuration);
              audioOffsetRef.current = 0;
              if (animationFrameRef.current)
                cancelAnimationFrame(animationFrameRef.current);
            } else {
              setAudioPlaybackTime(current);
            }
          }
        }, 100);
      }
    }
    return () => clearInterval(interval);
  }, [isPlayingAudio, audioDuration]);

  // Cleanup audio nodes on unmount
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch (e) {}
      }
      if (synthOscRef.current) {
        try {
          synthOscRef.current.stop();
        } catch (e) {}
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchGallery = async () => {
    setIsLoadingGallery(true);
    try {
      const res = await fetch("/api/visualize/list");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSavedComponents(data.components || []);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch gallery:", err);
    } finally {
      setIsLoadingGallery(false);
    }
  };

  const handleSaveComponent = async (title: string) => {
    if (!title.trim() || !cleanHtml) return;

    setIsSaving(true);
    try {
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(selectedData);
      } catch (e) {
        parsedInput = { rawText: selectedData };
      }

      const res = await fetch("/api/visualize/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeComponentId,
          title,
          style,
          inputData: parsedInput,
          cleanHtml,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save component");
      }

      const data = await res.json();
      if (data.success && data.component) {
        const savedId = data.component.id;
        setActiveComponentId(savedId);
        setSaveModalOpen(false);
        fetchGallery();

        if (shareAfterSave) {
          const shareUrl = `${window.location.origin}/visualizer/share/${savedId}`;
          navigator.clipboard.writeText(shareUrl);
          setCopiedShareLink(true);
          showToast("Saved & Share Link Copied!", "success");
          setShareAfterSave(false);
          setTimeout(() => setCopiedShareLink(false), 2000);
        } else {
          showToast(
            activeComponentId ? "Visualization updated!" : "Saved to gallery!",
            "success",
          );
        }
      }
    } catch (error) {
      console.error("Error saving:", error);
      showToast("Failed to save component", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteComponent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this visualization?")) return;

    try {
      const res = await fetch(`/api/visualize/delete?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete component");
      }

      const data = await res.json();
      if (data.success) {
        showToast("Component deleted successfully", "success");
        if (activeComponentId === id) {
          setActiveComponentId(null);
        }
        fetchGallery();
      }
    } catch (err) {
      console.error("Error deleting:", err);
      showToast("Failed to delete component", "error");
    }
  };

  const handleShareLink = async () => {
    if (activeComponentId) {
      const shareUrl = `${window.location.origin}/visualizer/share/${activeComponentId}`;
      navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      showToast("Share link copied to clipboard!", "success");
      setTimeout(() => setCopiedShareLink(false), 2000);
    } else {
      setShareAfterSave(true);
      setSaveTitle(`My ${styleLabels[style] || style}`);
      setSaveModalOpen(true);
    }
  };

  const handleExportPng = async () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
      showToast("Preview not loaded yet", "error");
      return;
    }

    setIsExportingPng(true);
    try {
      const elementToCapture = iframe.contentDocument.body;

      const canvas = await html2canvas(elementToCapture, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#09090b",
        scale: 2,
        logging: false,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `resonance-wave-${style}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      showToast("PNG exported successfully", "success");
    } catch (err) {
      console.error("Failed to export PNG:", err);
      showToast("Failed to export PNG", "error");
    } finally {
      setIsExportingPng(false);
    }
  };

  const loadPreset = (key: keyof typeof DATA_PRESETS) => {
    const preset = DATA_PRESETS[key as keyof typeof DATA_PRESETS];
    if (!preset) return;

    const presetDataStr = JSON.stringify(preset.data, null, 2);
    setSelectedData(presetDataStr);

    let targetStyle = "twitter-card";
    if (key === "solar_wind") targetStyle = "twitter-card";
    else if (key === "magnetosphere") targetStyle = "realestate-card";
    else if (key === "cosmic_noise") targetStyle = "pricing-tier";

    setStyle(targetStyle);

    // Compile locally
    const generatedHtmlContent = generateWaveformHtml(
      presetDataStr,
      targetStyle,
    );
    setCleanHtml(generatedHtmlContent);
    setGeneratedHtml(wrapHtmlWithTailwind(generatedHtmlContent));
    setEditedCode(generatedHtmlContent);

    // Reset synthesisers
    if (synthOscRef.current) {
      try {
        synthOscRef.current.stop();
      } catch (e) {}
      synthOscRef.current = null;
    }
    setIsPlayingAudio(false);
    setAudioFile(null);
    setAudioUrl(null);
    setAudioBuffer(null);
    setAudioPlaybackTime(0);
    setAudioDuration(0);

    showToast(`Loaded ${preset.name} Preset`, "info");
  };

  const wrapHtmlWithTailwind = (htmlContent: string) => {
    return htmlContent; // Standalone compiled page needs no wrapping
  };

  // Web Audio Visualizer canvas loop
  const startCanvasRef = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (!analyserNodeRef.current) return;
    const analyser = analyserNodeRef.current;
    analyser.fftSize = 64;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.6;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
        if (barHeight < 3) barHeight = 3;

        const gradient = ctx.createLinearGradient(
          0,
          canvas.height,
          0,
          canvas.height - barHeight,
        );
        gradient.addColorStop(0, "#8b5cf6");
        gradient.addColorStop(1, "#3b82f6");

        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.roundRect(x, canvas.height - barHeight, barWidth - 2, barHeight, 2);
        ctx.fill();

        x += barWidth;
      }
    };

    draw();
  };

  const playAudio = () => {
    if (!audioBuffer) {
      // Offline space synthesizer tone playbacks!
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      const audioCtx = audioContextRef.current;
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      if (synthOscRef.current) {
        try {
          synthOscRef.current.stop();
        } catch (e) {}
      }

      let parsed: any = {};
      try {
        parsed = JSON.parse(selectedData);
      } catch (e) {
        parsed = {};
      }

      const frequency = Number(parsed.frequency) || 2.5;
      const amplitude = Number(parsed.amplitude) || 1.5;
      const waveType = parsed.waveType || "sine";

      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      osc.frequency.setValueAtTime(110 * frequency, audioCtx.currentTime);
      osc.type = ["sine", "sawtooth", "triangle", "square"].includes(waveType)
        ? waveType
        : "sine";

      gainNode.gain.setValueAtTime(0.08 * amplitude, audioCtx.currentTime);

      osc.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);

      synthOscRef.current = osc;
      synthGainRef.current = gainNode;
      analyserNodeRef.current = analyser;

      osc.start();
      setIsPlayingAudio(true);
      setAudioDuration(180);
      audioPlayStartTimeRef.current = audioCtx.currentTime;

      setTimeout(() => {
        startCanvasRef();
      }, 50);
      return;
    }

    // Fallback: If they dragged/dropped audio file, play decoded buffer
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }
    const audioCtx = audioContextRef.current;
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;

    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    sourceNodeRef.current = source;
    analyserNodeRef.current = analyser;

    const offset = audioOffsetRef.current;
    source.start(0, offset);
    audioPlayStartTimeRef.current = audioCtx.currentTime - offset;

    source.onended = () => {
      if (
        audioCtx.currentTime - audioPlayStartTimeRef.current >=
        audioDuration - 0.1
      ) {
        setIsPlayingAudio(false);
        setAudioPlaybackTime(0);
        audioOffsetRef.current = 0;
        if (animationFrameRef.current)
          cancelAnimationFrame(animationFrameRef.current);
      }
    };

    setIsPlayingAudio(true);
    setTimeout(() => {
      startCanvasRef();
    }, 50);
  };

  const pauseAudio = () => {
    if (synthOscRef.current) {
      try {
        synthOscRef.current.stop();
      } catch (e) {}
      synthOscRef.current = null;
      synthGainRef.current = null;
      setIsPlayingAudio(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    if (!sourceNodeRef.current || !audioContextRef.current) return;
    const audioCtx = audioContextRef.current;
    try {
      sourceNodeRef.current.stop();
    } catch (e) {}

    audioOffsetRef.current =
      audioCtx.currentTime - audioPlayStartTimeRef.current;
    setIsPlayingAudio(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const handleSeek = (newTime: number) => {
    audioOffsetRef.current = newTime;
    setAudioPlaybackTime(newTime);
    if (isPlayingAudio) {
      playAudio();
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const addHistoryItem = (
    clean: string,
    wrapped: string,
    description: string,
  ) => {
    setCleanHtml(clean);
    setGeneratedHtml(wrapped);
    setEditedCode(clean);
  };

  const analyzeAudio = async (file: File) => {
    setIsAnalyzingAudio(true);
    showToast("Reading audio file...", "info");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();

      showToast("Decoding audio data...", "info");
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      setAudioDuration(decodedBuffer.duration);

      showToast("Analyzing tempo...", "info");
      const channelData = decodedBuffer.getChannelData(0);
      const sampleRate = decodedBuffer.sampleRate;

      const step = Math.max(1, Math.floor(channelData.length / 500000));
      let maxVal = 0;
      for (let i = 0; i < channelData.length; i += step) {
        const absVal = Math.abs(channelData[i]);
        if (absVal > maxVal) maxVal = absVal;
      }

      const threshold = maxVal * 0.75;
      const peaks: number[] = [];
      const minInterval = sampleRate * 0.3;

      let lastPeakIndex = -minInterval;
      for (let i = 0; i < channelData.length; i += step) {
        if (Math.abs(channelData[i]) > threshold) {
          if (i - lastPeakIndex > minInterval) {
            peaks.push(i);
            lastPeakIndex = i;
          }
        }
      }

      let bpm = 120;
      if (peaks.length > 1) {
        let sumIntervals = 0;
        for (let i = 1; i < peaks.length; i++) {
          sumIntervals += peaks[i] - peaks[i - 1];
        }
        const avgIntervalSamples = sumIntervals / (peaks.length - 1);
        bpm = Math.round(60 / (avgIntervalSamples / sampleRate));

        while (bpm < 65) bpm *= 2;
        while (bpm > 170) bpm /= 2;
      }

      const musicMetadata = {
        title: file.name.replace(/\.[^/.]+$/, ""),
        frequency: bpm / 30, // Map BPM to a local synth frequency
        amplitude: 1.5,
        noiseLevel: 0.2,
        colorTheme: "aurora",
        glowColor: "#10b981",
        gridSpeed: 1.0,
        shieldDensity: 60,
        waveType: "triangle",
        file_name: file.name,
      };

      setSelectedData(JSON.stringify(musicMetadata, null, 2));
      setStyle("music-dashboard");
      setSidebarTab("input");

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setAudioFile(file);

      // Re-compile local visuals
      const compiled = generateWaveformHtml(
        JSON.stringify(musicMetadata),
        "music-dashboard",
      );
      setCleanHtml(compiled);
      setGeneratedHtml(compiled);
      setEditedCode(compiled);

      showToast("Audio parsed successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to analyze audio file.", "error");
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  const handleDownload = () => {
    if (!cleanHtml) return;
    const blob = new Blob([cleanHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resonance-wave-${style}-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Download started");
  };

  const resetAll = () => {
    if (synthOscRef.current) {
      try {
        synthOscRef.current.stop();
      } catch (e) {}
      synthOscRef.current = null;
    }
    setIsPlayingAudio(false);
    setAudioFile(null);
    setAudioBuffer(null);
    setAudioPlaybackTime(0);
    audioOffsetRef.current = 0;

    loadPreset("solar_wind");
    showToast("Sandbox reset complete");
  };

  if (!isMounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl border border-indigo-500/20 bg-zinc-900/90 text-sm shadow-xl flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-300">
          {toast.type === "success" && (
            <Check className="w-4 h-4 text-emerald-400" />
          )}
          {toast.type === "error" && (
            <HelpCircle className="w-4 h-4 text-rose-400" />
          )}
          {toast.type === "info" && (
            <Sparkles className="w-4 h-4 text-indigo-400" />
          )}
          <span className="text-zinc-200 font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="h-14 border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md px-6 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-650 flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Activity className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              Resonance Sandbox
              <span className="text-[10px] bg-indigo-550/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded font-mono">
                v2.0-Offline
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={resetAll}
            className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800/80 text-xs font-semibold text-zinc-400 hover:text-white transition-all flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Sandbox
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 h-[calc(100vh-56px)] overflow-hidden">
        {/* Left Side: Control Panel */}
        <div className="w-[420px] shrink-0 border-r border-zinc-800/80 bg-zinc-900/20 flex flex-col h-full overflow-hidden">
          <div className="flex border-b border-zinc-800/80 shrink-0 p-2 gap-1 bg-zinc-950/40">
            <button
              onClick={() => setSidebarTab("input")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                sidebarTab === "input"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <Database className="w-3.5 h-3.5" /> 1. Input Telemetry
            </button>
            <button
              onClick={() => setSidebarTab("style")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                sidebarTab === "style"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" /> 2. Wave Layout
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {sidebarTab === "input" ? (
              <div className="space-y-4">
                {/* Audio upload box for custom tempo mapping */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                    Parse Custom Audio Tempo
                  </h3>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragAudio(true);
                    }}
                    onDragLeave={() => setIsDragAudio(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragAudio(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        analyzeAudio(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => audioFileInputRef.current?.click()}
                    className={`border border-dashed p-3.5 rounded-xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                      isDragAudio
                        ? "border-indigo-500 bg-indigo-600/10 text-indigo-400 shadow-md shadow-indigo-500/5"
                        : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300"
                    }`}
                  >
                    <input
                      type="file"
                      ref={audioFileInputRef}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          analyzeAudio(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                      accept="audio/*"
                    />
                    {isAnalyzingAudio ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                        <span className="text-xs font-semibold text-zinc-300">
                          Extracting Tempo...
                        </span>
                      </>
                    ) : (
                      <>
                        <Headphones className="w-5 h-5 text-indigo-400" />
                        <div className="text-xs">
                          <p className="font-semibold text-zinc-300">
                            Drop audio file or click to select
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            Extracts frequency metadata from local audio tracks
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                    Space Telemetry Presets
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(DATA_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() =>
                          loadPreset(key as keyof typeof DATA_PRESETS)
                        }
                        className="px-3 py-2.5 bg-zinc-900/60 border border-zinc-800 hover:border-indigo-500 hover:bg-zinc-800/40 rounded-xl text-left transition-all text-xs flex items-center gap-2 group"
                      >
                        <span className="text-base">{preset.icon}</span>
                        <div className="overflow-hidden">
                          <p className="font-semibold text-zinc-300 group-hover:text-white truncate">
                            {preset.name}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-800/60 my-4" />

                {/* Saved Presets Gallery */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                    <span>Saved Wave Configurations</span>
                    {isLoadingGallery && (
                      <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
                    )}
                  </h3>

                  {savedComponents.length === 0 ? (
                    <div className="border border-dashed border-zinc-800 p-4 rounded-xl text-center text-zinc-500 text-[11px]">
                      No custom configurations saved yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                      {savedComponents.map((comp) => {
                        const styleIcon = "🌌";
                        const isCurrent = activeComponentId === comp.id;
                        return (
                          <div
                            key={comp.id}
                            onClick={() => {
                              setActiveComponentId(comp.id);
                              setStyle(comp.style);
                              setSelectedData(
                                JSON.stringify(comp.inputData, null, 2),
                              );
                              setCleanHtml(comp.cleanHtml);
                              setGeneratedHtml(comp.cleanHtml);
                              setEditedCode(comp.cleanHtml);
                              showToast(`Loaded "${comp.title}"`, "info");
                            }}
                            className={`group w-full px-3 py-2 border rounded-xl text-left transition-all text-xs flex items-center justify-between cursor-pointer ${
                              isCurrent
                                ? "bg-indigo-950/20 border-indigo-500 text-white shadow-sm"
                                : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-850/40 hover:text-zinc-200"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-base shrink-0">
                                {styleIcon}
                              </span>
                              <div className="truncate">
                                <p
                                  className={`font-semibold truncate ${isCurrent ? "text-indigo-400" : "text-zinc-300"}`}
                                >
                                  {comp.title}
                                </p>
                                <p className="text-[9px] text-zinc-500 font-medium">
                                  {styleLabels[comp.style] || comp.style}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteComponent(comp.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 rounded transition-all shrink-0 ml-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      Wave parameters (JSON)
                    </label>
                    <button
                      onClick={() => {
                        try {
                          setSelectedData(
                            JSON.stringify(JSON.parse(selectedData), null, 2),
                          );
                          showToast("Formatted JSON");
                        } catch (e) {
                          showToast("Invalid JSON", "error");
                        }
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      Format JSON
                    </button>
                  </div>
                  <div className="border border-zinc-800 rounded-xl overflow-hidden bg-black/40 h-64 shadow-inner">
                    <Editor
                      height="100%"
                      defaultLanguage="json"
                      theme="vs-dark"
                      value={selectedData}
                      onChange={(val) => setSelectedData(val || "")}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 11,
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        padding: { top: 8, bottom: 8 },
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* TAB 2: Style Selector */
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block">
                    Telemetry Display Style
                  </label>
                  <div className="space-y-2">
                    {[
                      {
                        id: "music-dashboard",
                        title: "🎵 Resonance Synth Oscilloscope",
                        desc: "Displays simple audio-synth frequency signals with wave type parameters.",
                      },
                      {
                        id: "twitter-card",
                        title: "☀️ Solar Azimuth Vector HUD",
                        desc: "Circular sweep crosshair visualizing angular sun position vectors.",
                      },
                      {
                        id: "realestate-card",
                        title: "🛡️ Magnetosphere Shield Matrix",
                        desc: "Visualizes curved magnetic fields deflecting solar wind particles.",
                      },
                      {
                        id: "pricing-tier",
                        title: "🌌 Cosmic Flux Dashboard",
                        desc: "Two scrolling noise graphs tracking high-altitude cosmic ray radiation.",
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setStyle(item.id);
                          const compiled = generateWaveformHtml(
                            selectedData,
                            item.id,
                          );
                          setCleanHtml(compiled);
                          setGeneratedHtml(compiled);
                          setEditedCode(compiled);
                        }}
                        className={`w-full p-3.5 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                          style === item.id
                            ? "bg-indigo-600/10 border-indigo-500 shadow-md shadow-indigo-500/5"
                            : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/20"
                        }`}
                      >
                        <p
                          className={`text-xs font-bold ${style === item.id ? "text-indigo-400" : "text-zinc-200"}`}
                        >
                          {item.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 leading-normal">
                          {item.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Local Wave Tuner Instructions
                  </label>
                  <textarea
                    className="w-full h-24 p-3 bg-zinc-950 border border-zinc-850 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 placeholder-zinc-650 transition-colors"
                    value={customStyleHint}
                    onChange={(e) => setCustomStyleHint(e.target.value)}
                    placeholder="Describe adjustments (e.g. set frequency to 5.0, increase noise level to 0.8)..."
                  />
                </div>
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isRefining || !selectedData}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-850 disabled:text-zinc-650 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 group shrink-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating simulation...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-indigo-200 group-hover:animate-pulse" />
                  Update Simulation
                </>
              )}
            </button>

            {/* Refinement local input */}
            {cleanHtml && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Tune Wave Parameters via Command
                </h4>
                <form onSubmit={handleRefine} className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-850 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
                    value={refinementPrompt}
                    onChange={(e) => setRefinementPrompt(e.target.value)}
                    placeholder="e.g. increase frequency, set noise to 0.4..."
                    disabled={isRefining || isGenerating}
                  />
                  <button
                    type="submit"
                    disabled={isRefining || isGenerating || !refinementPrompt}
                    className="px-3 bg-zinc-900 border border-zinc-800 hover:border-indigo-500 disabled:bg-zinc-850 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center"
                  >
                    {isRefining ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Output Canvas / Preview Panel */}
        <div className="flex-1 flex flex-col bg-zinc-950 relative overflow-hidden h-full">
          {/* Action Toolbar */}
          <div className="h-12 border-b border-zinc-800/80 bg-zinc-900/20 px-6 flex items-center justify-between shrink-0 text-zinc-350">
            <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              <button
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === "preview"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Preview Simulation
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === "code"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Code className="w-3.5 h-3.5" /> Compiled HTML Code
              </button>
            </div>

            {activeTab === "preview" && cleanHtml && (
              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setViewportWidth("100%")}
                  className={`p-1.5 rounded-md transition-all ${viewportWidth === "100%" ? "bg-zinc-800 text-indigo-400" : "text-zinc-400 hover:text-zinc-200"}`}
                  title="Full Width"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewportWidth("768px")}
                  className={`p-1.5 rounded-md transition-all ${viewportWidth === "768px" ? "bg-zinc-800 text-indigo-400" : "text-zinc-400 hover:text-zinc-200"}`}
                  title="Tablet Width"
                >
                  <Tablet className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewportWidth("375px")}
                  className={`p-1.5 rounded-md transition-all ${viewportWidth === "375px" ? "bg-zinc-800 text-indigo-400" : "text-zinc-400 hover:text-zinc-250"}`}
                  title="Mobile Width"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {cleanHtml && (
                <>
                  <button
                    onClick={() => {
                      setSaveTitle(
                        saveTitle || `My ${styleLabels[style] || style}`,
                      );
                      setSaveModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                      {activeComponentId ? "Update Presets" : "Save Presets"}
                    </span>
                  </button>

                  <button
                    onClick={handleShareLink}
                    className="px-3 py-1.5 rounded-lg border border-indigo-900/50 hover:border-indigo-800 bg-indigo-950/20 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-all flex items-center gap-1.5"
                  >
                    {copiedShareLink ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Share2 className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {copiedShareLink ? "Copied URL!" : "Share Preset"}
                    </span>
                  </button>

                  <button
                    onClick={handleExportPng}
                    disabled={isExportingPng}
                    className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isExportingPng ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Export PNG</span>
                  </button>

                  <button
                    onClick={handleDownload}
                    className="px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-[0.98]"
                  >
                    <Download className="w-3.5 h-3.5" /> Download HTML
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Sandbox Canvas */}
          <div className="flex-1 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:20px_20px] bg-zinc-950 overflow-hidden flex flex-col items-center justify-center p-6 relative pb-24">
            {activeTab === "preview" ? (
              generatedHtml ? (
                <div
                  className="h-full bg-zinc-900 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 flex flex-col relative w-full"
                  style={{ width: viewportWidth }}
                >
                  <iframe
                    ref={iframeRef}
                    srcDoc={generatedHtml}
                    className="w-full flex-1 border-none bg-zinc-950"
                    sandbox="allow-scripts"
                    title="Telemetry Sandbox Preview"
                  />
                </div>
              ) : (
                <div className="text-center text-zinc-500 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
                    <Activity className="w-8 h-8 text-zinc-650" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-zinc-400">
                      Alignment Visualizer Pane
                    </p>
                    <p className="text-xs text-zinc-650 max-w-sm">
                      Select a preset or input wave parameters on the left to
                      start telemetry simulation.
                    </p>
                  </div>
                </div>
              )
            ) : cleanHtml ? (
              <div className="w-full h-full border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl bg-black">
                <div className="bg-zinc-950 border-b border-zinc-850 px-4 py-2 flex justify-between items-center shrink-0">
                  <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-indigo-400" />{" "}
                    component.html (Local Editable Code)
                  </span>
                </div>
                <div className="h-[calc(100%-36px)]">
                  <Editor
                    height="100%"
                    defaultLanguage="html"
                    theme="vs-dark"
                    value={editedCode}
                    onChange={(val) => setEditedCode(val || "")}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center text-zinc-550 flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
                  <Code className="w-8 h-8 text-zinc-650" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-zinc-400">No compiled code</p>
                </div>
              </div>
            )}

            {/* Bottom Synthesizer Playback Bar */}
            <div className="absolute bottom-4 left-4 right-4 bg-zinc-900/80 border border-zinc-800/80 px-4 py-3 rounded-2xl flex items-center justify-between backdrop-blur-md shadow-xl z-20 gap-4">
              <div className="flex items-center gap-3 w-1/3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-indigo-650/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                  <Activity className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {audioFile ? audioFile.name : "Space Resonance Synth Drone"}
                  </p>
                  <p className="text-[9px] text-zinc-400 font-medium">
                    {audioFile
                      ? "Uploaded File Output"
                      : "Geomagnetic Alignment Frequency"}
                  </p>
                </div>
              </div>

              <div className="flex-1 max-w-md flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-4">
                  <button
                    onClick={isPlayingAudio ? pauseAudio : playAudio}
                    className="w-8 h-8 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    {isPlayingAudio ? (
                      <Pause className="w-4 h-4 fill-zinc-950 text-zinc-950" />
                    ) : (
                      <Play className="w-4 h-4 fill-zinc-950 text-zinc-950 ml-0.5" />
                    )}
                  </button>
                </div>

                <div className="w-full flex items-center gap-2.5">
                  <span className="text-[9px] font-mono text-zinc-500 min-w-[28px] text-right">
                    {formatTime(audioPlaybackTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={audioDuration || 180}
                    step={0.1}
                    value={audioPlaybackTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
                  />
                  <span className="text-[9px] font-mono text-zinc-500 min-w-[28px]">
                    {formatTime(audioDuration || 180)}
                  </span>
                </div>
              </div>

              <div className="w-1/3 flex justify-end items-center gap-3">
                <canvas
                  ref={canvasRef}
                  width={140}
                  height={28}
                  className="bg-black/40 rounded-lg border border-zinc-850/60"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save to Gallery Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Save Configuration to Presets
            </h3>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500">
                Preset Title
              </label>
              <input
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="e.g. High Altitude Aurora Wave"
                className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl text-xs text-white focus:outline-none transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveTitle.trim()) {
                    handleSaveComponent(saveTitle);
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  setSaveModalOpen(false);
                  setSaveTitle("");
                  setShareAfterSave(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white bg-transparent border border-zinc-800 hover:bg-zinc-800 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveComponent(saveTitle)}
                disabled={isSaving || !saveTitle.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-zinc-800 rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
