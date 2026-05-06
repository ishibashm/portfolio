"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Clock, 
  LayoutDashboard, 
  Map, 
  Compass, 
  BookOpen,
  Menu,
  X,
  ChevronRight
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', icon: Clock, label: 'Portal' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Oracle Hub' },
  { href: '/relocation/wealth', icon: Map, label: 'Relocation Matrix' },
  { href: '/metaphysical', icon: Compass, label: 'Metaphysical Engine' },
  { href: '/knowledge', icon: BookOpen, label: 'Second Brain' },
];

export function GlobalSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const closeSidebar = () => setIsOpen(false);

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
          w-64 transition-transform duration-300 ease-in-out
          flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo Area */}
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <div className="flex items-center gap-3 text-white">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center">
              <Compass className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="font-bold tracking-widest uppercase text-sm">Meta-Hub</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSidebar}
                className={`
                  flex items-center justify-between px-3 py-3 rounded-xl transition-all group
                  ${isActive 
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' 
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className={isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'} />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                {isActive && <ChevronRight size={16} className="text-indigo-400/50" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer Area */}
        <div className="p-4 border-t border-white/5">
          <div className="px-3 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-zinc-400 font-medium tracking-widest uppercase">System Online</span>
          </div>
        </div>
      </aside>
    </>
  );
}
