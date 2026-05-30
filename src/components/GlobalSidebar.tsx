"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { 
  Clock, 
  LayoutDashboard, 
  Map, 
  Compass, 
  BookOpen,
  Menu,
  X,
  ChevronRight,
  Database,
  Twitter,
  Palette,
  Terminal,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  LogOut,
  History
} from 'lucide-react';

const PUBLIC_ITEMS = [
  { href: '/', icon: Clock, label: 'Portal' },
];

const PROTECTED_ITEMS = [
  { href: '/relocation/wealth', icon: Map, label: 'Relocation Matrix' },
  { href: '/relocation/arbitrage', icon: TrendingUp, label: 'Real Estate Arbitrage' },
  { href: '/relocation/history', icon: History, label: 'Relocation History' },
  { href: '/metaphysical', icon: Compass, label: 'Metaphysical Engine' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Oracle Hub' },
  { href: '/research', icon: Database, label: 'Data Engine' },
  { href: '/knowledge', icon: BookOpen, label: 'Second Brain' },
  { href: '/x-viewer', icon: Twitter, label: 'X Archive' },
  { href: '/visualizer', icon: Palette, label: 'AI Visualizer' },
  { href: '/omni', icon: Terminal, label: 'Omni-Terminal' },
];

export function GlobalSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); // For desktop

  const toggleSidebar = () => setIsOpen(!isOpen);
  const closeSidebar = () => setIsOpen(false);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const sidebarWidth = isCollapsed ? 'lg:w-20' : 'lg:w-64';

  if (pathname?.startsWith('/visualizer/share/')) {
    return null;
  }

  const renderNavItem = (item: typeof PUBLIC_ITEMS[0]) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
    const Icon = item.icon;
    
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeSidebar}
        title={isCollapsed ? item.label : undefined}
        className={`
          flex items-center justify-between px-3 py-3 rounded-xl transition-all group
          ${isActive 
            ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' 
            : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'
          }
          ${isCollapsed ? 'justify-center' : ''}
        `}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className={`shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
          {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>}
        </div>
        {!isCollapsed && isActive && <ChevronRight size={16} className="text-indigo-400/50 shrink-0" />}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      <button 
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`
          fixed top-0 left-0 h-full z-40
          bg-zinc-950 border-r border-white/5
          w-64 ${sidebarWidth} transition-all duration-300 ease-in-out
          flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo Area */}
        <div className={`h-20 flex items-center border-b border-white/5 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-6'}`}>
          <div className="flex items-center gap-3 text-white">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5 text-indigo-400" />
            </div>
            {!isCollapsed && <span className="font-bold tracking-widest uppercase text-sm whitespace-nowrap overflow-hidden transition-all">Meta-Hub</span>}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {/* Public Space */}
          {!isCollapsed && (
            <div className="px-3 mb-2 text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
              Public Space
            </div>
          )}
          {PUBLIC_ITEMS.map(renderNavItem)}

          {/* Secure Engine Space */}
          <div className="my-4 border-t border-white/5" />
          {!isCollapsed && (
            <div className="px-3 mb-2 text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
              Secure Engines
            </div>
          )}
          {PROTECTED_ITEMS.map(renderNavItem)}
        </nav>

        {/* Footer Area */}
        <div className="p-4 border-t border-white/5 bg-zinc-950 z-10 shrink-0 flex flex-col gap-2">
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className={`flex items-center text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-2 rounded-lg transition-colors ${isCollapsed ? 'justify-center' : 'justify-start gap-3'}`}
            title={isCollapsed ? "ログアウト" : "ログアウト"}
          >
            <LogOut size={18} />
            {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">ログアウト</span>}
          </button>

          {/* Collapse Toggle for Desktop */}
          <button
            onClick={toggleCollapse}
            className={`hidden lg:flex items-center text-zinc-400 hover:text-zinc-200 p-2 rounded-lg hover:bg-white/5 transition-colors ${isCollapsed ? 'justify-center' : 'justify-start gap-3'}`}
            title={isCollapsed ? "メニューを展開" : "メニューを閉じる"}
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">メニューを閉じる</span>}
          </button>

          {/* Status */}
          <div className={`px-3 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`} title="システム稼働中">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            {!isCollapsed && <span className="text-[10px] text-zinc-400 font-medium tracking-widest uppercase whitespace-nowrap">システム稼働中</span>}
          </div>

          {/* Creator Signature */}
          {!isCollapsed && (
            <div className="text-[9px] text-zinc-600 font-mono text-center tracking-wider mt-1 select-none">
              Engineered by <span className="text-zinc-500 font-medium hover:text-indigo-400 transition-colors">M. Ishibashi</span>
            </div>
          )}
        </div>
      </aside>

      {/* Invisible Spacer for Layout (Desktop Only) */}
      <div className={`hidden lg:block shrink-0 transition-[width] duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`} />
    </>
  );
}
