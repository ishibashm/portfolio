"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import {
  Clock,
  LayoutDashboard,
  Map,
  Compass,
  BookOpen,
  Menu,
  X,
  ChevronRight,
  Twitter,
  Activity,
  Terminal,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  LogOut,
  History,
  Route,
  Rss,
  Home,
  Calendar,
  Globe,
  ExternalLink,
} from "lucide-react";

const PUBLIC_ITEMS = [
  { href: "/", icon: Clock, label: "Portal" },
];

const PROTECTED_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Oracle Hub (Launcher)" },
  { href: "/metaphysical", icon: Compass, label: "Fortune & Time (fortune.)" },
  { href: "/trends", icon: Rss, label: "Tech & Trends (tech.)" },
  { href: "/rentals", icon: Home, label: "Rentals & Real Estate" },
  { href: "/relocation/wealth", icon: Map, label: "Relocation Matrix" },
  { href: "/relocation/arbitrage", icon: TrendingUp, label: "Real Estate Arbitrage" },
  { href: "/relocation/simulator", icon: Route, label: "Relocation Simulator" },
  { href: "https://katmer.cloud-palette.com", icon: BookOpen, label: "Katmer Cloud", external: true },
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
    router.push("/login");
    router.refresh();
  };

  const sidebarWidth = isCollapsed ? "lg:w-20" : "lg:w-64";

  if (pathname?.startsWith("/visualizer/share/")) {
    return null;
  }

  const renderNavItem = (item: (typeof PROTECTED_ITEMS)[0]) => {
    const isActive =
      !item.external &&
      (pathname === item.href ||
        (item.href !== "/" && pathname?.startsWith(item.href)));
    const Icon = item.icon;

    if (item.external) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeSidebar}
          title={isCollapsed ? item.label : undefined}
          className={`
            flex items-center justify-between px-3 py-3 rounded-xl transition-all group
            text-amber-700 hover:bg-amber-100/80 hover:text-amber-800 border border-amber-200/80 bg-amber-50/80
            ${isCollapsed ? "justify-center" : ""}
          `}
        >
          <div className="flex items-center gap-3">
            <Icon
              size={18}
              className="shrink-0 text-amber-500 group-hover:scale-110 transition-transform"
            />
            {!isCollapsed && (
              <span className="text-sm font-semibold whitespace-nowrap">
                {item.label}
              </span>
            )}
          </div>
          {!isCollapsed && (
            <ExternalLink size={14} className="text-amber-500/70 shrink-0" />
          )}
        </a>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeSidebar}
        title={isCollapsed ? item.label : undefined}
        className={`
          flex items-center justify-between px-3.5 py-3 rounded-2xl transition-all group font-medium text-xs
          ${
            isActive
              ? "bg-rose-500 text-white shadow-md shadow-rose-200"
              : "text-stone-600 hover:bg-rose-50 hover:text-stone-900"
          }
          ${isCollapsed ? "justify-center" : ""}
        `}
      >
        <div className="flex items-center gap-3">
          <Icon
            size={18}
            className={`shrink-0 ${isActive ? "text-white" : "text-stone-400 group-hover:text-rose-500 transition-colors"}`}
          />
          {!isCollapsed && (
            <span className="whitespace-nowrap">
              {item.label}
            </span>
          )}
        </div>
        {!isCollapsed && isActive && (
          <ChevronRight size={16} className="text-white/70 shrink-0" />
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white/90 backdrop-blur-xl border border-rose-100 rounded-xl text-stone-500 hover:text-rose-500 shadow-md shadow-rose-100/40"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-stone-900/30 backdrop-blur-sm z-40"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-40
          bg-white/95 backdrop-blur-2xl border-r border-rose-100/80 shadow-2xl shadow-rose-100/40
          w-64 ${sidebarWidth} transition-all duration-300 ease-in-out
          flex flex-col
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Logo Area */}
        <div
          className={`h-20 flex items-center border-b border-rose-100/60 transition-all duration-300 ${isCollapsed ? "justify-center px-0" : "px-6"}`}
        >
          <div className="flex items-center gap-3 text-stone-900">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-200">
              <Compass className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <span className="font-serif font-bold text-lg tracking-tight text-stone-900 whitespace-nowrap overflow-hidden transition-all">
                Cloud Palette
              </span>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {/* Public Space */}
          {!isCollapsed && (
            <div className="px-3 mb-2 text-[9px] font-mono tracking-widest text-stone-400 uppercase">
              Public Space
            </div>
          )}
          {PUBLIC_ITEMS.map(renderNavItem)}

          {/* Secure Engine Space */}
          <div className="my-4 border-t border-rose-100/60" />
          {!isCollapsed && (
            <div className="px-3 mb-2 text-[9px] font-mono tracking-widest text-stone-400 uppercase">
              Secure Engines
            </div>
          )}
          {PROTECTED_ITEMS.map(renderNavItem)}
        </nav>

        {/* Footer Area */}
        <div className="p-4 border-t border-rose-100/60 bg-white/60 z-10 shrink-0 flex flex-col gap-2">
          {/* PWA App Install Widget */}
          {!isCollapsed && <PWAInstallPrompt />}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className={`flex items-center text-rose-500 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-colors ${isCollapsed ? "justify-center" : "justify-start gap-3"}`}
            title={isCollapsed ? "ログアウト" : "ログアウト"}
          >
            <LogOut size={18} />
            {!isCollapsed && (
              <span className="text-sm font-medium whitespace-nowrap">
                ログアウト
              </span>
            )}
          </button>

          {/* Collapse Toggle for Desktop */}
          <button
            onClick={toggleCollapse}
            className={`hidden lg:flex items-center text-stone-400 hover:text-stone-700 p-2 rounded-xl hover:bg-stone-100/80 transition-colors ${isCollapsed ? "justify-center" : "justify-start gap-3"}`}
            title={isCollapsed ? "メニューを展開" : "メニューを閉じる"}
          >
            {isCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            {!isCollapsed && (
              <span className="text-sm font-medium whitespace-nowrap">
                メニューを閉じる
              </span>
            )}
          </button>

          {/* Status */}
          <div
            className={`px-3 py-3 rounded-xl bg-emerald-50/80 border border-emerald-100 flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}
            title="システム稼働中"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            {!isCollapsed && (
              <span className="text-[10px] text-emerald-700 font-medium tracking-widest uppercase whitespace-nowrap">
                システム稼働中
              </span>
            )}
          </div>

          {/* Creator Signature */}
          {!isCollapsed && (
            <div className="text-[9px] text-stone-400 font-mono text-center tracking-wider mt-1 select-none">
              Engineered by{" "}
              <span className="text-stone-500 font-medium hover:text-rose-500 transition-colors">
                M. Ishibashi
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Invisible Spacer for Layout (Desktop Only) */}
      <div
        className={`hidden lg:block shrink-0 transition-[width] duration-300 ease-in-out ${isCollapsed ? "w-20" : "w-64"}`}
      />
    </>
  );
}
