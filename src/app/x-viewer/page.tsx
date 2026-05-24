'use client';

import React, { useState, useEffect, useMemo } from 'react';
import TweetCard from '@/components/x-viewer/TweetCard';
import { Search, Loader2, ArrowDownAZ, ArrowUpZA, Image as ImageIcon, LayoutList } from 'lucide-react';

export default function XViewerPage() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  
  // New State for Display Options
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); // desc = newest first, asc = oldest first
  const [viewMode, setViewMode] = useState<'timeline' | 'gallery'>('timeline');

  useEffect(() => {
    fetch('/api/x-viewer/accounts')
      .then(res => res.json())
      .then(data => {
        setAccounts(data.accounts || []);
        setLoadingAccounts(false);
        if (data.accounts && data.accounts.length > 0) {
          handleSelectAccount(data.accounts[0]);
        }
      })
      .catch(err => {
        console.error('Failed to load accounts', err);
        setLoadingAccounts(false);
      });
  }, []);

  const handleSelectAccount = (handle: string) => {
    setSelectedAccount(handle);
    setLoadingPosts(true);
    setPostSearchQuery(''); // Reset search on account change
    setViewMode('timeline'); // Reset to default view
    fetch(`/api/x-viewer/posts?handle=${encodeURIComponent(handle)}`)
      .then(res => res.json())
      .then(data => {
        setPosts(data.posts || []);
        setLoadingPosts(false);
      })
      .catch(err => {
        console.error('Failed to load posts', err);
        setLoadingPosts(false);
      });
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.toLowerCase().includes(accountSearchQuery.toLowerCase())
  );

  // Derived state for posts (Filtered & Sorted)
  const displayedPosts = useMemo(() => {
    let result = [...posts];

    // Filter by keyword
    if (postSearchQuery) {
      const q = postSearchQuery.toLowerCase();
      result = result.filter(p => {
        const textMatch = typeof p.text === 'string' && p.text.toLowerCase().includes(q);
        return textMatch;
      });
    }

    // Filter by Gallery Mode (only show posts with media)
    if (viewMode === 'gallery') {
      result = result.filter(p => Array.isArray(p.saved_media) && p.saved_media.length > 0);
    }

    // Sort
    result.sort((a, b) => {
      const timeA = new Date((a.datetime as string) || 0).getTime();
      const timeB = new Date((b.datetime as string) || 0).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [posts, postSearchQuery, sortOrder, viewMode]);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden font-sans">
      {/* Sidebar: Accounts List */}
      <div className="w-64 md:w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full bg-white dark:bg-gray-900 z-20 shadow-sm">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h1 className="text-xl font-bold mb-4 tracking-tight">保存されたXアカウント</h1>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 bg-gray-100 dark:bg-gray-800 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-950 rounded-lg text-sm transition-colors outline-none"
              placeholder="アカウントを検索..."
              value={accountSearchQuery}
              onChange={(e) => setAccountSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loadingAccounts ? (
            <div className="flex justify-center p-8">
              <Loader2 className="animate-spin text-blue-500" />
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">アカウントが見つかりません</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              <li>
                <button
                  onClick={() => handleSelectAccount('ALL')}
                  className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center space-x-3 ${selectedAccount === 'ALL' ? 'bg-blue-50 dark:bg-blue-900/20 border-r-4 border-blue-500' : ''}`}
                >
                   <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white flex-shrink-0 shadow-sm">
                      <LayoutList size={20} />
                    </div>
                    <div className="truncate">
                      <p className={`font-semibold text-sm truncate ${selectedAccount === 'ALL' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>すべてのアカウント</p>
                      <p className="text-xs text-gray-500 truncate">グローバルタイムライン</p>
                    </div>
                </button>
              </li>
              {filteredAccounts.map(account => (
                <li key={account}>
                  <button
                    onClick={() => handleSelectAccount(account)}
                    className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center space-x-3 ${selectedAccount === account ? 'bg-blue-50 dark:bg-blue-900/20 border-r-4 border-blue-500' : ''}`}
                  >
                     <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 flex items-center justify-center font-bold text-blue-600 dark:text-blue-300 flex-shrink-0 shadow-sm">
                        {account.charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <p className={`font-semibold text-sm truncate ${selectedAccount === account ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>{account}</p>
                        <p className="text-xs text-gray-500 truncate">@{account}</p>
                      </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Main Content: Timeline */}
      <div className="flex-1 flex flex-col h-full relative max-w-4xl mx-auto w-full bg-white dark:bg-gray-950 shadow-xl border-x border-gray-200 dark:border-gray-800">
        {selectedAccount ? (
          <>
            {/* Top Toolbar */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md z-30 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">@{selectedAccount}</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
                    {displayedPosts.length} 件のポスト
                  </span>
                </div>
                
                {/* View Controls */}
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                  <button
                    onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-white dark:hover:bg-gray-700 shadow-sm transition-all text-gray-700 dark:text-gray-300"
                    title={sortOrder === 'desc' ? "新しい順 (降順)" : "時系列 (昇順)"}
                  >
                    {sortOrder === 'desc' ? <ArrowDownAZ size={16} /> : <ArrowUpZA size={16} />}
                    <span className="hidden sm:inline">{sortOrder === 'desc' ? "最新" : "時系列"}</span>
                  </button>
                  <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                  <button
                    onClick={() => setViewMode('timeline')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'timeline' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    title="タイムライン表示"
                  >
                    <LayoutList size={18} />
                  </button>
                  <button
                    onClick={() => setViewMode('gallery')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'gallery' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    title="メディアギャラリー"
                  >
                    <ImageIcon size={18} />
                  </button>
                </div>
              </div>

              {/* Keyword Search */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 focus:border-blue-500 rounded-lg text-sm transition-colors outline-none"
                  placeholder="ポスト本文をキーワード検索..."
                  value={postSearchQuery}
                  onChange={(e) => setPostSearchQuery(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto relative bg-gray-50 dark:bg-gray-950">
              {loadingPosts ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                </div>
              ) : displayedPosts.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-gray-500 h-64">
                  <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-full mb-3">
                    <Search className="w-8 h-8 text-gray-400" />
                  </div>
                  <p>条件に一致するポストがありません</p>
                </div>
              ) : (
                viewMode === 'gallery' ? (
                  // Gallery View
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {displayedPosts.map((post, index) => {
                      const medias = post.saved_media as string[] | undefined;
                      if (!medias || medias.length === 0) return null;
                      const normalizedPath = medias[0].replace(/\\/g, '/');
                      const mediaUrl = `/api/local-media?path=${encodeURIComponent(normalizedPath)}`;
                      
                      return (
                        <div key={(post.id as string) || index} className="group relative aspect-square rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mediaUrl} alt="Gallery item" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <p className="text-white text-xs line-clamp-2 text-shadow-sm">{post.text as string}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Timeline View
                  <div className="pb-20 relative px-4 sm:px-8 pt-4">
                    {/* Visual Timeline Line */}
                    <div className="absolute left-8 sm:left-12 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block"></div>
                    
                    <div className="space-y-6">
                      {displayedPosts.map((post, index) => (
                        <div key={(post.id as string) || index} className="relative z-10">
                          {/* Timeline Dot */}
                          <div className="absolute -left-5 sm:-left-5 top-8 w-2 h-2 rounded-full bg-blue-400 ring-4 ring-gray-50 dark:ring-gray-950 hidden sm:block shadow-sm"></div>
                          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow">
                            <TweetCard post={post as any} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-gray-50 dark:bg-gray-950">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-900 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-gray-200 dark:border-gray-800">
              <span className="text-2xl">📱</span>
            </div>
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">アカウントを選択してください</p>
            <p className="text-sm mt-1">サイドバーからアカウントを選択してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
