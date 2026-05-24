'use client';

import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Loader2, Palette, Database, LayoutTemplate, Copy, Check, Download, 
  Monitor, Tablet, Smartphone, RotateCcw, Sparkles, Code, Play, Pause,
  ChevronRight, ArrowRight, Eye, History, Settings, Undo2, Redo2, HelpCircle,
  Music, Headphones, Upload, Youtube, Link, Save, Share2, Trash2
} from 'lucide-react';
import html2canvas from 'html2canvas';

// Data presets for quick loading
const DATA_PRESETS = {
  twitter: {
    name: "X (Twitter) Post",
    icon: "🐦",
    data: {
      id: "1809000000000000000",
      author_handle: "elonmusk",
      author_display: "Elon Musk",
      avatar_url: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=100&h=100&q=80",
      datetime: "2026-05-21T12:00:00Z",
      text: "The future of AI is looking incredibly bright. The interfaces we build today will define the next generation of human-computer interaction. 🌌🛸 #AI #Design #Technology",
      likes: "125K",
      retweets: "18.4K",
      replies: "9.2K",
      views: "4.8M"
    }
  },
  music: {
    name: "Music Track Metadata",
    icon: "🎵",
    data: {
      title: "Midnight City Lights",
      artist: "Lofi Horizon",
      album: "Neon Dreams EP",
      bpm: 88,
      key: "F# Major",
      energy: "Moderate",
      duration: "2:45",
      file_name: "midnight_city_lights.mp3",
      release_year: 2026,
      spotify_popularity: 82,
      acousticness: "85%",
      danceability: "70%",
      valence: "Happy",
      sections: [
        { name: "Intro", label: "イントロ", startTime: 0, endTime: 15, energy: 2, note: "チルアウトなエレピでスタート" },
        { name: "Verse 1", label: "Aメロ (1番)", startTime: 15, endTime: 45, energy: 2, note: "ドラムが入る、リラックスしたメロディ" },
        { name: "Chorus 1", label: "サビ (1番)", startTime: 45, endTime: 75, energy: 3, note: "豊かなシンセとベースラインの広がり" },
        { name: "Verse 2", label: "Aメロ (2番)", startTime: 75, endTime: 105, energy: 2, note: "少し変化したビートとパーカッション" },
        { name: "Chorus 2", label: "サビ (2番)", startTime: 105, endTime: 135, energy: 4, note: "最も盛り上がるフルアレンジのサビ" },
        { name: "Outro", label: "アウトロ", startTime: 135, endTime: 165, energy: 1, note: "徐々にフェードアウトしていくエレピ" }
      ]
    }
  },
  realestate: {
    name: "Real Estate Card",
    icon: "🏠",
    data: {
      id: "prop_90210",
      title: "Minimalist Glass & Concrete Villa",
      location: "Beverly Hills, California",
      price: "$12,500,000",
      beds: 5,
      baths: 6.5,
      sqft: 6800,
      image_url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&h=450&q=80",
      amenities: ["Infinity Pool", "Wine Cellar", "Home Cinema", "Smart Automation"],
      agent: {
        name: "Sarah Jenkins",
        phone: "+1 (555) 019-2834"
      }
    }
  },
  pricing: {
    name: "SaaS Pricing Tier",
    icon: "💳",
    data: {
      tier: "Developer Pro",
      price_monthly: "$29",
      price_yearly: "$24",
      description: "Perfect for individual developers and small teams building next-gen web apps.",
      features: [
        "Unlimited deployments",
        "Custom domains & SSL",
        "Edge Functions (10M requests)",
        "Advanced analytics & insights",
        "24/7 Support"
      ],
      is_popular: true,
      cta_text: "Start 14-day free trial"
    }
  },
  dashboard: {
    name: "Analytics Widget",
    icon: "📊",
    data: {
      metric_name: "Monthly Active Users",
      value: "248,390",
      change_percentage: "+14.2%",
      change_direction: "up",
      timeline_label: "vs. last month",
      chart_data: [120, 150, 134, 180, 210, 248],
      recent_activities: [
        { "user": "Alex K.", "action": "Signed up", "time": "2m ago" },
        { "user": "Maria S.", "action": "Upgraded to Pro", "time": "15m ago" }
      ]
    }
  }
};

interface HistoryItem {
  cleanHtml: string;
  html: string;
  description: string;
  timestamp: string;
}

const getSectionColor = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('intro')) return { bg: 'bg-rose-500', border: 'border-rose-400', text: 'text-rose-400', dot: '#f43f5e' };
  if (n.includes('verse')) {
    if (n.includes('2') || n.includes('b')) {
      return { bg: 'bg-blue-600', border: 'border-blue-500', text: 'text-blue-400', dot: '#2563eb' };
    }
    return { bg: 'bg-sky-500', border: 'border-sky-400', text: 'text-sky-450', dot: '#0ea5e9' };
  }
  if (n.includes('pre-chorus') || n.includes('prechorus') || n.includes('bメロ')) {
    return { bg: 'bg-indigo-500', border: 'border-indigo-455', text: 'text-indigo-400', dot: '#6366f1' };
  }
  if (n.includes('chorus') || n.includes('refrain') || n.includes('サビ')) {
    return { bg: 'bg-amber-500', border: 'border-amber-400', text: 'text-amber-450', dot: '#f59e0b' };
  }
  if (n.includes('bridge') || n.includes('cメロ')) {
    return { bg: 'bg-emerald-500', border: 'border-emerald-450', text: 'text-emerald-400', dot: '#10b981' };
  }
  if (n.includes('solo')) {
    return { bg: 'bg-pink-500', border: 'border-pink-400', text: 'text-pink-450', dot: '#ec4899' };
  }
  if (n.includes('outro') || n.includes('coda')) {
    return { bg: 'bg-zinc-500', border: 'border-zinc-400', text: 'text-zinc-405', dot: '#71717a' };
  }
  return { bg: 'bg-violet-500', border: 'border-violet-400', text: 'text-violet-400', dot: '#8b5cf6' };
};

