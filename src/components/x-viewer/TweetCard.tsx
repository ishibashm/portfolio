'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Heart, MessageCircle, Repeat2, Share, ExternalLink, X, Palette } from 'lucide-react';
import { Tweet } from 'react-tweet';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

interface TweetCardProps {
  post: {
    id: string;
    url: string;
    author_handle: string;
    author_display: string;
    datetime: string;
    text: string;
    quoted_urls?: string[];
    external_links?: string[];
    saved_media?: string[];
  };
}

export default function TweetCard({ post }: TweetCardProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const router = useRouter();

  const handleVisualizeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Save to session storage so the visualizer can automatically pick it up
    sessionStorage.setItem('visualizer_input_data', JSON.stringify(post, null, 2));
    router.push('/visualizer');
  };

  // 権利関係（Xの利用規約および著作権）に配慮し、本番環境では公式の埋め込みを利用する
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="border-b border-gray-200 dark:border-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors flex flex-col items-center w-full">
        <div className="w-full max-w-md bg-zinc-900/10 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 mb-2 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs">✨</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Visualize this post with AI Studio</span>
          </div>
          <button
            onClick={handleVisualizeClick}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-600/10 cursor-pointer active:scale-95"
          >
            <Palette size={12} />
            Visualize
          </button>
        </div>
        <div className="w-full max-w-md">
          <Tweet id={post.id} />
        </div>
      </div>
    );
  }

  // Extract display name and remove handle if it's appended (e.g., "Name @handle")
  const authorName = post.author_display.split(' @')[0];
  const postDate = new Date(post.datetime);
  const formattedDate = format(postDate, 'MMM d, yyyy');

  // Regex to detect URLs and make them clickable
  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a 
            key={index} 
            href={part} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part.length > 30 ? part.substring(0, 30) + '...' : part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const handleCardClick = () => {
    window.open(post.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div 
        onClick={handleCardClick}
        className="border-b border-gray-200 dark:border-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer transition-colors"
      >
        <div className="flex space-x-3">
          {/* Avatar Placeholder */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-500 dark:text-gray-400">
              {post.author_handle.charAt(0).toUpperCase()}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-bold text-gray-900 dark:text-gray-100 truncate">
                {authorName}
              </span>
              <span className="truncate">@{post.author_handle}</span>
              <span>·</span>
              <span className="whitespace-nowrap">{formattedDate}</span>
            </div>

            {/* Text Content */}
            <div className="mt-1 text-gray-900 dark:text-gray-100 whitespace-pre-wrap text-[15px] leading-normal break-words">
              {renderTextWithLinks(post.text)}
            </div>

            {/* Media Grid */}
            {post.saved_media && post.saved_media.length > 0 && (
              <div className={`mt-3 grid gap-2 ${post.saved_media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {post.saved_media.map((mediaPath, index) => {
                  // Ensure proper path separator for web
                  const normalizedPath = mediaPath.replace(/\\/g, '/');
                  const mediaUrl = `/api/local-media?path=${encodeURIComponent(normalizedPath)}`;
                  return (
                    <div 
                      key={index} 
                      className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 aspect-video cursor-zoom-in"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImage(mediaUrl);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={mediaUrl}
                        alt="Tweet media"
                        className="absolute inset-0 w-full h-full object-cover hover:opacity-90 transition-opacity"
                        loading="lazy"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quoted URLs (Fallback if any) */}
            {post.quoted_urls && post.quoted_urls.length > 0 && (
               <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                 <div className="text-sm text-gray-500 flex items-center gap-1 mb-1">
                   <ExternalLink size={14} /> Quoted / Referenced
                 </div>
                 {post.quoted_urls.map((url, i) => (
                   <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline block text-sm truncate" onClick={e => e.stopPropagation()}>
                     {url}
                   </a>
                 ))}
               </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between items-center mt-3 text-gray-500 dark:text-gray-400 max-w-md">
              <button className="flex items-center space-x-2 hover:text-blue-500 group transition-colors">
                <div className="p-2 rounded-full group-hover:bg-blue-500/10 transition-colors">
                  <MessageCircle size={18} />
                </div>
              </button>
              <button className="flex items-center space-x-2 hover:text-green-500 group transition-colors">
                <div className="p-2 rounded-full group-hover:bg-green-500/10 transition-colors">
                  <Repeat2 size={18} />
                </div>
              </button>
              <button className="flex items-center space-x-2 hover:text-pink-500 group transition-colors">
                <div className="p-2 rounded-full group-hover:bg-pink-500/10 transition-colors">
                  <Heart size={18} />
                </div>
              </button>
              <button 
                onClick={handleVisualizeClick}
                className="flex items-center space-x-2 text-indigo-500 hover:text-indigo-400 group transition-colors"
                title="Send to AI Visualizer"
              >
                <div className="p-2 rounded-full bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors">
                  <Palette size={18} />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Image Modal */}
      {selectedImage && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setSelectedImage(null)}
        >
          <button 
            className="absolute top-4 left-4 p-2 text-white bg-black/50 hover:bg-white/20 rounded-full transition-colors"
            onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
          >
            <X size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={selectedImage} 
            alt="Fullscreen media" 
            className="max-w-full max-h-[95vh] object-contain select-none shadow-2xl"
          />
        </div>,
        document.body
      )}
    </>
  );
}
