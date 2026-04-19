"use client";

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Search, Loader2, ArrowUpRight, TrendingUp, MessageSquare, Repeat2, Heart, Share } from 'lucide-react';

interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  author: {
    name: string;
    username: string;
    profileImageUrl?: string;
  };
  metrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

export function TwitterFeed({ initialQuery = "finance", type = "search" }: { initialQuery?: string, type?: 'search' | 'user' }) {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [searchType, setSearchType] = useState<'search' | 'user'>(type);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTweets = async () => {
    if (!query) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/twitter?q=${encodeURIComponent(query)}&type=${searchType}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch tweets');
      }
      
      if (data.tweets && data.tweets.length > 0) {
        setTweets(data.tweets);
      } else {
        setTweets([]);
        setError('No tweets found for this query.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while fetching tweets.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      fetchTweets();
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header & Search Bar */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-zinc-100">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
              <g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.96H5.078z"></path></g>
            </svg>
            <h2 className="font-semibold tracking-tight">Social Intelligence</h2>
          </div>
          <div className="flex gap-2 bg-zinc-800/50 p-1 rounded-lg">
            <button 
              onClick={() => setSearchType('search')}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${searchType === 'search' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Keyword
            </button>
            <button 
              onClick={() => setSearchType('user')}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${searchType === 'user' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              User
            </button>
          </div>
        </div>
        
        <div className="relative mt-3">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-zinc-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-16 py-2 border border-zinc-700 rounded-lg leading-5 bg-zinc-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
            placeholder={searchType === 'search' ? "Search keywords, cashtags ($AAPL)..." : "Enter username (no @)"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center">
            <button 
              onClick={fetchTweets}
              disabled={loading || !query}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center justify-center w-14"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Fetch'}
            </button>
          </div>
        </div>
      </div>

      {/* Feed Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/20">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-400 bg-red-950/20 border border-red-900/50 rounded-lg">
            {error}
          </div>
        )}

        {tweets.length === 0 && !loading && !error ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4 opacity-70">
            <svg viewBox="0 0 24 24" className="w-12 h-12 fill-current opacity-20" aria-hidden="true">
              <g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.96H5.078z"></path></g>
            </svg>
            <p className="text-sm">Enter a query to start monitoring the social feed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tweets.map((tweet) => (
              <div key={tweet.id} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-4 rounded-xl transition-all duration-200">
                <div className="flex items-start gap-3">
                  {/* Avatar Placeholder */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 shrink-0 flex items-center justify-center text-white font-bold">
                    {tweet.author?.name?.charAt(0) || 'X'}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-zinc-200 truncate">{tweet.author?.name || 'Unknown'}</span>
                        <span className="text-sm text-zinc-500 truncate">@{tweet.author?.username || 'unknown'}</span>
                      </div>
                      <a 
                        href={`https://twitter.com/${tweet.author?.username}/status/${tweet.id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-500 hover:text-blue-400 flex items-center gap-1 transition-colors shrink-0"
                      >
                        {format(new Date(tweet.createdAt), 'MMM d')} <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                    
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                      {tweet.text}
                    </p>
                    
                    <div className="flex items-center gap-6 mt-4 text-zinc-500">
                      <div className="flex items-center gap-1.5 hover:text-blue-400 cursor-pointer transition-colors">
                        <MessageSquare className="w-4 h-4" />
                        <span className="text-xs">{tweet.metrics?.reply_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 hover:text-emerald-400 cursor-pointer transition-colors">
                        <Repeat2 className="w-4 h-4" />
                        <span className="text-xs">{tweet.metrics?.retweet_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 hover:text-pink-500 cursor-pointer transition-colors">
                        <Heart className="w-4 h-4" />
                        <span className="text-xs">{tweet.metrics?.like_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 hover:text-blue-400 cursor-pointer transition-colors">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-xs text-blue-400/70 font-mono">{(tweet.metrics?.retweet_count + tweet.metrics?.like_count) > 100 ? 'HIGH VIRALITY' : 'NORMAL'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-center p-4">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