const renderEnergyStars = (energy: number) => {
  return (
    <div className="flex justify-center gap-0.5 text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="text-[10px]">
          {i < energy ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
};

export default function VisualizerPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [selectedData, setSelectedData] = useState<string>('');
  const [style, setStyle] = useState('twitter-card');
  const [customStyleHint, setCustomStyleHint] = useState('');
  
  // HTML Output States
  const [cleanHtml, setCleanHtml] = useState<string | null>(null);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [editedCode, setEditedCode] = useState<string>('');
  
  // App States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'html-anything'>('preview');
  const [viewportWidth, setViewportWidth] = useState<'100%' | '768px' | '667px' | '375px'>('100%');
  const [sidebarTab, setSidebarTab] = useState<'input' | 'style'>('input');
  
  // Database & Saving States
  const [savedComponents, setSavedComponents] = useState<any[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [shareAfterSave, setShareAfterSave] = useState(false);
  
  // Audio Upload & Web Audio API playback states
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const audioPlayStartTimeRef = useRef<number>(0);
  const audioOffsetRef = useRef<number>(0);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  // YouTube states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [youtubeTitle, setYoutubeTitle] = useState<string | null>(null);
  const [youtubeThumbnail, setYoutubeThumbnail] = useState<string | null>(null);
  const [isFetchingYoutube, setIsFetchingYoutube] = useState(false);
  const ytPlayerRef = useRef<any>(null);

  // Song Structure Analysis states
  const [songSections, setSongSections] = useState<any[]>([]);
  const [isAnalyzingStructure, setIsAnalyzingStructure] = useState(false);

  // Keep a reference of selectedData for event closures
  const selectedDataRef = useRef(selectedData);
  useEffect(() => {
    selectedDataRef.current = selectedData;
  }, [selectedData]);

  // Synchronize song sections from manual edits in Monaco editor JSON
  useEffect(() => {
    if (!selectedData) return;
    try {
      const parsed = JSON.parse(selectedData);
      if (parsed && Array.isArray(parsed.sections)) {
        setSongSections(parsed.sections);
      }
    } catch (e) {
      // Ignore invalid JSON while user is typing
    }
  }, [selectedData]);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  // Notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlAnythingIframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetchGallery();
    
    // Check if we came from share page or elsewhere
    const storedData = sessionStorage.getItem('visualizer_input_data');
    const storedStyle = sessionStorage.getItem('visualizer_initial_style');
    const storedHtml = sessionStorage.getItem('visualizer_initial_html');
    const storedTitle = sessionStorage.getItem('visualizer_initial_title');
    const storedId = sessionStorage.getItem('visualizer_initial_id');

    let initializedFromSession = false;

    if (storedData) {
      setSelectedData(storedData);
      sessionStorage.removeItem('visualizer_input_data');
      initializedFromSession = true;
    }
    if (storedStyle) {
      setStyle(storedStyle);
      sessionStorage.removeItem('visualizer_initial_style');
    }
    if (storedHtml) {
      setCleanHtml(storedHtml);
      setGeneratedHtml(wrapHtmlWithTailwind(storedHtml));
      setEditedCode(storedHtml);
      sessionStorage.removeItem('visualizer_initial_html');
    }
    if (storedTitle) {
      setSaveTitle(storedTitle);
      sessionStorage.removeItem('visualizer_initial_title');
    }
    if (storedId) {
      setActiveComponentId(storedId);
      sessionStorage.removeItem('visualizer_initial_id');
    }

    if (initializedFromSession) {
      showToast("Loaded component from share link!", "info");
      return;
    }

    // Attempt to load sample data from our existing X Posts DB
    fetch('/api/x-viewer/accounts')
      .then(res => res.json())
      .then(data => {
        if (data.accounts && data.accounts.length > 0) {
          fetch(`/api/x-viewer/posts?handle=${encodeURIComponent(data.accounts[0])}`)
            .then(res => res.json())
            .then(postData => {
              if (postData.posts && postData.posts.length > 0) {
                // Keep the fetched posts as potential quick samples
                setDataSources(postData.posts.slice(0, 3));
                if (!storedData) {
                  // Default to first post from DB if no session storage
                  setSelectedData(JSON.stringify(postData.posts[0], null, 2));
                }
              } else if (!storedData) {
                // Fallback to first preset if DB is empty
                loadPreset('twitter');
              }
            });
        } else if (!storedData) {
          loadPreset('twitter');
        }
      })
      .catch(err => {
        console.warn('Could not fetch account posts, loading defaults:', err);
        if (!storedData) loadPreset('twitter');
      });
  }, []);

  const handleSyncToHtmlAnything = () => {
    if (htmlAnythingIframeRef.current && htmlAnythingIframeRef.current.contentWindow) {
      const isJson = style.includes('card') || style.includes('music') || style.includes('pricing') || style.includes('dashboard');
      htmlAnythingIframeRef.current.contentWindow.postMessage({
        type: 'load_content',
        content: isJson ? selectedData : editedCode,
        format: isJson ? 'json' : 'text',
        filename: isJson ? 'preset_data.json' : 'component.html'
      }, '*');
    }
  };

  // Debounced Sync manual code modifications to iframe preview
  useEffect(() => {
    if (!editedCode || activeTab !== 'code') return;
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
      if (youtubeId) {
        interval = setInterval(() => {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
            const current = ytPlayerRef.current.getCurrentTime();
            setAudioPlaybackTime(current);
          }
        }, 200);
      } else if (audioContextRef.current) {
        interval = setInterval(() => {
          const audioCtx = audioContextRef.current;
          if (audioCtx) {
            const current = audioCtx.currentTime - audioPlayStartTimeRef.current;
            if (current >= audioDuration) {
              setIsPlayingAudio(false);
              setAudioPlaybackTime(audioDuration);
              audioOffsetRef.current = 0;
              if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            } else {
              setAudioPlaybackTime(current);
            }
          }
        }, 100);
      }
    }
    return () => clearInterval(interval);
  }, [isPlayingAudio, audioDuration, youtubeId]);

  // Cleanup audio nodes on unmount
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch (e) {}
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

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const styleLabels: Record<string, string> = {
    'twitter-card': 'X (Twitter) Post',
    'music-dashboard': 'Music Track Visualizer',
    'realestate-card': 'Real Estate Showcase',
    'pricing-tier': 'SaaS Pricing Card',
    'analytics-widget': 'Dashboard Analytics',
  };

  const fetchGallery = async () => {
    setIsLoadingGallery(true);
    try {
      const res = await fetch('/api/visualize/list');
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

      const res = await fetch('/api/visualize/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeComponentId,
          title,
          style,
          inputData: parsedInput,
          cleanHtml,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save component');
      }

      const data = await res.json();
      if (data.success && data.component) {
        const savedId = data.component.id;
        setActiveComponentId(savedId);
        setSaveModalOpen(false);
        fetchGallery(); // Refresh the sidebar gallery list

        if (shareAfterSave) {
          const shareUrl = `${window.location.origin}/visualizer/share/${savedId}`;
          navigator.clipboard.writeText(shareUrl);
          setCopiedShareLink(true);
          showToast("Saved & Share Link Copied!", "success");
          setShareAfterSave(false);
          setTimeout(() => setCopiedShareLink(false), 2000);
        } else {
          showToast(activeComponentId ? "Visualization updated!" : "Saved to gallery!", "success");
        }
      }
    } catch (error) {
      console.error('Error saving:', error);
      showToast("Failed to save component", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteComponent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering loading the component
    if (!confirm('Are you sure you want to delete this visualization?')) return;

    try {
      const res = await fetch(`/api/visualize/delete?id=${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete component');
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
      console.error('Error deleting:', err);
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
        backgroundColor: '#09090b',
        scale: 2,
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `ai-visualizer-${style}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      showToast("PNG exported successfully", "success");
    } catch (err) {
      console.error('Failed to export PNG:', err);
      showToast("Failed to export PNG", "error");
    } finally {
      setIsExportingPng(false);
    }
  };

  const loadPreset = (key: keyof typeof DATA_PRESETS) => {
    setSelectedData(JSON.stringify(DATA_PRESETS[key].data, null, 2));
    if (key === 'music') {
      setStyle('music-dashboard');
      setSongSections((DATA_PRESETS.music.data as any).sections || []);
    } else {
      // Clear audio / youtube state when loading a non-music preset
      setAudioFile(null);
      setAudioUrl(null);
      setAudioBuffer(null);
      setIsPlayingAudio(false);
      setAudioPlaybackTime(0);
      setAudioDuration(0);
      setYoutubeId(null);
      setYoutubeTitle(null);
      setYoutubeThumbnail(null);
      setSongSections([]);
    }
    showToast(`Loaded ${DATA_PRESETS[key].name} Preset`, 'info');
  };

  const wrapHtmlWithTailwind = (htmlContent: string) => {
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
      font-family: system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 1.5rem;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
  };

  // YouTube ID extractor & API metadata fetcher
  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return match[2];
    }
    if (url.trim().length === 11 && !url.includes('/') && !url.includes('.')) {
      return url.trim();
    }
    return null;
  };

  const handleFetchYoutube = async () => {
    if (!youtubeUrl) return;
    
    const id = extractYoutubeId(youtubeUrl);
    if (!id) {
      showToast("Invalid YouTube URL or Video ID", "error");
      return;
    }
    
    setIsFetchingYoutube(true);
    showToast("Fetching video metadata...", "info");
    
    try {
      const fetchUrl = youtubeUrl.includes('/') ? youtubeUrl : `https://www.youtube.com/watch?v=${id}`;
      const res = await fetch(`/api/youtube/metadata?url=${encodeURIComponent(fetchUrl)}`);
      
      if (!res.ok) {
        throw new Error("Failed to fetch video metadata");
      }
      
      const meta = await res.json();
      
      let titleHash = 0;
      const titleStr = meta.title || "YouTube Video";
      for (let i = 0; i < titleStr.length; i++) {
        titleHash += titleStr.charCodeAt(i);
      }
      
      const bpm = 75 + (titleHash % 81);
      const keys = ["C Major", "G Major", "D Major", "A Major", "E Major", "F Major", "A Minor", "E Minor", "D Minor", "F# Minor"];
      const key = keys[titleHash % keys.length];
      const energy = (titleHash % 3 === 0) ? "High" : (titleHash % 3 === 1) ? "Moderate" : "Low";
      
      const youtubeMetadata = {
        title: titleStr,
        artist: meta.author || "YouTube Creator",
        album: "YouTube Video",
        bpm,
        key,
        energy,
        duration: "0:00", // Will update dynamically once video loads
        youtube_id: id,
        thumbnail_url: meta.thumbnail || `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
        provider: meta.provider || "YouTube"
      };
      
      setSelectedData(JSON.stringify(youtubeMetadata, null, 2));
      setStyle("music-dashboard");
      setSidebarTab("input");
      
      setYoutubeId(id);
      setYoutubeTitle(titleStr);
      setYoutubeThumbnail(meta.thumbnail || `https://img.youtube.com/vi/${id}/mqdefault.jpg`);
      
      setAudioFile(null);
      setAudioUrl(null);
      setAudioBuffer(null);
      setIsPlayingAudio(false);
      setAudioPlaybackTime(0);
      setAudioDuration(0);
      
      showToast("YouTube video loaded!", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Could not load YouTube video metadata. Using offline mock.", "error");
      
      const mockMeta = {
        title: "YouTube Video",
        artist: "YouTube Creator",
        album: "YouTube Video",
        bpm: 120,
        key: "C Major",
        energy: "Moderate",
        duration: "3:00",
        youtube_id: id,
        thumbnail_url: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
        provider: "YouTube"
      };
      
      setSelectedData(JSON.stringify(mockMeta, null, 2));
      setStyle("music-dashboard");
      setSidebarTab("input");
      
      setYoutubeId(id);
      setYoutubeTitle("YouTube Video");
      setYoutubeThumbnail(`https://img.youtube.com/vi/${id}/mqdefault.jpg`);
      
      setAudioFile(null);
      setAudioUrl(null);
      setAudioBuffer(null);
      setIsPlayingAudio(false);
      setAudioPlaybackTime(0);
      setAudioDuration(180);
    } finally {
      setIsFetchingYoutube(false);
    }
  };

  // Load YouTube Player API and initialize player
  useEffect(() => {
    if (!isMounted) return;
    if (!youtubeId) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
      return;
    }

    const initPlayer = () => {
      const el = document.getElementById('youtube-player-element');
      if (!el) {
        setTimeout(initPlayer, 100);
        return;
      }

      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (e) {}
        ytPlayerRef.current = null;
      }

      ytPlayerRef.current = new (window as any).YT.Player('youtube-player-element', {
        videoId: youtubeId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3
        },
        events: {
          onReady: async (event: any) => {
            const duration = event.target.getDuration();
            if (duration) {
              setAudioDuration(duration);
              let parsed: any = null;
              try {
                parsed = JSON.parse(selectedDataRef.current);
              } catch (e) {}
              
              const mins = Math.floor(duration / 60);
              const secs = Math.floor(duration % 60);
              const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
              
              if (parsed && parsed.youtube_id === youtubeId) {
                parsed.duration = durationStr;
                setSelectedData(JSON.stringify(parsed, null, 2));
              }

              // Trigger song structure analysis for YouTube
              try {
                setIsAnalyzingStructure(true);
                const title = parsed?.title || youtubeTitle || "YouTube Video";
                const artist = parsed?.artist || "YouTube Creator";
                const response = await fetch('/api/music/analyze', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title,
                    artist,
                    duration
                  })
                });
                if (response.ok) {
                  const result = await response.json();
                  if (result.sections) {
                    setSongSections(result.sections);
                    if (parsed && parsed.youtube_id === youtubeId) {
                      parsed.sections = result.sections;
                      setSelectedData(JSON.stringify(parsed, null, 2));
                    }
                    showToast("YouTube structure analysis complete!", "success");
                  }
                }
              } catch (err) {
                console.error("Failed to analyze YouTube structure:", err);
              } finally {
                setIsAnalyzingStructure(false);
              }
            }
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === 1) { // PLAYING
              setIsPlayingAudio(true);
              setTimeout(() => {
                startCanvasRef();
              }, 50);
            } else if (state === 2) { // PAUSED
              setIsPlayingAudio(false);
            } else if (state === 0) { // ENDED
              setIsPlayingAudio(false);
              setAudioPlaybackTime(0);
              if (ytPlayerRef.current) {
                ytPlayerRef.current.seekTo(0, true);
              }
            }
          }
        }
      });
    };

    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      const previousCallback = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        if (previousCallback) previousCallback();
        initPlayer();
      };
    } else {
      initPlayer();
    }

    return () => {
      setIsPlayingAudio(false);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
    };
  }, [youtubeId, isMounted]);

  // DSP Audio Processing
  const analyzeAudio = async (file: File) => {
    setIsAnalyzingAudio(true);
    showToast("Reading audio file...", "info");
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      
      showToast("Decoding audio data...", "info");
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      setAudioDuration(decodedBuffer.duration);
      
      showToast("Analyzing tempo & frequencies...", "info");
      
      const channelData = decodedBuffer.getChannelData(0);
      const sampleRate = decodedBuffer.sampleRate;
      
      // Calculate BPM (Beats Per Minute) - Peak detection
      const step = Math.max(1, Math.floor(channelData.length / 500000));
      let maxVal = 0;
      for (let i = 0; i < channelData.length; i += step) {
        const absVal = Math.abs(channelData[i]);
        if (absVal > maxVal) maxVal = absVal;
      }
      
      const threshold = maxVal * 0.75;
      const peaks: number[] = [];
      const minInterval = sampleRate * 0.3; // Limit peak distance (~200BPM max)
      
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
        const avgIntervalSeconds = avgIntervalSamples / sampleRate;
        bpm = Math.round(60 / avgIntervalSeconds);
        
        // Normalize estimated BPM to sensible standard range
        while (bpm < 65) bpm *= 2;
        while (bpm > 170) bpm /= 2;
        bpm = Math.round(bpm);
      }
      
      // Compute RMS (Volume Energy)
      let rmsSum = 0;
      const sampleStep = Math.max(1, Math.floor(channelData.length / 100000));
      let sampledCount = 0;
      for (let i = 0; i < channelData.length; i += sampleStep) {
        rmsSum += channelData[i] * channelData[i];
        sampledCount++;
      }
      const rms = Math.sqrt(rmsSum / sampledCount);
      const energy = rms > 0.15 ? "High" : rms > 0.05 ? "Moderate" : "Low";
      
      // Fun keys based on sample specs
      const keys = ["C Major", "G Major", "D Major", "A Major", "E Major", "F Major", "A Minor", "E Minor", "D Minor", "F# Minor"];
      const estimatedKey = keys[Math.abs(bpm + peaks.length) % keys.length];
      
      const durationMin = Math.floor(decodedBuffer.duration / 60);
      const durationSec = Math.floor(decodedBuffer.duration % 60);
      const durationStr = `${durationMin}:${durationSec < 10 ? '0' : ''}${durationSec}`;
      
      const musicMetadata = {
        title: file.name.replace(/\.[^/.]+$/, ""), // Strip extension
        artist: "Uploaded Audio",
        album: "DSP Analysis",
        bpm,
        key: estimatedKey,
        energy,
        duration: durationStr,
        file_name: file.name,
        file_size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        sample_rate: `${(sampleRate / 1000).toFixed(1)} kHz`,
        channels: decodedBuffer.numberOfChannels,
        rms_energy: parseFloat(rms.toFixed(4)),
        peak_amplitude: parseFloat(maxVal.toFixed(3))
      };
      
      setSelectedData(JSON.stringify(musicMetadata, null, 2));
      setStyle("music-dashboard");
      setSidebarTab("input");
      
      // Create local URL for HTML5 playbacks
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setAudioFile(file);
      
      showToast("Audio analysis complete!", "success");

      // Trigger song structure analysis API
      const analyzeSongStructure = async () => {
        try {
          setIsAnalyzingStructure(true);
          const response = await fetch('/api/music/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: file.name.replace(/\.[^/.]+$/, ""),
              artist: "Uploaded Audio",
              duration: decodedBuffer.duration
            })
          });
          if (response.ok) {
            const result = await response.json();
            if (result.sections) {
              setSongSections(result.sections);
              const updatedMetadata = {
                ...musicMetadata,
                sections: result.sections
              };
              setSelectedData(JSON.stringify(updatedMetadata, null, 2));
              showToast("Structure analysis complete!", "success");
            }
          }
        } catch (err) {
          console.error("Failed to analyze song structure:", err);
        } finally {
          setIsAnalyzingStructure(false);
        }
      };
      
      analyzeSongStructure();
    } catch (err: any) {
      console.error(err);
      showToast("Failed to analyze audio file.", "error");
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  // Canvas visualizer loop
  const startCanvasRef = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (youtubeId) {
      // YouTube Simulated Visualizer
      let t = 0;
      const drawSimulated = () => {
        if (!isPlayingAudio) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const numBars = 16;
          const barWidth = (canvas.width / numBars) * 1.6;
          let x = 0;
          for (let i = 0; i < numBars; i++) {
            const envelope = Math.sin((i / numBars) * Math.PI);
            let barHeight = 0.05 * envelope * canvas.height * 0.85;
            if (barHeight < 3) barHeight = 3;
            ctx.fillStyle = '#6366f1';
            ctx.beginPath();
            ctx.roundRect(x, canvas.height - barHeight, barWidth - 2, barHeight, 2);
            ctx.fill();
            x += barWidth;
          }
          return;
        }
        
        animationFrameRef.current = requestAnimationFrame(drawSimulated);
        t += 0.15;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const numBars = 16;
        const barWidth = (canvas.width / numBars) * 1.6;
        let x = 0;
        
        for (let i = 0; i < numBars; i++) {
          const sinValue = Math.sin(t + i * 0.3) * 0.4 + 0.6;
          const envelope = Math.sin((i / numBars) * Math.PI);
          const noise = Math.random() * 0.15;
          const rawVal = (sinValue + noise) * envelope;
          
          let barHeight = rawVal * canvas.height * 0.85;
          if (barHeight < 3) barHeight = 3;
          
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
          gradient.addColorStop(0, '#6366f1'); // Indigo
          gradient.addColorStop(1, '#a855f7'); // Purple
          
          ctx.fillStyle = gradient;
          
          ctx.beginPath();
          ctx.roundRect(x, canvas.height - barHeight, barWidth - 2, barHeight, 2);
          ctx.fill();
          
          x += barWidth;
        }
      };
      
      drawSimulated();
      return;
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
        if (barHeight < 3) barHeight = 3; // Keep minimal visual height
        
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, '#6366f1'); // Indigo
        gradient.addColorStop(1, '#a855f7'); // Purple
        
        ctx.fillStyle = gradient;
        
        // Draw elegant rounded bars
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - barHeight, barWidth - 2, barHeight, 2);
        ctx.fill();
        
        x += barWidth;
      }
    };
    
    draw();
  };

  const playAudio = () => {
    if (youtubeId && ytPlayerRef.current) {
      ytPlayerRef.current.playVideo();
      setIsPlayingAudio(true);
      setTimeout(() => {
        startCanvasRef();
      }, 50);
      return;
    }

    if (!audioBuffer) return;
    
    // Instantiate AudioContext if not already created
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }
    const audioCtx = audioContextRef.current;
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
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
      // Clean up when playing hits the end of track naturally
      if (audioCtx.currentTime - audioPlayStartTimeRef.current >= audioDuration - 0.1) {
        setIsPlayingAudio(false);
        setAudioPlaybackTime(0);
        audioOffsetRef.current = 0;
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      }
    };

    setIsPlayingAudio(true);
    
    setTimeout(() => {
      startCanvasRef();
    }, 50);
  };
  
  const pauseAudio = () => {
    if (youtubeId && ytPlayerRef.current) {
      ytPlayerRef.current.pauseVideo();
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
    
    audioOffsetRef.current = audioCtx.currentTime - audioPlayStartTimeRef.current;
    setIsPlayingAudio(false);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const handleSeek = (newTime: number) => {
    audioOffsetRef.current = newTime;
    setAudioPlaybackTime(newTime);
    
    if (youtubeId && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(newTime, true);
      return;
    }

    if (isPlayingAudio) {
      playAudio();
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const addHistoryItem = (clean: string, wrapped: string, description: string) => {
    const newItem: HistoryItem = {
      cleanHtml: clean,
      html: wrapped,
      description,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    const updatedHistory = [...history.slice(0, historyIndex + 1), newItem];
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
    
    setCleanHtml(clean);
    setGeneratedHtml(wrapped);
    setEditedCode(clean);
  };

  const handleGenerate = async () => {
    if (!selectedData) return;
    setIsGenerating(true);
    
    try {
      let parsedData = selectedData;
      try {
        parsedData = JSON.parse(selectedData);
      } catch (e) {
        // Leave as string if not valid JSON
      }

      const payloadStyle = customStyleHint 
        ? `${style} (Design instructions: ${customStyleHint})`
        : style;

      const res = await fetch('/api/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputData: parsedData, style: payloadStyle })
      });

      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      
      if (data.cleanHtml && data.html) {
        const styleName = style.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        addHistoryItem(data.cleanHtml, data.html, `Initial Generation (${styleName})`);
        showToast('Successfully generated UI component');
      } else {
        throw new Error('Invalid API response structure');
      }
    } catch (error) {
      console.error(error);
      showToast('Failed to generate component.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!refinementPrompt || !cleanHtml) return;

    setIsRefining(true);
    const instruction = refinementPrompt;
    setRefinementPrompt(''); // Clear input

    try {
      const res = await fetch('/api/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previousHtml: cleanHtml,
          iterationInstruction: instruction
        })
      });

      if (!res.ok) throw new Error('Refinement request failed');
      const data = await res.json();

      if (data.cleanHtml && data.html) {
        addHistoryItem(data.cleanHtml, data.html, `Refined: "${instruction}"`);
        showToast('Component updated!');
      } else {
        throw new Error('Invalid API response structure');
      }
    } catch (error) {
      console.error(error);
      showToast('Failed to apply refinement instructions.', 'error');
    } finally {
      setIsRefining(false);
    }
  };

  const navigateHistory = (index: number) => {
    if (index >= 0 && index < history.length) {
      setHistoryIndex(index);
      const item = history[index];
      setCleanHtml(item.cleanHtml);
      setGeneratedHtml(item.html);
      setEditedCode(item.cleanHtml);
      showToast(`Reverted to version ${index + 1}`, 'info');
    }
  };

  const handleCopyCode = () => {
    if (!cleanHtml) return;
    navigator.clipboard.writeText(cleanHtml);
    showToast('HTML code copied to clipboard!');
  };

  const handleDownload = () => {
    if (!cleanHtml) return;
    const blob = new Blob([wrapHtmlWithTailwind(cleanHtml)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-component-${style}-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Download started');
  };

  const resetAll = () => {
    // Clean audio playback nodes
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
    }
    setIsPlayingAudio(false);
    setAudioFile(null);
    setAudioBuffer(null);
    setAudioPlaybackTime(0);
    audioOffsetRef.current = 0;
    
    setCleanHtml(null);
    setGeneratedHtml(null);
    setEditedCode('');
    setHistory([]);
    setHistoryIndex(-1);
    setSongSections([]);
    showToast('Workspace reset complete');
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
          {toast.type === 'success' && <Check className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <HelpCircle className="w-4 h-4 text-rose-400" />}
          {toast.type === 'info' && <Sparkles className="w-4 h-4 text-indigo-400" />}
          <span className="text-zinc-200 font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="h-14 border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md px-6 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Palette className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              AI Visualizer Studio
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded font-mono">v1.3</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {cleanHtml && (
            <button
              onClick={resetAll}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800/80 text-xs font-semibold text-zinc-400 hover:text-white transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 h-[calc(100vh-56px)] overflow-hidden">
        
        {/* Left Side: Control Panel */}
        <div className="w-[420px] shrink-0 border-r border-zinc-800/80 bg-zinc-900/20 flex flex-col h-full overflow-hidden">
          
          {/* Navigation Tabs for input */}
          <div className="flex border-b border-zinc-800/80 shrink-0 p-2 gap-1 bg-zinc-950/40">
            <button
              onClick={() => setSidebarTab('input')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                sidebarTab === 'input' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Database className="w-3.5 h-3.5" /> 1. Input Data
            </button>
            <button
              onClick={() => setSidebarTab('style')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                sidebarTab === 'style' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" /> 2. Style Options
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {sidebarTab === 'input' ? (
              /* TAB 1: Input Data Selection and Code Editor */
              <div className="space-y-4">
                
                {/* Real-time Audio DSP analysis drag-drop box */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Analyze Audio File</h3>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragAudio(true); }}
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
                        ? 'border-indigo-500 bg-indigo-600/10 text-indigo-400 shadow-md shadow-indigo-500/5' 
                        : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 text-zinc-400 hover:text-zinc-350'
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
                        <span className="text-xs font-semibold text-zinc-300">Extracting Waveform & BPM...</span>
                      </>
                    ) : (
                      <>
                        <Headphones className="w-5 h-5 text-indigo-400" />
                        <div className="text-xs">
                          <p className="font-semibold text-zinc-350">Drop MP3/WAV file here</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">Automates BPM estimation & energy analysis</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* YouTube Link Analyzer */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Youtube className="w-3.5 h-3.5 text-red-500" />
                    Load from YouTube
                  </h3>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Paste YouTube Video URL..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        className="w-full pl-3 pr-8 py-2.5 bg-zinc-900/40 border border-zinc-800 focus:border-red-500 rounded-xl text-xs text-zinc-300 focus:outline-none placeholder-zinc-600 transition-colors"
                        disabled={isFetchingYoutube}
                      />
                      {youtubeUrl && (
                        <button
                          onClick={() => setYoutubeUrl('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs font-bold"
                          type="button"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <button
                      onClick={handleFetchYoutube}
                      disabled={isFetchingYoutube || !youtubeUrl}
                      className="px-3.5 bg-red-650 hover:bg-red-600 active:bg-red-700 disabled:bg-zinc-850 disabled:text-zinc-600 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center shrink-0"
                    >
                      {isFetchingYoutube ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        'Fetch'
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500">Imports metadata, thumbnail, & streams playback</p>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Presets</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(DATA_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => loadPreset(key as keyof typeof DATA_PRESETS)}
                        className="px-3 py-2.5 bg-zinc-900/60 border border-zinc-800 hover:border-indigo-500 hover:bg-zinc-800/40 rounded-xl text-left transition-all text-xs flex items-center gap-2 group"
                      >
                        <span className="text-base">{preset.icon}</span>
                        <div className="overflow-hidden">
                          <p className="font-semibold text-zinc-300 group-hover:text-white truncate">{preset.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {dataSources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Recent Database Posts</p>
                      <div className="flex gap-2">
                        {dataSources.map((post, i) => (
                          <button
                            key={post.id}
                            onClick={() => {
                              setSelectedData(JSON.stringify(post, null, 2));
                              showToast(`Loaded Database Post #${i+1}`, 'info');
                            }}
                            className="flex-1 py-1.5 px-2.5 bg-zinc-900 border border-zinc-855 hover:border-zinc-700 hover:bg-zinc-800/40 text-[11px] text-zinc-400 hover:text-zinc-200 rounded-lg truncate text-center"
                          >
                            DB Post {i+1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-zinc-800/60 my-4" />

                {/* Saved Gallery Section */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                    <span>Saved Gallery</span>
                    {isLoadingGallery && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
                  </h3>

                  {savedComponents.length === 0 ? (
                    <div className="border border-dashed border-zinc-800 p-4 rounded-xl text-center text-zinc-600 text-[11px]">
                      No saved components yet. Design something and click "Save to Gallery"!
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {savedComponents.map((comp) => {
                        const styleIcon = DATA_PRESETS[comp.style as keyof typeof DATA_PRESETS]?.icon || "🎨";
                        const isCurrent = activeComponentId === comp.id;
                        return (
                          <div
                            key={comp.id}
                            onClick={() => {
                              setActiveComponentId(comp.id);
                              setStyle(comp.style);
                              setSelectedData(JSON.stringify(comp.inputData, null, 2));
                              setCleanHtml(comp.cleanHtml);
                              setGeneratedHtml(wrapHtmlWithTailwind(comp.cleanHtml));
                              setEditedCode(comp.cleanHtml);
                              showToast(`Loaded "${comp.title}"`, 'info');
                            }}
                            className={`group w-full px-3 py-2 border rounded-xl text-left transition-all text-xs flex items-center justify-between cursor-pointer ${
                              isCurrent
                                ? 'bg-indigo-950/20 border-indigo-500 text-white shadow-sm'
                                : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-850/40 hover:text-zinc-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-base shrink-0">{styleIcon}</span>
                              <div className="truncate">
                                <p className={`font-semibold truncate ${isCurrent ? 'text-indigo-400' : 'text-zinc-300'}`}>
                                  {comp.title}
                                </p>
                                <p className="text-[9px] text-zinc-500 font-medium">
                                  {styleLabels[comp.style] || comp.style}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteComponent(comp.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-855 text-zinc-500 hover:text-rose-400 rounded transition-all shrink-0 ml-1.5"
                              title="Delete Visualization"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Song Structure Analysis Dashboard */}
                {(isAnalyzingStructure || (songSections && songSections.length > 0)) && (
                  <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Song Structure Analysis</h4>
                        <p className="text-[10px] text-zinc-500">Analyzed by Gemini 3.5 Flash</p>
                      </div>
                      {isAnalyzingStructure && (
                        <div className="flex items-center gap-1.5 text-xs text-indigo-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Analyzing...</span>
                        </div>
                      )}
                    </div>

                    {!isAnalyzingStructure && songSections && songSections.length > 0 && (
                      <div className="space-y-4">
                        {/* 1. Timeline Bar */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] text-zinc-500">
                            <span>Timeline</span>
                            <span>Click blocks to seek</span>
                          </div>
                          <div className="h-8 w-full flex bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800/80 p-0.5 gap-0.5">
                            {songSections.map((sec, idx) => {
                              const colors = getSectionColor(sec.name);
                              const duration = sec.endTime - sec.startTime;
                              const isActive = audioPlaybackTime >= sec.startTime && audioPlaybackTime < sec.endTime;
                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleSeek(sec.startTime)}
                                  style={{ flexGrow: Math.max(1, duration) }}
                                  className={`h-full rounded-md transition-all relative group cursor-pointer ${colors.bg} ${
                                    isActive 
                                      ? 'ring-2 ring-white scale-[1.02] z-10 shadow-md shadow-white/10' 
                                      : 'opacity-85 hover:opacity-100 hover:scale-[1.01]'
                                  }`}
                                  title={`${sec.name} (${sec.label}): ${formatTime(sec.startTime)} - ${formatTime(sec.endTime)}`}
                                >
                                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-black/45 rounded-md">
                                    {sec.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 2. Energy Level Graph */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] text-zinc-500">
                            <span>Energy Profile</span>
                            <span>Intensity (1-5)</span>
                          </div>
                          <div className="h-12 w-full flex items-end bg-zinc-950 rounded-lg border border-zinc-800/80 p-1 gap-0.5">
                            {songSections.map((sec, idx) => {
                              const colors = getSectionColor(sec.name);
                              const duration = sec.endTime - sec.startTime;
                              const isActive = audioPlaybackTime >= sec.startTime && audioPlaybackTime < sec.endTime;
                              const pctHeight = (sec.energy / 5) * 100;
                              return (
                                <div
                                  key={idx}
                                  style={{ flexGrow: Math.max(1, duration) }}
                                  className="h-full flex items-end cursor-pointer group"
                                  onClick={() => handleSeek(sec.startTime)}
                                >
                                  <div
                                    style={{ height: `${pctHeight}%` }}
                                    className={`w-full rounded-t transition-all ${colors.bg} ${
                                      isActive 
                                        ? 'opacity-100 shadow-md shadow-indigo-500/20' 
                                        : 'opacity-40 group-hover:opacity-75'
                                    }`}
                                    title={`${sec.name} Energy: ${sec.energy}/5`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 3. Sections Table */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Sections Detailed List</label>
                          <div className="max-h-60 overflow-y-auto border border-zinc-805 rounded-lg bg-black/40">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-850 bg-zinc-900/30 text-zinc-500 text-[10px] uppercase font-bold">
                                  <th className="py-2 px-3 w-8">#</th>
                                  <th className="py-2 px-2">Section</th>
                                  <th className="py-2 px-2">Time</th>
                                  <th className="py-2 px-2 text-center">Energy</th>
                                  <th className="py-2 px-3">Note/Lyrics</th>
                                </tr>
                              </thead>
                              <tbody>
                                {songSections.map((sec, idx) => {
                                  const colors = getSectionColor(sec.name);
                                  const isActive = audioPlaybackTime >= sec.startTime && audioPlaybackTime < sec.endTime;
                                  const rowDuration = Math.round(sec.endTime - sec.startTime);
                                  return (
                                    <tr
                                      key={idx}
                                      onClick={() => handleSeek(sec.startTime)}
                                      className={`border-b border-zinc-900/60 transition-colors cursor-pointer group hover:bg-zinc-800/20 ${
                                        isActive 
                                          ? 'bg-zinc-800/40 text-white font-medium border-l-2 border-indigo-500' 
                                          : 'text-zinc-400 hover:text-zinc-200 border-l-2 border-transparent'
                                      }`}
                                    >
                                      <td className="py-2 px-3 font-mono opacity-60 text-[10px]">{idx + 1}</td>
                                      <td className="py-2 px-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`w-2 h-2 rounded-full shrink-0 ${colors.bg}`} />
                                          <div className="flex flex-col">
                                            <span className="font-semibold text-zinc-200 group-hover:text-white leading-tight">{sec.name}</span>
                                            <span className="text-[10px] text-zinc-500 leading-tight">{sec.label}</span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-2 px-2 font-mono text-[10px] whitespace-nowrap">
                                        <div>{formatTime(sec.startTime)} - {formatTime(sec.endTime)}</div>
                                        <div className="text-[9px] text-zinc-500">{rowDuration}s</div>
                                      </td>
                                      <td className="py-2 px-2 text-center whitespace-nowrap">
                                        {renderEnergyStars(sec.energy)}
                                      </td>
                                      <td className="py-2 px-3 text-[10px] text-zinc-400 group-hover:text-zinc-300 italic max-w-[120px] truncate" title={sec.note}>
                                        {sec.note}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Raw Data (JSON/Text)</label>
                    <button 
                      onClick={() => {
                        try {
                          setSelectedData(JSON.stringify(JSON.parse(selectedData), null, 2));
                          showToast('Formatted JSON');
                        } catch (e) {
                          showToast('Invalid JSON structure', 'error');
                        }
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      Format JSON
                    </button>
                  </div>
                  <div className="border border-zinc-850 rounded-xl overflow-hidden bg-black/40 h-64 shadow-inner">
                    <Editor
                      height="100%"
                      defaultLanguage="json"
                      theme="vs-dark"
                      value={selectedData}
                      onChange={(val) => setSelectedData(val || '')}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 11,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        padding: { top: 8, bottom: 8 },
                        backgroundColor: '#09090b',
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* TAB 2: Style Selector and Advanced Hints */
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block">Target Layout Style</label>
                  <div className="space-y-2">
                    {[
                      { id: 'music-dashboard', title: '🎵 Music Player Dashboard', desc: 'Spotify/Apple Music audio controllers, track details, BPM stats.' },
                      { id: 'twitter-card', title: '🐦 Social Media Poster (16:9)', desc: 'Quotes, tweets, or statements in a poster layout.' },
                      { id: 'real-estate', title: '🏠 Real Estate Card', desc: 'Property listing with price, photos, and key specs.' },
                      { id: 'dashboard-widget', title: '📊 Analytical Dashboard Widget', desc: 'Complex graphs, stats charts, metrics, and trends.' },
                      { id: 'magazine-article', title: '📄 Editorial Magazine Layout', desc: 'Newspaper columns, header text, and stylish editorial feel.' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setStyle(item.id)}
                        className={`w-full p-3.5 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                          style === item.id 
                            ? 'bg-indigo-600/10 border-indigo-500 shadow-md shadow-indigo-500/5' 
                            : 'bg-zinc-900/40 border-zinc-850 hover:border-zinc-700 hover:bg-zinc-800/20'
                        }`}
                      >
                        <p className={`text-xs font-bold ${style === item.id ? 'text-indigo-400' : 'text-zinc-200'}`}>
                          {item.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 leading-normal">{item.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Design Directives (Optional)</label>
                  <textarea
                    className="w-full h-24 p-3 bg-zinc-950 border border-zinc-850 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 placeholder-zinc-650 transition-colors"
                    value={customStyleHint}
                    onChange={(e) => setCustomStyleHint(e.target.value)}
                    placeholder="e.g., Cyberpunk dark theme with neon purple accents, glassmorphism card, rounded borders, Outfit google font..."
                  />
                </div>
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isRefining || !selectedData}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-850 disabled:text-zinc-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98] flex items-center justify-center gap-2 group relative overflow-hidden shrink-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating UI Code...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-indigo-200 group-hover:animate-pulse" />
                  Generate UI Component
                </>
              )}
            </button>

            {/* Iterative AI Refine Input Section */}
            {cleanHtml && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Refine Design with AI
                  </h4>
                  <form onSubmit={handleRefine} className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-850 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
                      value={refinementPrompt}
                      onChange={(e) => setRefinementPrompt(e.target.value)}
                      placeholder="e.g., change background to gold, add a footer..."
                      disabled={isRefining || isGenerating}
                    />
                    <button
                      type="submit"
                      disabled={isRefining || isGenerating || !refinementPrompt}
                      className="px-3 bg-zinc-900 border border-zinc-800 hover:border-indigo-500 disabled:bg-zinc-855 disabled:border-transparent text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center"
                    >
                      {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    </button>
                  </form>
                </div>

                {/* History Timeline */}
                {history.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-zinc-500">
                      <span className="font-bold uppercase tracking-wider">Version History</span>
                      <span>{historyIndex + 1} of {history.length}</span>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 border border-zinc-850/60 rounded-xl p-2.5 bg-zinc-950/40">
                      {history.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => navigateHistory(idx)}
                          className={`w-full p-2 rounded-lg text-left text-xs transition-all flex items-start gap-2 ${
                            idx === historyIndex 
                              ? 'bg-indigo-600/10 border border-indigo-500/30 text-zinc-200 font-medium' 
                              : 'border border-transparent hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            idx === historyIndex ? 'bg-indigo-400 animate-pulse' : 'bg-zinc-700'
                          }`} />
                          <div className="overflow-hidden flex-1">
                            <p className="truncate text-[11px] leading-tight">{item.description}</p>
                            <p className="text-[9px] opacity-60 mt-0.5">{item.timestamp}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Output Canvas / Preview Panel */}
        <div className="flex-1 flex flex-col bg-zinc-950 relative overflow-hidden h-full">
          
          {/* Action Toolbar */}
          <div className="h-12 border-b border-zinc-800/80 bg-zinc-900/20 px-6 flex items-center justify-between shrink-0 text-zinc-300">
            <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'preview' 
                    ? 'bg-zinc-800 text-white shadow-sm' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Preview
              </button>
              <button
                onClick={() => setActiveTab('code')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'code' 
                    ? 'bg-zinc-800 text-white shadow-sm' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Code className="w-3.5 h-3.5" /> Code HTML
              </button>
              <button
                onClick={() => {
                  setActiveTab('html-anything');
                  setTimeout(() => {
                    handleSyncToHtmlAnything();
                  }, 400);
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'html-anything' 
                    ? 'bg-zinc-800 text-white shadow-sm' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-400" /> HTML Anything
              </button>
            </div>

            {activeTab === 'html-anything' && (
              <button
                onClick={handleSyncToHtmlAnything}
                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(99,102,241,0.3)] border border-indigo-500/20 animate-fade-in"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Sync Data
              </button>
            )}

            {/* Viewport size buttons (Only visible in Preview tab) */}
            {activeTab === 'preview' && cleanHtml && (
              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setViewportWidth('100%')}
                  className={`p-1.5 rounded-md transition-all ${viewportWidth === '100%' ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="Desktop (Full Width)"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewportWidth('768px')}
                  className={`p-1.5 rounded-md transition-all ${viewportWidth === '768px' ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="Tablet (768px)"
                >
                  <Tablet className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewportWidth('667px')}
                  className={`p-1.5 rounded-md transition-all ${viewportWidth === '667px' ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="Mobile Landscape (667px)"
                >
                  <Smartphone className="w-3.5 h-3.5 rotate-90" />
                </button>
                <button
                  onClick={() => setViewportWidth('375px')}
                  className={`p-1.5 rounded-md transition-all ${viewportWidth === '375px' ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="Mobile Portrait (375px)"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-zinc-550 border-l border-zinc-800 pl-2 pr-1.5 font-mono">
                  {viewportWidth === '100%' ? 'Desktop' : viewportWidth}
                </span>
              </div>
            )}

            {/* Actions for generated HTML */}
            <div className="flex items-center gap-2">
              {cleanHtml && (
                <>
                  <button
                    onClick={() => {
                      setSaveTitle(saveTitle || `My ${styleLabels[style] || style}`);
                      setSaveModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5"
                    title="Save to Gallery"
                  >
                    <Save className="w-3.5 h-3.5" /> 
                    <span>{activeComponentId ? 'Update' : 'Save to Gallery'}</span>
                  </button>

                  <button
                    onClick={handleShareLink}
                    className="px-3 py-1.5 rounded-lg border border-indigo-900/50 hover:border-indigo-850 bg-indigo-950/20 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-all flex items-center gap-1.5"
                    title="Copy shareable sandbox URL"
                  >
                    {copiedShareLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    <span>{copiedShareLink ? 'Link Copied!' : 'Share Link'}</span>
                  </button>

                  <button
                    onClick={handleExportPng}
                    disabled={isExportingPng}
                    className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 disabled:opacity-50"
                    title="Export static PNG image"
                  >
                    {isExportingPng ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>{isExportingPng ? 'Exporting...' : 'Export PNG'}</span>
                  </button>

                  <button
                    onClick={handleCopyCode}
                    className="p-2 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white transition-all"
                    title="Copy Component HTML"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-zinc-100/5 active:scale-[0.98]"
                    title="Download HTML File"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Sandbox Canvas */}
          <div className="flex-1 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:20px_20px] bg-zinc-950 overflow-hidden flex flex-col items-center justify-center p-6 relative pb-24">
            
            {activeTab === 'html-anything' ? (
              /* HTML ANYTHING TAB */
              <div className="w-full h-full bg-zinc-900 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 flex flex-col relative">
                <iframe
                  ref={htmlAnythingIframeRef}
                  src={typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '/html-anything' : 'http://localhost:3000'}
                  className="w-full h-full border-none bg-zinc-950"
                  title="HTML Anything Workspace"
                />
              </div>
            ) : activeTab === 'preview' ? (
              /* PREVIEW TAB */
              generatedHtml ? (
                <div 
                  className="h-full bg-zinc-900 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 flex flex-col relative w-full"
                  style={{ width: viewportWidth }}
                >
                  {/* Small Browser Address Bar mockup for viewports */}
                  {viewportWidth !== '100%' && (
                    <div className="bg-zinc-950 border-b border-zinc-850 px-3 py-1.5 flex items-center gap-2 shrink-0">
                      <div className="flex gap-1.5 shrink-0">
                        <div className="w-2 h-2 rounded-full bg-rose-500/60" />
                        <div className="w-2 h-2 rounded-full bg-amber-500/60" />
                        <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
                      </div>
                      <div className="flex-1 bg-zinc-900 border border-zinc-850 rounded text-[9px] text-zinc-500 py-0.5 px-2 text-center select-none truncate">
                        local-component-preview
                      </div>
                    </div>
                  )}
                  <iframe
                    ref={iframeRef}
                    srcDoc={generatedHtml}
                    className="w-full flex-1 border-none bg-zinc-950"
                    sandbox="allow-scripts"
                    title="AI Generated UI Preview"
                  />
                </div>
              ) : (
                /* Empty State (Preview) */
                <div className="text-center text-zinc-500 flex flex-col items-center gap-4 animate-pulse">
                  <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
                    <Palette className="w-8 h-8 text-zinc-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-zinc-400">Design Preview Space</p>
                    <p className="text-xs text-zinc-650 max-w-sm">Provide some data on the left panel and click generate to preview your Tailwind component.</p>
                  </div>
                </div>
              )
            ) : (
              /* CODE TAB */
              cleanHtml ? (
                <div className="w-full h-full border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl bg-black">
                  <div className="bg-zinc-950 border-b border-zinc-850 px-4 py-2 flex justify-between items-center shrink-0">
                    <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-indigo-400" /> component.html (Editable)
                    </span>
                    <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">
                      Changes auto-sync to preview
                    </span>
                  </div>
                  <div className="h-[calc(100%-36px)]">
                    <Editor
                      height="100%"
                      defaultLanguage="html"
                      theme="vs-dark"
                      value={editedCode}
                      onChange={(val) => setEditedCode(val || '')}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        padding: { top: 12, bottom: 12 },
                      }}
                    />
                  </div>
                </div>
              ) : (
                /* Empty State (Code) */
                <div className="text-center text-zinc-500 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
                    <Code className="w-8 h-8 text-zinc-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-zinc-400">No Code Available</p>
                    <p className="text-xs text-zinc-650 max-w-sm">Generating a component will output beautiful clean HTML code that you can inspect and manually edit here.</p>
                  </div>
                </div>
              )
            )}

            {/* Glassmorphic Playback visualizer controller bar at bottom of preview canvas */}
            {activeTab === 'preview' && (audioFile || youtubeId) && (
              <div className="absolute bottom-4 left-4 right-4 bg-zinc-900/80 border border-zinc-800/80 px-4 py-3 rounded-2xl flex items-center justify-between backdrop-blur-md shadow-xl z-20 gap-4">
                
                {/* Audio file or YouTube video name detail */}
                <div className="flex items-center gap-3 w-1/3 min-w-0">
                  {youtubeId ? (
                    youtubeThumbnail ? (
                      <img 
                        src={youtubeThumbnail} 
                        alt={youtubeTitle || "Video cover"} 
                        className="w-9 h-9 rounded-lg object-cover border border-zinc-800 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                        <Youtube className="w-4.5 h-4.5" />
                      </div>
                    )
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                      <Music className="w-4.5 h-4.5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {youtubeId ? (youtubeTitle || "YouTube Audio") : (audioFile ? audioFile.name : "")}
                    </p>
                    <p className="text-[9px] text-zinc-400 font-medium">
                      {youtubeId ? "YouTube Stream" : "BPM Estimated"}
                    </p>
                  </div>
                </div>
                
                {/* Play/Pause progress slider */}
                <div className="flex-1 max-w-md flex flex-col items-center gap-1.5">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={isPlayingAudio ? pauseAudio : playAudio}
                      className="w-8 h-8 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      {isPlayingAudio ? <Pause className="w-4 h-4 fill-zinc-950 text-zinc-950" /> : <Play className="w-4 h-4 fill-zinc-950 text-zinc-950 ml-0.5" />}
                    </button>
                  </div>
                  
                  <div className="w-full flex items-center gap-2.5">
                    <span className="text-[9px] font-mono text-zinc-550 min-w-[28px] text-right">{formatTime(audioPlaybackTime)}</span>
                    <input
                      type="range"
                      min={0}
                      max={audioDuration || 1}
                      step={0.1}
                      value={audioPlaybackTime}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
                    />
                    <span className="text-[9px] font-mono text-zinc-550 min-w-[28px]">{formatTime(audioDuration)}</span>
                  </div>
                </div>
                
                {/* YouTube player and Real-time spectrum visualizer canvas */}
                <div className="w-1/3 flex justify-end items-center gap-3">
                  {youtubeId && (
                    <div className="w-[120px] h-[67px] rounded-lg overflow-hidden border border-zinc-800 bg-black relative shrink-0">
                      <div id="youtube-player-element" className="w-full h-full" />
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    width={110}
                    height={28}
                    className="bg-black/40 rounded-lg border border-zinc-850/60"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Save to Gallery Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Save Component to Gallery</h3>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500">Component Title</label>
              <input
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="e.g. My Modern X Post"
                className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl text-xs text-white focus:outline-none transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveTitle.trim()) {
                    handleSaveComponent(saveTitle);
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  setSaveModalOpen(false);
                  setSaveTitle('');
                  setShareAfterSave(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white bg-transparent border border-zinc-800 hover:bg-zinc-800 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveComponent(saveTitle)}
                disabled={isSaving || !saveTitle.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-zinc-850 rounded-xl shadow-md shadow-indigo-600/10 hover:shadow-indigo-500/20 transition-all flex items-center gap-1.5"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
